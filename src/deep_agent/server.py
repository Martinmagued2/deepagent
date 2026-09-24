import asyncio
import json
import os
import subprocess
import threading
import time
import socket
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from deep_agent.nexus_llm import (
    ProviderConfig,
    NexusSettings,
    load_settings,
    save_settings,
    clear_credentials,
    test_llm_connection,
    get_chat_model,
    get_presets,
)
from deep_agent.nexus_credentials import has_api_key, load_api_key
from deep_agent.nexus_workspace import workspace_mgr
from deep_agent.nexus_experience import experience_network, Experience
from deep_agent.nexus_git import (
    get_git_status,
    git_commit,
    git_stage_all_and_commit,
    get_git_diff,
    stage_file,
    unstage_file,
    stage_all,
    git_pull,
    git_push,
    git_log,
    is_repo,
    init_repo,
)
from deep_agent.nexus_graph import create_nexus_graph

from contextlib import asynccontextmanager

# ------------------------------------------------------------
# WEBSOCKET LOGGING & REAL-TIME BROADCAST
# ------------------------------------------------------------
active_connections: List[WebSocket] = []
event_loop: Optional[asyncio.AbstractEventLoop] = None

# Pending approval requests: {request_id: {tool, command, metadata, future/event}}
pending_approvals: Dict[str, Dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global event_loop
    event_loop = asyncio.get_running_loop()
    yield
    active_connections.clear()


app = FastAPI(title="NexusAI Studio IDE API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def broadcast_event(event_type: str, text: str, data: dict = None):
    payload = json.dumps({"type": event_type, "text": text, "data": data or {}})

    async def _send():
        dead = []
        for ws in list(active_connections):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in active_connections:
                active_connections.remove(ws)

    if event_loop and event_loop.is_running():
        asyncio.run_coroutine_threadsafe(_send(), event_loop)


# ------------------------------------------------------------
# APPROVAL SYSTEM
# ------------------------------------------------------------
def approval_callback(tool_name: str, command: str, metadata: dict) -> bool:
    """Called from a worker thread when the agent wants to run a command.
    Pushes a request to the user via WebSocket and blocks until response."""
    req_id = f"appr-{int(time.time() * 1000)}-{hash(command) & 0xffff:x}"
    event = threading.Event()
    pending_approvals[req_id] = {
        "tool": tool_name,
        "command": command,
        "metadata": metadata,
        "event": event,
        "approved": False,
    }
    # Notify the frontend
    broadcast_event(
        "approval_requested",
        f"Agent wants to run: {command}",
        {"request_id": req_id, "tool": tool_name, "command": command, "metadata": metadata},
    )
    # Block until user responds (with a long timeout)
    event.wait(timeout=600)
    result = pending_approvals.pop(req_id, {})
    return result.get("approved", False)


# ------------------------------------------------------------
# API: LLM CONFIG & SETTINGS
# ------------------------------------------------------------
@app.get("/api/settings")
async def get_settings():
    """Return settings WITHOUT the API key (only a boolean flag)."""
    s = load_settings()
    data = s.dict()
    # Mask the API key — only tell the UI whether one is set
    data["ai"]["api_key"] = ""
    data["ai"]["has_api_key"] = has_api_key()
    return data


@app.post("/api/settings")
async def update_settings(settings: NexusSettings):
    save_settings(settings)
    return {"status": "saved", "has_api_key": has_api_key()}


@app.delete("/api/settings/credentials")
async def delete_credentials():
    clear_credentials()
    return {"status": "cleared", "has_api_key": False}


@app.get("/api/providers/presets")
async def get_provider_presets():
    return get_presets()


@app.post("/api/llm/test")
async def test_llm(config: ProviderConfig):
    res = await test_llm_connection(config)
    return res

# ------------------------------------------------------------
# API: WORKSPACE & PROJECT MANAGEMENT
# ------------------------------------------------------------
class OpenProjectRequest(BaseModel):
    path: str


class CreateProjectRequest(BaseModel):
    name: str
    parent_dir: Optional[str] = None
    template: str = "vanilla"


@app.get("/api/project/active")
async def get_active_project():
    return {
        "path": workspace_mgr.active_project_path,
        "name": os.path.basename(workspace_mgr.active_project_path),
        "recent": workspace_mgr.recent_projects,
    }


@app.post("/api/project/open")
async def open_project(req: OpenProjectRequest):
    res = workspace_mgr.set_active_project(req.path)
    broadcast_event("project_changed", f"Project opened: {req.path}", res)
    return res


@app.post("/api/project/create")
async def create_project(req: CreateProjectRequest):
    res = workspace_mgr.create_project(req.name, req.parent_dir, req.template)
    broadcast_event("project_created", f"Created project: {req.name}", res)
    return res


@app.post("/api/project/close")
async def close_project():
    """Close the active project — just resets to the default sandbox."""
    res = workspace_mgr.set_active_project(
        os.path.join(os.getcwd(), "sandbox_app")
    )
    broadcast_event("project_changed", "Project closed", res)
    return res


@app.get("/api/workspace/tree")
async def get_workspace_tree():
    return workspace_mgr.get_file_tree()


class FileContentRequest(BaseModel):
    path: str
    content: str


class FileCreateRequest(BaseModel):
    path: str
    is_dir: bool = False


class FileRenameRequest(BaseModel):
    path: str
    new_path: str


class FileDeleteRequest(BaseModel):
    path: str


class FilePathRequest(BaseModel):
    path: str


@app.get("/api/workspace/file")
async def read_file(path: str = Query(...)):
    try:
        content = workspace_mgr.read_file(path)
        return {"path": path, "content": content}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/workspace/file")
async def write_file(req: FileContentRequest):
    try:
        workspace_mgr.write_file(req.path, req.content)
        broadcast_event("file_saved", f"Saved {req.path}", {"path": req.path})
        return {"status": "success", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/workspace/create")
async def create_entry(req: FileCreateRequest):
    try:
        if req.is_dir:
            workspace_mgr.create_directory(req.path)
        else:
            workspace_mgr.write_file(req.path, "")
        broadcast_event("file_created", f"Created {req.path}", {"path": req.path, "is_dir": req.is_dir})
        return {"status": "created", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/workspace/delete")
async def delete_entry(req: FileDeleteRequest):
    try:
        workspace_mgr.delete_entry(req.path)
        broadcast_event("file_deleted", f"Deleted {req.path}", {"path": req.path})
        return {"status": "deleted", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/workspace/rename")
async def rename_entry(req: FileRenameRequest):
    try:
        if not req.new_path:
            raise HTTPException(status_code=400, detail="Missing new_path")
        workspace_mgr.rename_entry(req.path, req.new_path)
        broadcast_event("file_renamed", f"Renamed {req.path} → {req.new_path}", {"from": req.path, "to": req.new_path})
        return {"status": "renamed", "from": req.path, "to": req.new_path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/workspace/search")
async def search_workspace(q: str = Query(...)):
    return workspace_mgr.search_workspace(q)

# ------------------------------------------------------------
# API: TERMINAL EXECUTION
# ------------------------------------------------------------
class TerminalRunRequest(BaseModel):
    command: str


@app.post("/api/terminal/run")
async def run_terminal_command(req: TerminalRunRequest):
    cwd = workspace_mgr.active_project_path
    broadcast_event("terminal_input", f"$ {req.command}")
    try:
        res = subprocess.run(
            req.command, shell=True, cwd=cwd,
            capture_output=True, text=True, timeout=180,
        )
        out = (res.stdout or "") + (res.stderr or "")
        broadcast_event("terminal_output", out, {"code": res.returncode})
        return {"stdout": res.stdout, "stderr": res.stderr, "code": res.returncode}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out after 180s", "code": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "code": -1}


# ------------------------------------------------------------
# API: APPROVAL SYSTEM
# ------------------------------------------------------------
class ApprovalResponse(BaseModel):
    request_id: str
    approved: bool
    remember: bool = False


@app.post("/api/approval/respond")
async def respond_to_approval(req: ApprovalResponse):
    """User responds to a pending agent approval request."""
    pending = pending_approvals.get(req.request_id)
    if not pending:
        raise HTTPException(status_code=404, detail="Approval request not found or expired.")
    pending["approved"] = req.approved
    pending["event"].set()
    broadcast_event(
        "approval_responded",
        f"User {'approved' if req.approved else 'denied'}: {pending['command']}",
        {"request_id": req.request_id, "approved": req.approved, "remember": req.remember},
    )
    return {"status": "ok", "approved": req.approved}


# ------------------------------------------------------------
# API: DEV SERVER (PREVIEW)
# ------------------------------------------------------------
dev_servers: Dict[str, Any] = {}  # project_path -> {process, port, started_at}


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@app.post("/api/preview/start")
async def start_dev_server():
    """Start a Vite/npm dev server for the active project on a free port."""
    project = workspace_mgr.active_project_path
    if project in dev_servers:
        return {"status": "already_running", "port": dev_servers[project]["port"]}

    pkg_path = os.path.join(project, "package.json")
    if not os.path.exists(pkg_path):
        return JSONResponse(status_code=400, content={"message": "No package.json in active project."})

    port = find_free_port()
    # Use Vite's --port flag (Vite, Next, etc. all accept --port)
    env = os.environ.copy()
    env["PORT"] = str(port)
    proc = subprocess.Popen(
        f"npm run dev -- --port {port} --host 127.0.0.1",
        shell=True, cwd=project, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    # Wait briefly for port to come up
    for _ in range(30):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                break
        except OSError:
            time.sleep(0.5)
    dev_servers[project] = {"process": proc, "port": port, "started_at": time.time()}
    broadcast_event("dev_server_started", f"Dev server on port {port}", {"port": port})
    return {"status": "started", "port": port, "url": f"http://127.0.0.1:{port}"}


@app.post("/api/preview/stop")
async def stop_dev_server():
    project = workspace_mgr.active_project_path
    info = dev_servers.pop(project, None)
    if not info:
        return {"status": "not_running"}
    try:
        info["process"].terminate()
        info["process"].wait(timeout=5)
    except Exception:
        try:
            info["process"].kill()
        except Exception:
            pass
    broadcast_event("dev_server_stopped", "Dev server stopped", {})
    return {"status": "stopped"}


@app.get("/api/preview/status")
async def dev_server_status():
    project = workspace_mgr.active_project_path
    info = dev_servers.get(project)
    if not info:
        return {"running": False}
    return {
        "running": info["process"].poll() is None,
        "port": info["port"],
        "started_at": info["started_at"],
        "url": f"http://127.0.0.1:{info['port']}",
    }


@app.get("/api/preview")
async def get_preview():
    index_file = os.path.join(workspace_mgr.active_project_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, media_type="text/html")
    return JSONResponse(status_code=404, content={"message": "No index.html found in active project."})


@app.get("/sandbox/{path:path}")
async def get_sandbox_asset(path: str):
    file_path = os.path.join(workspace_mgr.active_project_path, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")


# ------------------------------------------------------------
# API: GIT
# ------------------------------------------------------------
@app.get("/api/git/status")
async def git_status():
    return get_git_status(workspace_mgr.active_project_path)


class GitStageRequest(BaseModel):
    path: str


@app.post("/api/git/stage")
async def git_stage(req: GitStageRequest):
    return stage_file(workspace_mgr.active_project_path, req.path)


@app.post("/api/git/unstage")
async def git_unstage(req: GitStageRequest):
    return unstage_file(workspace_mgr.active_project_path, req.path)


@app.post("/api/git/stage-all")
async def git_stage_all_endpoint():
    return stage_all(workspace_mgr.active_project_path)


class GitCommitRequest(BaseModel):
    message: str


@app.post("/api/git/commit")
async def git_commit_endpoint(req: GitCommitRequest):
    return git_commit(workspace_mgr.active_project_path, req.message)


@app.post("/api/git/pull")
async def git_pull_endpoint():
    return git_pull(workspace_mgr.active_project_path)


@app.post("/api/git/push")
async def git_push_endpoint():
    return git_push(workspace_mgr.active_project_path)


@app.get("/api/git/diff")
async def git_diff(path: str = Query(""), staged: bool = Query(False)):
    return {"diff": get_git_diff(workspace_mgr.active_project_path, path, staged)}


@app.get("/api/git/log")
async def git_log_endpoint():
    return git_log(workspace_mgr.active_project_path)


# ------------------------------------------------------------
# API: NEXUSAI EXPERIENCE NETWORK
# ------------------------------------------------------------
@app.get("/api/experience/search")
async def search_experiences(q: str = Query("")):
    results = experience_network.search(q)
    return [e.dict() for e in results]


class PublishExperienceRequest(BaseModel):
    title: str
    problem: str
    context: str = ""
    solution: str
    environment: str = ""
    tags: List[str] = []


@app.post("/api/experience/publish")
async def publish_experience(req: PublishExperienceRequest):
    exp = Experience(
        title=req.title,
        problem=req.problem,
        context=req.context,
        solution=req.solution,
        environment=req.environment,
        tags=req.tags,
    )
    res = experience_network.publish(exp)
    return res.dict()


@app.post("/api/experience/use")
async def use_experience(body: dict):
    """Inject an experience into the next agent run."""
    exp_id = body.get("id")
    if not exp_id:
        raise HTTPException(status_code=400, detail="Missing experience id")
    results = experience_network.search("")
    for e in results:
        if e.id == exp_id:
            return {"status": "queued", "experience": e.dict()}
    raise HTTPException(status_code=404, detail="Experience not found")


# ------------------------------------------------------------
# API: AI AGENT BUILD & REPAIR PIPELINE
# ------------------------------------------------------------
class AgentBuildRequest(BaseModel):
    prompt: str
    auto_repair: bool = True


@app.post("/api/build")
async def run_agent_build(req: AgentBuildRequest):
    settings = load_settings()
    active_path = workspace_mgr.active_project_path

    # Auto-retrieve experiences
    exps = experience_network.search(req.prompt)[:2]
    exp_summary = experience_network.format_for_agent(req.prompt, limit=2) if exps else ""

    banner = f"\n=== NEXUS AGENT START ===\nProject: {active_path}\nGoal: {req.prompt}\n"
    broadcast_event("agent_started", banner, {"prompt": req.prompt, "project": active_path})

    # Wire approval if require_approval is set
    approval_cb = approval_callback if settings.agent.get("require_approval", True) else None

    graph = create_nexus_graph(
        project_path=active_path,
        provider_config=settings.ai,
        event_emitter=broadcast_event,
        approval_callback=approval_cb,
        enable_browser_testing=settings.agent.get("browser_testing", True),
    )

    initial_state = {
        "user_request": req.prompt,
        "project_path": active_path,
        "repair_attempts": 0,
        "max_repair_attempts": settings.agent.get("max_repair_attempts", 3),
        "auto_repair": req.auto_repair,
        "relevant_experiences": exp_summary,
        "files_changed": [],
        "commands_executed": [],
        "errors": [],
        "started_at": time.time(),
        "finished_at": None,
        "experience_proposal": None,
    }

    def execute_graph():
        try:
            return True, graph.invoke(initial_state)
        except Exception as e:
            return False, str(e)

    success, result = await asyncio.to_thread(execute_graph)

    broadcast_event("agent_finished", "\n=== NEXUS AGENT COMPLETED ===", {
        "success": success,
        "result": str(result)[:1500],
    })

    return {
        "success": success,
        "result": result,
        "workspace": active_path,
    }


# ------------------------------------------------------------
# WEBSOCKET STREAM
# ------------------------------------------------------------
@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            msg = await websocket.receive_text()
            # Allow client to ping/pong
            if msg == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
    except Exception:
        if websocket in active_connections:
            active_connections.remove(websocket)


# ------------------------------------------------------------
# FRONTEND SERVING
# ------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if not os.path.exists(os.path.join(BASE_DIR, "index.html")):
    BASE_DIR = os.getcwd()

from fastapi.responses import HTMLResponse


@app.get("/", response_class=HTMLResponse)
async def serve_root():
    """Serve index.html with app.jsx inlined so Babel can transpile it."""
    index_path = os.path.join(BASE_DIR, "index.html")
    jsx_path = os.path.join(BASE_DIR, "app.jsx")
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(jsx_path, "r", encoding="utf-8") as f:
        jsx = f.read()

    # CRITICAL: escape </script> inside JSX string so browser doesn't close the tag early
    jsx_safe = jsx.replace("</script>", "<\\/script>")

    # Error overlay injected before Babel so any crash is visible on screen
    error_overlay = """<script>
window.__nexus_errors = [];
window.onerror = function(msg, src, line, col, err) {
    var box = document.getElementById('__nexus_err_box');
    if (!box) {
        box = document.createElement('div');
        box.id = '__nexus_err_box';
        box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a0000;color:#ff6b6b;font:13px monospace;padding:16px;white-space:pre-wrap;max-height:50vh;overflow:auto;border-bottom:2px solid #ff0000';
        document.body.appendChild(box);
    }
    box.textContent += '[JS ERROR] ' + msg + '\\n  at ' + src + ':' + line + ':' + col + '\\n\\n';
};
window.addEventListener('unhandledrejection', function(e) {
    window.onerror('Unhandled Promise: ' + (e.reason && e.reason.message || e.reason), 'promise', 0, 0, e.reason);
});
</script>"""

    html = html.replace("<body", error_overlay + "\n<body", 1)

    html = html.replace(
        '<script type="text/babel" src="app.jsx"></script>',
        f'<script type="text/babel">\n{jsx_safe}\n</script>',
    )
    return HTMLResponse(content=html)


@app.get("/style.css")
async def serve_css():
    return FileResponse(os.path.join(BASE_DIR, "style.css"), media_type="text/css")


@app.get("/app.jsx")
async def serve_jsx():
    return FileResponse(os.path.join(BASE_DIR, "app.jsx"), media_type="text/javascript")


app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="studio")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("deep_agent.server:app", host="0.0.0.0", port=8000, reload=False)
