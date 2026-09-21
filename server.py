import asyncio
import json
import os
import subprocess
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from deepagents import create_deep_agent
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.tools import tool
from langchain_openrouter import ChatOpenRouter

load_dotenv()

app = FastAPI(title="NexusAI Enterprise Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Output directory where the agent creates the web application
WORKSPACE_DIR = os.path.abspath(os.path.join(os.getcwd(), "sandbox_app"))
os.makedirs(WORKSPACE_DIR, exist_ok=True)

# ------------------------------------------------------------
# LOGGING & WEBSOCKET EVENT BROADCASTING
# ------------------------------------------------------------
active_connections: List[WebSocket] = []
event_loop: Optional[asyncio.AbstractEventLoop] = None

def broadcast_event_sync(event_type: str, text: str, data: dict = None):
    """Safely queue broadcast to all active websockets with raw terminal text."""
    payload = json.dumps({
        "type": event_type,
        "text": text,
        "data": data or {}
    })
    
    async def _send_all():
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
        asyncio.run_coroutine_threadsafe(_send_all(), event_loop)

# ------------------------------------------------------------
# TOOLS RESTRICTED TO SANDBOX_APP
# ------------------------------------------------------------
@tool
def write_file(filename: str, content: str) -> str:
    """Create or replace a file in the project (e.g. index.html, style.css, app.js)."""
    filename = filename.replace("\\", "/").strip().lstrip("/")
    if not filename:
        return "ERROR: Filename is empty."
    
    normalized = os.path.normpath(filename)
    if normalized.startswith("..") or os.path.isabs(normalized):
        return "ERROR: Invalid file path."

    full_path = os.path.join(WORKSPACE_DIR, normalized)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

    broadcast_event_sync(
        "file_written",
        f"[WRITE FILE] {filename} ({len(content)} bytes)",
        {"filename": filename, "content": content}
    )
    return f"Successfully wrote {filename}"

@tool
def read_file(filename: str) -> str:
    """Read a project file from the sandbox."""
    filename = filename.replace("\\", "/").strip().lstrip("/")
    normalized = os.path.normpath(filename)
    if normalized.startswith("..") or os.path.isabs(normalized):
        return "ERROR: Invalid file path."

    full_path = os.path.join(WORKSPACE_DIR, normalized)
    if not os.path.exists(full_path):
        return f"ERROR: File does not exist: {filename}"

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
            broadcast_event_sync("file_read", f"[READ FILE] {filename}", {"filename": filename})
            return content
    except Exception as e:
        return f"ERROR: Could not read file: {e}"

@tool
def list_files() -> str:
    """List all project files inside the sandbox application directory."""
    files = []
    for root, _, filenames in os.walk(WORKSPACE_DIR):
        for f in filenames:
            rel = os.path.relpath(os.path.join(root, f), WORKSPACE_DIR)
            files.append(rel.replace("\\", "/"))
    file_list_str = "\n".join(sorted(files)) if files else "PROJECT IS EMPTY"
    broadcast_event_sync("files_listed", f"[LIST FILES]\n{file_list_str}", {"files": files})
    return file_list_str

@tool
def run_command(command: str) -> str:
    """Run a development command inside the sandbox."""
    broadcast_event_sync("command_running", f"[AGENT RUNNING] {command}", {"command": command})
    try:
        res = subprocess.run(
            command,
            shell=True,
            cwd=WORKSPACE_DIR,
            capture_output=True,
            text=True,
            timeout=25
        )
        out = [f"EXIT CODE: {res.returncode}"]
        if res.stdout: out.append(f"STDOUT:\n{res.stdout}")
        if res.stderr: out.append(f"STDERR:\n{res.stderr}")
        output_str = "\n".join(out)
        broadcast_event_sync("command_finished", output_str, {"exit_code": res.returncode})
        return output_str
    except Exception as e:
        err_str = f"ERROR: {e}"
        broadcast_event_sync("command_error", err_str, {"error": str(e)})
        return err_str

# ------------------------------------------------------------
# REAL-TIME AGENT CALLBACK HANDLER
# ------------------------------------------------------------
class AgentStreamingCallbackHandler(BaseCallbackHandler):
    """Listens to LangChain / LLM execution events and streams them like main.py."""
    
    def on_llm_start(self, serialized: Dict[str, Any], prompts: List[str], **kwargs: Any) -> None:
        broadcast_event_sync("reasoning_step", "[REASONING] Analyzing requirements & drafting solution plan...", {"step": "plan"})

    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs: Any) -> None:
        name = serialized.get("name", "tool")
        broadcast_event_sync("tool_call_start", f"[TOOL CALL] {name}\nINPUT: {input_str[:160]}", {
            "tool": name,
            "input": input_str[:200]
        })

    def on_tool_end(self, output: Any, **kwargs: Any) -> None:
        out_summary = str(output).strip()
        if len(out_summary) > 200:
            out_summary = out_summary[:200] + "..."
        broadcast_event_sync("tool_call_end", f"[TOOL RESULT]\n{out_summary}", {"output": str(output)[:200]})

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        broadcast_event_sync("reasoning_step", "[SYNTHESIS] Processing generation results...", {"step": "synthesize"})

# ------------------------------------------------------------
# AGENT SETUP
# ------------------------------------------------------------
def get_agent():
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY missing from .env")

    model = ChatOpenRouter(
        model="openrouter/free",
        temperature=0,
    )
    return create_deep_agent(
        model=model,
        tools=[write_file, read_file, list_files, run_command]
    )

BUILD_PROMPT_TEMPLATE = """You are an autonomous senior software engineer.

You are working inside a local project directory.

The user wants you to build this application:

---

## USER REQUEST

{user_request}

---

## END USER REQUEST

Your job is to turn the user's request into a complete,
working web application.

============================================================
GENERAL REQUIREMENTS
====================

Do NOT assume the application is a calculator.

The user may request ANY type of web application.

Use HTML, CSS, and JavaScript unless the user's request
specifically requires something else.

Prefer vanilla HTML/CSS/JavaScript for simple applications.

============================================================
IMPLEMENT THE ACTUAL APPLICATION
================================

Do not create a static mockup when the user requested an
interactive application.

Actually implement the requested functionality.

For example:

If the user requests a button that performs an action,
the button must actually perform that action.

If the user requests a form, the form must actually work.

If the user requests calculations, the calculations must
actually be correct.

If the user requests persistence, implement persistence.

If local browser persistence is appropriate, localStorage
may be used.

If the user requests search/filtering, implement it.

If the user requests adding/removing/editing items,
implement those operations.

============================================================
USER INTERACTION
================

All interactive UI elements must actually work.

Buttons must respond to mouse clicks.

Interactive controls should also work with touch/click
interaction.

Keyboard support should be added where appropriate.

Do not implement functionality only through keyboard events
when clickable buttons are provided.

============================================================
PROJECT STRUCTURE — CRITICAL
=============================

You MUST create SEPARATE files:

  index.html   — HTML structure only, no inline styles or scripts
  style.css    — ALL styles go here (no <style> tag in HTML)
  script.js    — ALL JavaScript goes here (no <script> in HTML body)

Do NOT put CSS inside a <style> tag in index.html.
Do NOT put JavaScript inside a <script> tag in index.html.

In index.html, link them like this:
  <link rel="stylesheet" href="style.css">
  <script src="script.js" defer></script>

You may create additional files when useful, such as:
  * JavaScript modules
  * data files

Do not create unnecessary files.

============================================================
CODE QUALITY
============

Write clean and understandable code.

Use meaningful variable and function names.

Avoid unnecessary dependencies.

Do not use eval().

Do not put the entire application into one unreadable
JavaScript expression.

Keep HTML, CSS, and JavaScript fully separated into their
own files.

============================================================
TOOLS
=====

Use:

write_file(filename, content)

to create or replace files.

Use:

read_file(filename)

to inspect files.

Use:

list_files()

to inspect the project.

Use:

run_command(command)

for development commands when necessary.

============================================================
IMPORTANT
=========

Actually create the application files.

Do NOT merely explain how to build the application.

Do NOT return a tutorial.

Do NOT just give me code in your final answer.

The files must actually exist in the project directory.

Do not modify external evaluation files.

Do not fake test results.

When the implementation is complete, stop.
"""


# ------------------------------------------------------------
# RUN EVALUATOR / TEST RUNNER (Matches main.py run_tests)
# ------------------------------------------------------------
def run_project_evaluator():
    broadcast_event_sync("terminal_banner", "\n" + "=" * 60 + "\nRUNNING PROJECT EVALUATOR\n" + "=" * 60)
    
    cmd = "uv run python browser_test.py" if os.path.exists("browser_test.py") else "uv run python evaluator.py"
    broadcast_event_sync("terminal_output", f"\n[COMMAND] {cmd}")

    try:
        res = subprocess.run(
            cmd,
            shell=True,
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            timeout=40
        )
        passed = (res.returncode == 0)
        output = (res.stdout or "") + (res.stderr or "")

        status_text = "[PASSED]" if passed else "[FAILED]"
        broadcast_event_sync("terminal_output", status_text)

        report = [
            "",
            "=" * 60,
            "PROJECT TEST REPORT",
            "=" * 60,
            "",
            f"OVERALL STATUS: {'PASSED' if passed else 'FAILED'}",
            "",
            "EVALUATOR OUTPUT:",
            output if output.strip() else "(no output)",
            "=" * 60,
            ""
        ]
        report_str = "\n".join(report)
        broadcast_event_sync("test_report", report_str, {"passed": passed})
        return passed, report_str
    except Exception as e:
        err_msg = f"EVALUATOR ERROR / TIMEOUT: {e}"
        broadcast_event_sync("test_report", err_msg, {"passed": False})
        return False, err_msg

# ------------------------------------------------------------
# API ROUTES
# ------------------------------------------------------------
class PromptRequest(BaseModel):
    prompt: str

@app.post("/api/build")
async def build_app(req: PromptRequest):
    """Trigger the deep agent to build an application matching main.py pipeline."""
    user_prompt = req.prompt
    
    # Send main.py style start banner
    start_banner = (
        "\n" + "=" * 60 + "\n"
        + "AI APP BUILDER\n"
        + "=" * 60 + "\n\n"
        + f"USER REQUEST:\n{user_prompt}\n\n"
        + "=" * 60 + "\n"
        + "STARTING INITIAL BUILD\n"
        + "=" * 60
    )
    broadcast_event_sync("agent_started", start_banner, {"prompt": user_prompt})

    agent = get_agent()
    build_instruction = BUILD_PROMPT_TEMPLATE.format(user_request=user_prompt)
    handler = AgentStreamingCallbackHandler()

    def run_build():
        try:
            res = agent.invoke(
                {"messages": [{"role": "user", "content": build_instruction}]},
                config={
                    "configurable": {"thread_id": "nexus-session"},
                    "callbacks": [handler]
                }
            )
            return True, str(res)
        except Exception as e:
            return False, str(e)

    success, result = await asyncio.to_thread(run_build)

    broadcast_event_sync("terminal_banner", "\n" + "=" * 60 + "\nINITIAL BUILD COMPLETE\n" + "=" * 60)

    # Run tests & verify
    passed, test_report = await asyncio.to_thread(run_project_evaluator)

    if passed:
        success_banner = (
            "\n" + "=" * 60 + "\n"
            + "SUCCESS\n"
            + "=" * 60 + "\n\n"
            + "The application passed the independent evaluator.\n\n"
            + "APPLICATION BUILD COMPLETE."
        )
        broadcast_event_sync("build_success", success_banner)

    # Collect files
    files = {}
    for root, _, filenames in os.walk(WORKSPACE_DIR):
        for f in filenames:
            rel = os.path.relpath(os.path.join(root, f), WORKSPACE_DIR).replace("\\", "/")
            full = os.path.join(root, f)
            try:
                with open(full, "r", encoding="utf-8") as file:
                    files[rel] = file.read()
            except Exception:
                pass

    index_html = files.get("index.html", "")

    finish_banner = "\n" + "=" * 60 + "\nAGENT FINISHED\n" + "=" * 60
    broadcast_event_sync("agent_finished", finish_banner, {
        "success": success,
        "passed": passed,
        "files": list(files.keys())
    })

    return {
        "success": success,
        "passed": passed,
        "result": result,
        "html": index_html,
        "files": files
    }

@app.get("/api/preview")
async def get_preview():
    """Return the generated index.html or empty default."""
    index_file = os.path.join(WORKSPACE_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, media_type="text/html")
    return {"message": "No build generated yet"}

@app.get("/api/files")
async def get_files():
    """Get all current files in sandbox."""
    files = {}
    for root, _, filenames in os.walk(WORKSPACE_DIR):
        for f in filenames:
            rel = os.path.relpath(os.path.join(root, f), WORKSPACE_DIR).replace("\\", "/")
            full = os.path.join(root, f)
            try:
                with open(full, "r", encoding="utf-8") as file:
                    files[rel] = file.read()
            except Exception:
                pass
    return files

@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """Stream live build logs to the React frontend."""
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

@app.on_event("startup")
async def on_startup():
    global event_loop
    event_loop = asyncio.get_running_loop()

# Mount sandbox files
app.mount("/sandbox", StaticFiles(directory=WORKSPACE_DIR, html=True), name="sandbox")

# Mount studio frontend
app.mount("/", StaticFiles(directory=os.getcwd(), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
