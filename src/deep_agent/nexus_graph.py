import os
import subprocess
from typing import TypedDict, Optional, Callable, Dict, Any

from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage
from deepagents import create_deep_agent

from deep_agent.nexus_tools import build_agent_tools
from deep_agent.nexus_llm import get_chat_model, load_settings, ProviderConfig

class AgentWorkflowState(TypedDict, total=False):
    user_request: str
    project_path: str
    project_plan: str
    test_report: str
    status: str
    repair_attempts: int
    max_repair_attempts: int
    auto_repair: bool
    relevant_experiences: str

def create_nexus_graph(
    project_path: str,
    provider_config: Optional[ProviderConfig] = None,
    event_emitter: Optional[Callable[[str, str, dict], None]] = None
):
    model = get_chat_model(provider_config)
    tools = build_agent_tools(project_path, event_emitter)
    deep_agent = create_deep_agent(model=model, tools=tools)

    def emit(event_type: str, text: str, data: dict = None):
        if event_emitter:
            event_emitter(event_type, text, data or {})

    def planner_node(state: AgentWorkflowState):
        emit("agent_step", "Analyzing workspace & generating technical implementation plan...", {"step": "planner"})
        exp_context = f"\nRelevant Verified Experiences:\n{state.get('relevant_experiences')}" if state.get('relevant_experiences') else ""
        prompt = f"""You are the senior software architect of NexusAI.
Project Path: {state['project_path']}
User Request: {state['user_request']}{exp_context}

Provide a concise, actionable multi-step plan to implement this application. Specify files to create, structure, and libraries needed."""
        try:
            res = model.invoke([HumanMessage(content=prompt)])
            plan_text = res.content if hasattr(res, "content") else str(res)
        except Exception as e:
            plan_text = f"1. Analyze existing workspace\n2. Implement application files\n3. Validate build\n(Fallback plan due to: {e})"

        emit("plan_ready", f"Plan generated:\n{plan_text}", {"plan": plan_text})
        return {"project_plan": plan_text, "status": "planned"}

    def builder_node(state: AgentWorkflowState):
        emit("agent_step", "Executing implementation plan & creating project files...", {"step": "builder"})
        prompt = f"""You are an autonomous senior software engineer working in {state['project_path']}.

USER REQUEST:
{state['user_request']}

IMPLEMENTATION PLAN:
{state['project_plan']}

RULES:
1. Inspect directory structure using list_directory().
2. Create/update clean files using write_file() or edit_file().
3. If web app (HTML/CSS/JS or React), ensure all interactive elements and styling are completely implemented.
4. For npm packages, write package.json and run npm install with run_terminal().
5. Build and verify the application."""

        try:
            deep_agent.invoke({"messages": [{"role": "user", "content": prompt}]})
        except Exception as e:
            emit("agent_error", f"Builder error: {e}", {"error": str(e)})

        return {"status": "built"}

    def build_check_node(state: AgentWorkflowState):
        emit("agent_step", "Checking project build status...", {"step": "build_check"})
        pkg_path = os.path.join(state['project_path'], "package.json")
        if os.path.exists(pkg_path):
            try:
                res = subprocess.run(
                    "npm run build",
                    shell=True,
                    cwd=state['project_path'],
                    capture_output=True,
                    text=True,
                    timeout=90
                )
                output = ((res.stdout or "") + (res.stderr or ""))[-1500:]
                if res.returncode == 0:
                    emit("build_result", "Build successful! [npm run build PASSED]", {"passed": True})
                    return {"test_report": f"BUILD PASSED\n\n{output}", "status": "passed"}
                else:
                    emit("build_result", "Build failed. [npm run build FAILED]", {"passed": False, "output": output})
                    return {"test_report": f"BUILD FAILED\n\n{output}", "status": "failed"}
            except Exception as e:
                return {"test_report": f"BUILD CHECK ERROR: {e}", "status": "failed"}

        # If vanilla HTML or Python, check file presence
        index_file = os.path.join(state['project_path'], "index.html")
        main_py = os.path.join(state['project_path'], "main.py")
        if os.path.exists(index_file) or os.path.exists(main_py):
            emit("build_result", "Application files verified.", {"passed": True})
            return {"test_report": "Application files present and ready.", "status": "passed"}

        return {"test_report": "Workspace check complete.", "status": "passed"}

    def route_after_build(state: AgentWorkflowState):
        if state.get("status") == "failed" and state.get("auto_repair", True):
            attempts = state.get("repair_attempts", 0)
            max_att = state.get("max_repair_attempts", 3)
            if attempts < max_att:
                return "repair"
        return "done"

    def repair_node(state: AgentWorkflowState):
        attempts = state.get("repair_attempts", 0) + 1
        emit("agent_step", f"Analyzing error and repairing project (Attempt {attempts})...", {"step": "repair", "attempt": attempts})
        report = state.get("test_report", "")[-1500:]
        prompt = f"""Fix the failing build in {state['project_path']}.

USER REQUEST:
{state['user_request']}

BUILD ERROR:
{report}

1. Inspect project files with list_directory() and read_file().
2. Fix root cause with write_file() or edit_file().
3. Do not fake test output."""
        try:
            deep_agent.invoke({"messages": [{"role": "user", "content": prompt}]})
        except Exception as e:
            emit("agent_error", f"Repair error: {e}", {"error": str(e)})

        return {"repair_attempts": attempts, "status": "repairing"}

    # LangGraph definition
    builder = StateGraph(AgentWorkflowState)
    builder.add_node("planner", planner_node)
    builder.add_node("builder", builder_node)
    builder.add_node("build_check", build_check_node)
    builder.add_node("repair", repair_node)

    builder.add_edge(START, "planner")
    builder.add_edge("planner", "builder")
    builder.add_edge("builder", "build_check")

    builder.add_conditional_edges(
        "build_check",
        route_after_build,
        {"repair": "repair", "done": END}
    )
    builder.add_edge("repair", "build_check")

    return builder.compile()
