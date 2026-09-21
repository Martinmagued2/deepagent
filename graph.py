import os
import subprocess
from typing import TypedDict, List, Annotated

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

# ============================================================
# PROJECT DIRECTORY
# ============================================================

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
# MODEL (Select a model supporting function calling)
# ============================================================

model = ChatOpenRouter(
    model="google/gemini-2.0-flash-exp:free",
    temperature=0
)

# ============================================================
# PROJECT TOOLS
# ============================================================

@tool
def write_file(filename: str, content: str) -> str:
    """Write content to a file inside the generated application."""
    filename = filename.replace("\\", "/").strip()
    if not filename:
        return "ERROR: Filename is empty."

    normalized = os.path.normpath(filename)
    if normalized.startswith("..") or os.path.isabs(normalized):
        return "ERROR: Invalid file path outside project directory."

    path = os.path.join(PROJECT_DIR, normalized)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w", encoding="utf-8") as file:
        file.write(content)

    return f"Successfully wrote {filename}"


@tool
def read_file(filename: str) -> str:
    """Read a text file from the generated application."""
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
    """List all files inside the generated application."""
    ignored = {".git", ".venv", "__pycache__", "node_modules", "dist", "build"}
    files = []

    for root, directories, filenames in os.walk(PROJECT_DIR):
        directories[:] = [d for d in directories if d not in ignored]
        for filename in filenames:
            path = os.path.join(root, filename)
            relative = os.path.relpath(path, PROJECT_DIR)
            files.append(relative.replace("\\", "/"))

    if not files:
        return "PROJECT IS EMPTY"

    return "\n".join(sorted(files))


@tool
def run_command(command: str) -> str:
    """Run a command inside the generated application directory."""
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
            output.append(f"STDOUT:\n{result.stdout}")
        if result.stderr:
            output.append(f"STDERR:\n{result.stderr}")

        return "\n".join(output)
    except subprocess.TimeoutExpired:
        return "ERROR: Command timed out after 120 seconds."
    except Exception as error:
        return f"ERROR: {error}"

# ============================================================
# DEEP AGENT
# ============================================================

builder_agent = create_deep_agent(
    model=model,
    tools=[write_file, read_file, list_files, run_command]
)

# ============================================================
# PLANNER
# ============================================================

def planner_node(state: AgentState):
    user_request = state["user_request"]

    print("\n" + "=" * 70)
    print("PLANNER")
    print("=" * 70)

    prompt = f"""
You are a senior software architect.
Analyze the user's application request below and create a practical implementation plan.

USER REQUEST:
{user_request}

Return a concise implementation plan covering:
1. Application type & tech stack
2. Core dependencies & build tool
3. File structure
4. Testing & startup requirements
"""
    response = model.invoke([HumanMessage(content=prompt)])
    plan = response.content

    print(f"\n{plan}")
    return {"project_plan": plan}

# ============================================================
# BUILDER
# ============================================================

def builder_node(state: AgentState):
    print("\n" + "=" * 70)
    print("BUILDER AGENT")
    print("=" * 70)

    prompt = f"""
You are an autonomous senior software engineer working in: {PROJECT_DIR}

USER REQUEST:
{state["user_request"]}

ARCHITECTURE PLAN:
{state["project_plan"]}

Use write_file(), read_file(), list_files(), and run_command() to generate the application.
Ensure all files exist and required dependencies are installed.
"""

    builder_agent.invoke({"messages": [{"role": "user", "content": prompt}]})
    return {"status": "built"}

# ============================================================
# BUILD CHECK
# ============================================================

def build_check_node(state: AgentState):
    print("\n" + "=" * 70)
    print("BUILD CHECK")
    print("=" * 70)

    package_json = os.path.join(PROJECT_DIR, "package.json")
    if os.path.exists(package_json):
        print("Detected Node.js project. Running build check...")
        result = subprocess.run(
            "npm run build",
            shell=True,
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )
        output = (result.stdout or "") + (result.stderr or "")

        if result.returncode == 0:
            print("BUILD PASSED")
            return {"test_report": f"BUILD PASSED\n\n{output}"}

        print("BUILD FAILED")
        return {"test_report": f"BUILD FAILED\n\n{output}"}

    print("No package.json detected. Skipping Node build check.")
    return {"test_report": "No package.json detected. Build check skipped."}

# ============================================================
# ROUTER AFTER BUILD
# ============================================================

def route_after_build(state: AgentState):
    report = state.get("test_report", "")
    if "BUILD FAILED" in report:
        return "repair"
    return "evaluate"

# ============================================================
# EVALUATOR
# ============================================================

def evaluator_node(state: AgentState):
    print("\n" + "=" * 70)
    print("EVALUATOR")
    print("=" * 70)

    evaluator_path = os.path.join(os.getcwd(), "evaluator.py")
    if not os.path.exists(evaluator_path):
        print("evaluator.py does not exist. Passing by default.")
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
        output = (result.stdout or "") + (result.stderr or "")

        if result.returncode == 0:
            print("EVALUATION PASSED")
            return {"test_report": output, "status": "passed"}

        print("EVALUATION FAILED")
        return {"test_report": output, "status": "failed"}

    except subprocess.TimeoutExpired:
        return {"test_report": "EVALUATOR TIMED OUT.", "status": "failed"}

# ============================================================
# ROUTER AFTER EVALUATION
# ============================================================

def route_after_evaluation(state: AgentState):
    if state.get("status") == "passed":
        return "done"

    attempts = state.get("repair_attempts", 0)
    max_attempts = state.get("max_repair_attempts", 3)

    if attempts >= max_attempts:
        print("Max repair attempts reached.")
        return "done"

    return "repair"

# ============================================================
# REPAIR
# ============================================================

def repair_node(state: AgentState):
    attempts = state.get("repair_attempts", 0) + 1

    print("\n" + "=" * 70)
    print(f"REPAIR AGENT — ATTEMPT {attempts}")
    print("=" * 70)

    prompt = f"""
The application failed build/evaluation. Diagnose and fix the root cause inside {PROJECT_DIR}.

ORIGINAL REQUEST:
{state["user_request"]}

TEST / BUILD REPORT:
{state.get("test_report", "")}

Use read_file(), write_file(), list_files(), and run_command() to repair the issues.
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

# ============================================================
# RUN GRAPH
# ============================================================

if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("LANGGRAPH AI SOFTWARE ENGINEER")
    print("=" * 70)

    user_request = input("\nWhat should I build?\n\n> ").strip()

    if not user_request:
        raise RuntimeError("No application request was provided.")

    initial_state: AgentState = {
        "user_request": user_request,
        "project_plan": "",
        "test_report": "",
        "status": "starting",
        "repair_attempts": 0,
        "max_repair_attempts": 3
    }

    result = app.invoke(initial_state)

    print("\n" + "=" * 70)
    print("LANGGRAPH FINISHED")
    print("=" * 70)
    print(f"STATUS: {result.get('status')}")
    print(f"REPAIR ATTEMPTS: {result.get('repair_attempts', 0)}")