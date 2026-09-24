import asyncio
import json
import os
import subprocess
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from deep_agent.nexus_llm import (
    ProviderConfig,
    NexusSettings,
    load_settings,
    save_settings,
    test_llm_connection,
    get_chat_model
)
from deep_agent.nexus_workspace import workspace_mgr
from deep_agent.nexus_experience import experience_network, Experience
from deep_agent.nexus_git import get_git_status, git_stage_all_and_commit, get_git_diff
from deep_agent.nexus_graph import create_nexus_graph

from contextlib import asynccontextmanager

# ------------------------------------------------------------
# WEBSOCKET LOGGING & REAL-TIME BROADCAST
# ------------------------------------------------------------
active_connections: List[WebSocket] = []
event_loop: Optional[asyncio.AbstractEventLoop] = None

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
    payload = json.dumps({
        "type": event_type,
        "text": text,
        "data": data or {}
    })
    
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
# API: LLM CONFIG & SETTINGS
# ------------------------------------------------------------
@app.get("/api/settings")
async def get_settings():
    return load_settings().dict()

@app.post("/api/settings")
async def update_settings(settings: NexusSettings):
    save_settings(settings)
    return {"status": "saved", "settings": settings.dict()}

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
        "recent": workspace_mgr.recent_projects
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

@app.get("/api/workspace/tree")
async def get_workspace_tree():
    return workspace_mgr.get_file_tree()

class FileContentRequest(BaseModel):
    path: str
    content: str

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

class EntryOpRequest(BaseModel):
    path: str
    new_path: Optional[str] = None

@app.post("/api/workspace/delete")
async def delete_entry(req: EntryOpRequest):
    try:
        workspace_mgr.delete_entry(req.path)
        return {"status": "deleted", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/workspace/mkdir")
async def mkdir(req: EntryOpRequest):
    try:
        workspace_mgr.create_directory(req.path)
        return {"status": "created", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/workspace/rename")
async def rename_entry(req: EntryOpRequest):
    try:
        if not req.new_path:
            raise HTTPException(status_code=400, detail="Missing new_path")
        workspace_mgr.rename_entry(req.path, req.new_path)
        return {"status": "renamed", "from": req.path, "to": req.new_path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/workspace/search")
async def search_workspace(q: str = Query(...)):
    return workspace_mgr.search_workspace(q)

# ------------------------------------------------------------
# API: TERMINAL EXECUTION (RELATIVE TO ACTIVE PROJECT)
# ------------------------------------------------------------
class TerminalRunRequest(BaseModel):
    command: str

@app.post("/api/terminal/run")
async def run_terminal_command(req: TerminalRunRequest):
    cwd = workspace_mgr.active_project_path
    broadcast_event("terminal_input", f"$ {req.command}")
    try:
        res = subprocess.run(
            req.command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=60
        )
        out = (res.stdout or "") + (res.stderr or "")
        broadcast_event("terminal_output", out, {"code": res.returncode})
        return {
            "stdout": res.stdout,
            "stderr": res.stderr,
            "code": res.returncode
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out after 60s", "code": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "code": -1}

# ------------------------------------------------------------
# API: GIT FOUNDATIONS
# ------------------------------------------------------------
@app.get("/api/git/status")
async def git_status():
    return get_git_status(workspace_mgr.active_project_path)

class GitCommitRequest(BaseModel):
    message: str

@app.post("/api/git/commit")
async def git_commit(req: GitCommitRequest):
    return git_stage_all_and_commit(workspace_mgr.active_project_path, req.message)

@app.get("/api/git/diff")
async def git_diff(path: str = Query("")):
    return {"diff": get_git_diff(workspace_mgr.active_project_path, path)}

# ------------------------------------------------------------
# API: NEXUSAI EXPERIENCE NETWORK
# ------------------------------------------------------------
@app.get("/api/experience/search")
async def search_experiences(q: str = Query("")):
    return experience_network.search(q)

@app.post("/api/experience/publish")
async def publish_experience(exp: Experience):
    res = experience_network.publish(exp)
    return res

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
    
    # Retrieve relevant experiences from Nexus Network
    exps = experience_network.search(req.prompt)[:2]
    exp_summary = "\n".join([f"- {e.title}: {e.solution}" for e in exps]) if exps else ""

    banner = f"\n=== NEXUS AGENT START ===\nProject: {active_path}\nGoal: {req.prompt}\n"
    broadcast_event("agent_started", banner, {"prompt": req.prompt, "project": active_path})

    graph = create_nexus_graph(
        project_path=active_path,
        provider_config=settings.ai,
        event_emitter=broadcast_event
    )

    initial_state = {
        "user_request": req.prompt,
        "project_path": active_path,
        "repair_attempts": 0,
        "max_repair_attempts": settings.agent.get("max_repair_attempts", 3),
        "auto_repair": req.auto_repair,
        "relevant_experiences": exp_summary
    }

    def execute_graph():
        try:
            return True, graph.invoke(initial_state)
        except Exception as e:
            return False, str(e)

    success, result = await asyncio.to_thread(execute_graph)

    broadcast_event("agent_finished", "\n=== NEXUS AGENT COMPLETED ===", {
        "success": success,
        "result": str(result)
    })

    return {
        "success": success,
        "result": result,
        "workspace": active_path
    }

# ------------------------------------------------------------
# PREVIEW ROUTE
# ------------------------------------------------------------
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
# WEBSOCKET STREAM
# ------------------------------------------------------------
@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
    except Exception:
        if websocket in active_connections:
            active_connections.remove(websocket)

# Frontend root directory (where index.html, app.jsx, and style.css live)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if not os.path.exists(os.path.join(BASE_DIR, "index.html")):
    BASE_DIR = os.getcwd()

# ------------------------------------------------------------
# FRONTEND ROUTES — served before static mount
# Babel standalone cannot reliably load external JSX via src=,
# so we inline app.jsx into index.html at serve time.
# ------------------------------------------------------------
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

    # CRITICAL: escape </script> inside JSX string so browser doesn't
    # close the <script> tag early. This is the #1 cause of blank pages.
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

    # Inject error overlay right after <body> opens
    html = html.replace("<body", error_overlay + "\n<body", 1)

    # Replace the external babel script tag with an inline one
    html = html.replace(
        '<script type="text/babel" src="app.jsx"></script>',
        f'<script type="text/babel">\n{jsx_safe}\n</script>'
    )
    return HTMLResponse(content=html)

@app.get("/style.css")
async def serve_css():
    return FileResponse(os.path.join(BASE_DIR, "style.css"), media_type="text/css")

@app.get("/app.jsx")
async def serve_jsx():
    return FileResponse(os.path.join(BASE_DIR, "app.jsx"), media_type="text/javascript")

# Mount static files for any remaining assets (fonts, images, etc)
app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="studio")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("deep_agent.server:app", host="0.0.0.0", port=8000, reload=False)
