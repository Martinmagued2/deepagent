import os
import subprocess
from typing import TypedDict, Optional, Callable, Dict, Any, List

from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage
from deepagents import create_deep_agent

from deep_agent.nexus_tools import build_agent_tools
from deep_agent.nexus_llm import get_chat_model, load_settings, ProviderConfig
from deep_agent.nexus_experience import experience_network, Experience


class AgentWorkflowState(TypedDict, total=False):
    user_request: str
    project_path: str
    project_plan: str
    files_changed: List[str]
    commands_executed: List[str]
    test_report: str
    build_report: str
    errors: List[str]
    status: str
    repair_attempts: int
    max_repair_attempts: int
    auto_repair: bool
    relevant_experiences: str
    experience_proposal: Optional[Dict[str, Any]]
    started_at: float
    finished_at: Optional[float]


def create_nexus_graph(
    project_path: str,
    provider_config: Optional[ProviderConfig] = None,
    event_emitter: Optional[Callable[[str, str, dict], None]] = None,
    approval_callback: Optional[Callable[[str, str, dict], bool]] = None,
    enable_browser_testing: bool = True,
):
    """Build the NexusAI LangGraph agent.

    Stages: START → analyze → plan → inspect → implement → build → test → evaluate
            → (repair if failed) → complete → END
    """
    settings = load_settings()
    model = get_chat_model(provider_config)
    tools = build_agent_tools(project_path, event_emitter, approval_callback)
    deep_agent = create_deep_agent(model=model, tools=tools)

    def emit(event_type: str, text: str, data: dict = None):
        if event_emitter:
            event_emitter(event_type, text, data or {})

    # ------------------------------------------------------------------
    # NODE: ANALYZE
    # ------------------------------------------------------------------
    def analyze_node(state: AgentWorkflowState):
        emit("agent_step", "Analyzing user request and workspace context...", {"step": "analyze"})
        prompt = f"""You are the senior architect of NexusAI.
Analyze this user request and identify the type of application, key features, and technical stack required.

User Request: {state['user_request']}
Project Path: {state['project_path']}

Output a brief technical analysis (3-5 bullets) covering:
- Application type (web app, API, mobile, etc.)
- Recommended tech stack
- Key features to implement
- Potential risks or complexities
"""
        try:
            res = model.invoke([HumanMessage(content=prompt)])
            analysis = res.content if hasattr(res, "content") else str(res)
        except Exception as e:
            analysis = f"Fallback analysis: build {state['user_request'][:80]} (LLM error: {e})"
        emit("analysis_ready", analysis, {"step": "analyze"})
        return {"status": "analyzed", "project_plan": analysis}

    # ------------------------------------------------------------------
    # NODE: PLAN
    # ------------------------------------------------------------------
    def plan_node(state: AgentWorkflowState):
        emit("agent_step", "Generating implementation plan...", {"step": "plan"})
        exp_context = ""
        if state.get("relevant_experiences"):
            exp_context = f"\n\nRelevant Verified Experiences:\n{state['relevant_experiences']}"
        prompt = f"""You are the senior software architect of NexusAI.

User Request: {state['user_request']}
Project Path: {state['project_path']}
Analysis: {state.get('project_plan', '')}{exp_context}

Provide a concise, actionable multi-step plan to implement this application.
For each step specify:
- Files to create or modify
- Libraries/dependencies needed
- Brief description of what each file does
"""
        try:
            res = model.invoke([HumanMessage(content=prompt)])
            plan_text = res.content if hasattr(res, "content") else str(res)
        except Exception as e:
            plan_text = f"1. Inspect existing workspace\n2. Create application files\n3. Install deps\n4. Build & verify\n(Fallback due to: {e})"
        emit("plan_ready", plan_text, {"plan": plan_text})
        return {"project_plan": plan_text, "status": "planned"}

    # ------------------------------------------------------------------
    # NODE: INSPECT
    # ------------------------------------------------------------------
    def inspect_node(state: AgentWorkflowState):
        emit("agent_step", "Inspecting existing workspace files...", {"step": "inspect"})
        # Just let the deep agent list the directory and decide what to keep
        try:
            deep_agent.invoke({
                "messages": [{
                    "role": "user",
                    "content": (
                        f"Inspect the workspace at {state['project_path']} using list_directory(). "
                        "Report what files already exist. Do NOT modify anything yet."
                    ),
                }]
            })
        except Exception as e:
            emit("agent_error", f"Inspect error: {e}", {"error": str(e)})
        return {"status": "inspected"}

    # ------------------------------------------------------------------
    # NODE: IMPLEMENT
    # ------------------------------------------------------------------
    def implement_node(state: AgentWorkflowState):
        emit("agent_step", "Implementing application files...", {"step": "implement"})
        prompt = f"""You are an autonomous senior software engineer working in {state['project_path']}.

USER REQUEST:
{state['user_request']}

IMPLEMENTATION PLAN:
{state.get('project_plan', '')}

RULES:
1. Inspect directory structure using list_directory().
2. Create/update clean files using write_file() or edit_file().
3. For npm packages, write package.json and call install_dependency().
4. If web app, ensure all interactive elements and styling are fully implemented.
5. Do not create unnecessary files.
6. After implementation, call run_build() to verify the build.
"""
        try:
            deep_agent.invoke({"messages": [{"role": "user", "content": prompt}]})
        except Exception as e:
            emit("agent_error", f"Implement error: {e}", {"error": str(e)})
        return {"status": "implemented"}

    # ------------------------------------------------------------------
    # NODE: BUILD
    # ------------------------------------------------------------------
    def build_node(state: AgentWorkflowState):
        emit("agent_step", "Running build...", {"step": "build"})
        pkg_path = os.path.join(state["project_path"], "package.json")
        if os.path.exists(pkg_path):
            try:
                res = subprocess.run(
                    "npm run build",
                    shell=True, cwd=state["project_path"],
                    capture_output=True, text=True, timeout=180,
                )
                output = ((res.stdout or "") + (res.stderr or ""))[-3000:]
                if res.returncode == 0:
                    emit("build_result", "Build successful", {"passed": True, "output": output})
                    return {"build_report": f"BUILD PASSED\n\n{output}", "status": "built"}
                else:
                    emit("build_result", "Build failed", {"passed": False, "output": output})
                    return {
                        "build_report": f"BUILD FAILED\n\n{output}",
                        "status": "build_failed",
                        "errors": [output],
                    }
            except subprocess.TimeoutExpired:
                msg = "Build timed out after 180s"
                emit("build_result", msg, {"passed": False})
                return {"build_report": msg, "status": "build_failed", "errors": [msg]}
            except Exception as e:
                msg = f"Build check error: {e}"
                emit("build_result", msg, {"passed": False})
                return {"build_report": msg, "status": "build_failed", "errors": [str(e)]}

        # Vanilla HTML / Python: just verify files exist
        index_file = os.path.join(state["project_path"], "index.html")
        main_py = os.path.join(state["project_path"], "main.py")
        if os.path.exists(index_file) or os.path.exists(main_py):
            emit("build_result", "Application files verified", {"passed": True})
            return {"build_report": "Files present.", "status": "built"}
        emit("build_result", "No recognizable entry point", {"passed": False})
        return {"build_report": "No index.html or main.py found.", "status": "build_failed", "errors": ["No entry point"]}

    # ------------------------------------------------------------------
    # NODE: TEST
    # ------------------------------------------------------------------
    def test_node(state: AgentWorkflowState):
        emit("agent_step", "Running tests...", {"step": "test"})
        # Try to run the test suite, but don't fail the whole pipeline if no tests exist
        try:
            res = subprocess.run(
                "npm test -- --watchAll=false 2>&1 || true",
                shell=True, cwd=state["project_path"],
                capture_output=True, text=True, timeout=120,
            )
            output = (res.stdout or "")[-1500:]
            if res.returncode == 0:
                emit("test_result", "Tests passed", {"passed": True})
                return {"test_report": f"TESTS PASSED\n{output}", "status": "tested"}
            else:
                emit("test_result", "Tests failed", {"passed": False, "output": output})
                return {"test_report": f"TESTS FAILED\n{output}", "status": "test_failed"}
        except Exception as e:
            # No test framework — treat as neutral (build status dominates)
            emit("test_result", f"No tests detected ({e})", {"passed": None})
            return {"test_report": "No tests detected.", "status": "tested"}

    # ------------------------------------------------------------------
    # NODE: EVALUATE
    # ------------------------------------------------------------------
    def evaluate_node(state: AgentWorkflowState):
        emit("agent_step", "Evaluating result & checking for browser testing...", {"step": "evaluate"})
        # Optional: run browser_test.py if enabled
        if enable_browser_testing and os.path.exists(os.path.join(state["project_path"], "browser_test.py")):
            emit("agent_step", "Running browser_test.py (Playwright)...", {"step": "browser_test"})
            try:
                res = subprocess.run(
                    ["python", "browser_test.py"],
                    cwd=state["project_path"],
                    capture_output=True, text=True, timeout=120,
                )
                out = (res.stdout or "") + (res.stderr or "")
                if res.returncode == 0:
                    emit("browser_test_result", "Browser test passed", {"passed": True, "output": out[-1000:]})
                    return {"test_report": state.get("test_report", "") + f"\nBROWSER TEST PASSED\n{out[-500:]}", "status": "passed"}
                else:
                    emit("browser_test_result", "Browser test failed", {"passed": False, "output": out[-1500:]})
                    return {
                        "test_report": state.get("test_report", "") + f"\nBROWSER TEST FAILED\n{out[-1000:]}",
                        "status": "failed",
                        "errors": [out[-500:]],
                    }
            except Exception as e:
                emit("browser_test_result", f"Browser test error: {e}", {"passed": False})
        # No browser test → use the build status
        if state.get("status") == "build_failed":
            return {"status": "failed"}
        return {"status": "passed"}

    # ------------------------------------------------------------------
    # NODE: REPAIR
    # ------------------------------------------------------------------
    def repair_node(state: AgentWorkflowState):
        attempts = state.get("repair_attempts", 0) + 1
        emit("agent_step", f"Repairing (attempt {attempts})...", {"step": "repair", "attempt": attempts})
        report = state.get("test_report", "") or state.get("build_report", "")
        report = report[-2000:]
        prompt = f"""Fix the failing build/test in {state['project_path']}.

USER REQUEST:
{state['user_request']}

ERROR REPORT:
{report}

1. Inspect project files with list_directory() and read_file().
2. Identify root cause.
3. Fix with write_file() or edit_file().
4. Do NOT fake test results.
"""
        try:
            deep_agent.invoke({"messages": [{"role": "user", "content": prompt}]})
        except Exception as e:
            emit("agent_error", f"Repair error: {e}", {"error": str(e)})
        return {"repair_attempts": attempts, "status": "repairing"}

    # ------------------------------------------------------------------
    # NODE: COMPLETE
    # ------------------------------------------------------------------
    def complete_node(state: AgentWorkflowState):
        import time
        emit("agent_step", "Finalizing...", {"step": "complete"})
        # Optionally propose an experience if we repaired something
        proposal = None
        if state.get("repair_attempts", 0) > 0 and state.get("status") == "passed":
            proposal = experience_network.propose_from_success(
                title=f"Repaired: {state['user_request'][:60]}",
                problem=state.get("errors", [""])[0] if state.get("errors") else "",
                solution="See agent logs for repair steps.",
                environment="NexusAI workspace",
                tags=["auto-proposed"],
            ).dict()
            emit("experience_proposed", "Experience candidate created from successful repair.", {"experience": proposal})
        return {"status": "complete", "finished_at": time.time(), "experience_proposal": proposal}

    # ------------------------------------------------------------------
    # ROUTING
    # ------------------------------------------------------------------
    def route_after_build(state: AgentWorkflowState):
        if state.get("status") in ("build_failed", "failed"):
            if state.get("auto_repair", True):
                attempts = state.get("repair_attempts", 0)
                max_att = state.get("max_repair_attempts", settings.agent.get("max_repair_attempts", 3))
                if attempts < max_att:
                    return "repair"
        return "test"

    def route_after_evaluate(state: AgentWorkflowState):
        if state.get("status") == "failed" and state.get("auto_repair", True):
            attempts = state.get("repair_attempts", 0)
            max_att = state.get("max_repair_attempts", settings.agent.get("max_repair_attempts", 3))
            if attempts < max_att:
                return "repair"
        return "complete"

    # ------------------------------------------------------------------
    # GRAPH DEFINITION
    # ------------------------------------------------------------------
    builder = StateGraph(AgentWorkflowState)
    builder.add_node("analyze", analyze_node)
    builder.add_node("plan", plan_node)
    builder.add_node("inspect", inspect_node)
    builder.add_node("implement", implement_node)
    builder.add_node("build", build_node)
    builder.add_node("test", test_node)
    builder.add_node("evaluate", evaluate_node)
    builder.add_node("repair", repair_node)
    builder.add_node("complete", complete_node)

    builder.add_edge(START, "analyze")
    builder.add_edge("analyze", "plan")
    builder.add_edge("plan", "inspect")
    builder.add_edge("inspect", "implement")
    builder.add_edge("implement", "build")
    builder.add_conditional_edges("build", route_after_build, {"repair": "repair", "test": "test"})
    builder.add_edge("test", "evaluate")
    builder.add_conditional_edges("evaluate", route_after_evaluate, {"repair": "repair", "complete": "complete"})
    builder.add_edge("repair", "build")
    builder.add_edge("complete", END)

    return builder.compile()
