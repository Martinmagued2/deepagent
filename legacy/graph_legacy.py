import os
import subprocess
from typing import TypedDict

from dotenv import load_dotenv
from langchain_openrouter import ChatOpenRouter
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool

from deepagents import create_deep_agent

# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

if not os.getenv("OPENROUTER_API_KEY"):
    raise RuntimeError("OPENROUTER_API_KEY is missing from .env")

PROJECT_DIR = os.path.join(os.getcwd(), "generated_app")
os.makedirs(PROJECT_DIR, exist_ok=True)

# ============================================================
# GRAPH STATE
# ============================================================

class AgentState(TypedDict, total=False):
    user_request: str
    project_plan: str
    test_report: str
    status: str
    repair_attempts: int
    max_repair_attempts: int

# ============================================================
# MODELS
# ============================================================

fast_model = ChatOpenRouter(
    model="google/gemini-2.0-flash-exp:free",
    temperature=0
)

coding_model = ChatOpenRouter(
    model="meta-llama/llama-3.3-70b-instruct:free",
    temperature=0
)

# ============================================================
# TOOLS
# ============================================================

@tool
def write_file(filename: str, content: str) -> str:
    """Write content directly to a file inside the project directory."""
    filename = filename.replace("\\", "/").strip()
    if not filename:
        return "ERROR: Filename is empty."

    normalized = os.path.normpath(filename)
    if normalized.startswith("..") or os.path.isabs(normalized):
        return "ERROR: Invalid file path."

    path = os.path.join(PROJECT_DIR, normalized)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w", encoding="utf-8") as file:
        file.write(content)

    return f"Successfully wrote {filename}"


@tool
def read_file(filename: str) -> str:
    """Read a text file from the project directory."""
    filename = filename.replace("\\", "/").strip()
    normalized = os.path.normpath(filename)

    if normalized.startswith("..") or os.path.isabs(normalized):
        return "ERROR: Invalid file path."

    path = os.path.join(PROJECT_DIR, normalized)
    if not os.path.exists(path):
        return f"ERROR: File does not exist: {filename}"

    try:
        with open(path, "r", encoding="utf-8") as file:
            return file.read()
    except UnicodeDecodeError:
        return f"ERROR: {filename} is not a text file."


@tool
def list_files() -> str:
    """List all workspace files in the project directory."""
    ignored = {".git", ".venv", "__pycache__", "node_modules", "dist", "build"}
    files = []

    for root, directories, filenames in os.walk(PROJECT_DIR):
        directories[:] = [d for d in directories if d not in ignored]
        for filename in filenames:
            path = os.path.join(root, filename)
            relative = os.path.relpath(path, PROJECT_DIR)
            files.append(relative.replace("\\", "/"))

    return "\n".join(sorted(files)) if files else "PROJECT IS EMPTY"


@tool
def run_command(command: str) -> str:
    """
    Run terminal commands (e.g., npm install, npm run build).
    DO NOT use this tool for 'echo' or log messages. Use write_file() to create files.
    """
    if command.strip().startswith("echo "):
        return "ERROR: Do not use run_command with echo. Stop logging and proceed with write_file()."

    print(f"\n[AGENT COMMAND] {command}")
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )

        output = [f"EXIT CODE: {result.returncode}"]
        if result.stdout:
            stdout_clean = result.stdout[-1500:] if len(result.stdout) > 1500 else result.stdout
            output.append(f"STDOUT:\n{stdout_clean}")

        if result.stderr:
            stderr_clean = result.stderr[-1500:] if len(result.stderr) > 1500 else result.stderr
            output.append(f"STDERR:\n{stderr_clean}")

        return "\n".join(output)
    except subprocess.TimeoutExpired:
        return "ERROR: Command timed out after 120 seconds."
    except Exception as error:
        return f"ERROR: {error}"


# ============================================================
# AGENT DELEGATE
# ============================================================

builder_agent = create_deep_agent(
    model=coding_model,
    tools=[write_file, read_file, list_files, run_command]
)

# ============================================================
# NODES
# ============================================================

def planner_node(state: AgentState):
    print("\n" + "=" * 70)
    print(">>> NODE: PLANNER")
    print("=" * 70)

    prompt = f"Create a concise technical implementation plan for: {state['user_request']}"
    response = fast_model.invoke([HumanMessage(content=prompt)])
    return {"project_plan": response.content, "status": "planned"}


def builder_node(state: AgentState):
    print("\n" + "=" * 70)
    print(">>> NODE: BUILDER")
    print("=" * 70)

    prompt = f"""
You are an autonomous engineer working inside {PROJECT_DIR}.

REQUEST:
{state['user_request']}

PLAN:
{state['project_plan']}

CRITICAL SCAFFOLDING RULES:
1. DO NOT run interactive scaffolding tools like `npm create vite` or `npm init` that wait for terminal input.
2. Instead, create `package.json`, `vite.config.js`, `index.html`, and `src/` files directly using write_file().
3. Include required dependencies (e.g., vite, react, react-dom, tailwindcss, lucide-react, recharts) directly in package.json.
4. Run `npm install` via run_command() after creating package.json.
5. DO NOT run echo commands via run_command().
"""
    builder_agent.invoke({"messages": [{"role": "user", "content": prompt}]})
    return {"status": "built"}


def build_check_node(state: AgentState):
    print("\n" + "=" * 70)
    print(">>> NODE: BUILD CHECK")
    print("=" * 70)

    package_json = os.path.join(PROJECT_DIR, "package.json")
    if os.path.exists(package_json):
        result = subprocess.run(
            "npm run build",
            shell=True,
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )
        output = ((result.stdout or "") + (result.stderr or ""))[-1500:]
        if result.returncode == 0:
            print("BUILD PASSED")
            return {"test_report": f"BUILD PASSED\n\n{output}"}
        
        print("BUILD FAILED")
        return {"test_report": f"BUILD FAILED\n\n{output}"}

    print("No package.json detected. Build check skipped.")
    return {"test_report": "No package.json detected. Build check skipped."}


def route_after_build(state: AgentState):
    report = state.get("test_report", "")
    if "BUILD FAILED" in report:
        print(">>> ROUTER: Build failed -> Routing to REPAIR")
        return "repair"
    print(">>> ROUTER: Build passed/skipped -> Routing to EVALUATOR")
    return "evaluate"


def evaluator_node(state: AgentState):
    print("\n" + "=" * 70)
    print(">>> NODE: EVALUATOR")
    print("=" * 70)

    evaluator_path = os.path.join(os.getcwd(), "evaluator.py")
    if not os.path.exists(evaluator_path):
        print("evaluator.py not found. Skipping.")
        return {"test_report": "EVALUATOR NOT FOUND - SKIPPED", "status": "passed"}

    try:
        result = subprocess.run(
            "uv run python evaluator.py",
            shell=True,
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            timeout=180
        )
        output = ((result.stdout or "") + (result.stderr or ""))[-1500:]
        if result.returncode == 0:
            print("EVALUATION PASSED")
            return {"test_report": output, "status": "passed"}

        print("EVALUATION FAILED")
        return {"test_report": output, "status": "failed"}

    except subprocess.TimeoutExpired:
        return {"test_report": "EVALUATOR TIMED OUT.", "status": "failed"}


def route_after_evaluation(state: AgentState):
    if state.get("status") == "passed":
        print(">>> ROUTER: Evaluation passed -> Terminating graph (END)")
        return "done"

    attempts = state.get("repair_attempts", 0)
    max_attempts = state.get("max_repair_attempts", 3)

    if attempts >= max_attempts:
        print(f">>> ROUTER: Reached max repair attempts ({max_attempts}) -> Terminating graph (END)")
        return "done"

    print(f">>> ROUTER: Evaluation failed -> Routing to REPAIR (Attempt {attempts + 1}/{max_attempts})")
    return "repair"


def repair_node(state: AgentState):
    attempts = state.get("repair_attempts", 0) + 1
    print("\n" + "=" * 70)
    print(f">>> NODE: REPAIR (ATTEMPT {attempts})")
    print("=" * 70)

    report = state.get("test_report", "")[-1200:]
    prompt = f"""
Fix the failing application in {PROJECT_DIR}.

REQUEST:
{state['user_request']}

FAILURE REPORT:
{report}

1. Inspect project files with list_files() and read_file().
2. Fix root causes using write_file().
3. Do NOT execute echo commands.
"""
    builder_agent.invoke({"messages": [{"role": "user", "content": prompt}]})
    return {"repair_attempts": attempts, "status": "repairing"}


# ============================================================
# GRAPH CONSTRUCTION
# ============================================================

graph_builder = StateGraph(AgentState)

graph_builder.add_node("planner", planner_node)
graph_builder.add_node("builder", builder_node)
graph_builder.add_node("build_check", build_check_node)
graph_builder.add_node("evaluator", evaluator_node)
graph_builder.add_node("repair", repair_node)

graph_builder.add_edge(START, "planner")
graph_builder.add_edge("planner", "builder")
graph_builder.add_edge("builder", "build_check")

graph_builder.add_conditional_edges(
    "build_check",
    route_after_build,
    {"evaluate": "evaluator", "repair": "repair"}
)

graph_builder.add_conditional_edges(
    "evaluator",
    route_after_evaluation,
    {"done": END, "repair": "repair"}
)

graph_builder.add_edge("repair", "build_check")

app = graph_builder.compile()