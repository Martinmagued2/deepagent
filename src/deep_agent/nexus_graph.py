import os
import subprocess
import time
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
    settings = load_settings()
    model = get_chat_model(provider_config)
    tools = build_agent_tools(project_path, event_emitter, approval_callback)

    # Create the deep agent with a rich system prompt
    system_prompt = f"""You are NexusAI, an autonomous senior software engineer working inside a desktop IDE.

Your workspace is: {project_path}

You have access to tools for reading, writing, and editing files, running terminal commands, 
installing dependencies, running builds and tests, and searching the codebase.

WORKFLOW:
1. First, use list_directory() to understand the current workspace state.
2. Read any existing files that are relevant to the task.
3. Create a mental plan of what files to create or modify.
4. Implement the solution by writing files and running commands.
5. If it's a web project, make sure all interactive elements actually work.
6. Run the build to verify everything compiles.
7. If the build fails, read the error, fix the issue, and rebuild.

IMPORTANT RULES:
- Actually CREATE files using write_file(). Do not just describe what to do.
- Make sure all code is complete and functional — no placeholders or TODOs.
- For npm projects, create package.json first, then call install_dependency().
- For web apps, ensure index.html, style.css, and script.js all exist and work.
- If a command fails, read the error output and fix the root cause.
- Think step by step before each action.
"""

    deep_agent = create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
    )

    def emit(event_type: str, text: str, data: dict = None):
        if event_emitter:
            event_emitter(event_type, text, data or {})

    # ------------------------------------------------------------------
    # NODE: ANALYZE
    # ------------------------------------------------------------------
    async def analyze_node(state: AgentWorkflowState):
        emit("agent_step", "🔍 Analyzing your request...", {"step": "analyze"})
        emit("agent_reasoning", "Understanding what you want to build and planning the approach.", {})

        prompt = f"""Analyze this user request and identify the type of application, key features, and technical stack required.

User Request: {state['user_request']}
Project Path: {state['project_path']}

Output a brief technical analysis (3-5 bullets) covering:
- Application type (web app, API, mobile, etc.)
- Recommended tech stack
- Key features to implement
- File structure needed
"""
        try:
            res = await model.ainvoke([HumanMessage(content=prompt)])
            analysis = res.content if hasattr(res, "content") else str(res)
        except Exception as e:
            analysis = f"Fallback analysis: build {state['user_request'][:80]} (LLM error: {e})"
            emit("agent_error", f"Analysis LLM error: {e}", {"error": str(e)})

        emit("analysis_ready", analysis, {"step": "analyze"})
        emit("agent_reasoning", analysis, {})
        return {"status": "analyzed", "project_plan": analysis}

    # ------------------------------------------------------------------
    # NODE: IMPLEMENT (streamed)
    # ------------------------------------------------------------------
    async def implement_node(state: AgentWorkflowState):
        emit("agent_step", "⚡ Implementing your application...", {"step": "implement"})

        exp_context = ""
        if state.get("relevant_experiences"):
            exp_context = f"\n\nRelevant Verified Experiences:\n{state['relevant_experiences']}"

        plan = state.get("project_plan", "")

        prompt = f"""You are working in: {state['project_path']}

USER REQUEST:
{state['user_request']}

TECHNICAL ANALYSIS:
{plan}{exp_context}

NOW IMPLEMENT THE APPLICATION:
1. Call list_directory() to see what already exists.
2. Create all necessary files using write_file().
3. For npm projects: create package.json, then call install_dependency() for each package.
4. For web apps: create index.html, style.css, script.js — all fully functional.
5. Make sure all interactive elements (buttons, forms, etc.) actually work.
6. Do NOT leave placeholders or TODOs — write complete, working code.

Start by listing the directory, then create files one by one.
"""

        emit("agent_reasoning", "Starting implementation. I'll inspect the workspace and then create files.", {})

        # Stream the agent execution so we get real-time tokens + tool calls
        files_created = []
        commands_run = []

        try:
            async for event in deep_agent.astream_events(
                {"messages": [{"role": "user", "content": prompt}]},
                version="v2",
            ):
                evt_type = event.get("event", "")
                evt_name = event.get("name", "")
                evt_data = event.get("data", {})

                # LLM token streaming
                if evt_type == "on_chat_model_stream":
                    chunk = evt_data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        emit("agent_token", chunk.content, {})

                # Tool start
                elif evt_type == "on_tool_start":
                    tool_input = evt_data.get("input", {})
                    if evt_name == "write_file":
                        fname = tool_input.get("filename", "?") if isinstance(tool_input, dict) else "?"
                        files_created.append(fname)
                        emit("file_creating", f"Writing {fname}...", {"filename": fname})
                        emit("agent_reasoning", f"Creating file: {fname}", {})
                    elif evt_name == "edit_file":
                        fname = tool_input.get("filename", "?") if isinstance(tool_input, dict) else "?"
                        emit("file_editing", f"Editing {fname}...", {"filename": fname})
                        emit("agent_reasoning", f"Editing file: {fname}", {})
                    elif evt_name == "run_terminal":
                        cmd = tool_input.get("command", "?") if isinstance(tool_input, dict) else "?"
                        commands_run.append(cmd)
                        emit("command_running", f"$ {cmd}", {"command": cmd, "cwd": project_path})
                    elif evt_name == "install_dependency":
                        pkg = tool_input.get("package", "?") if isinstance(tool_input, dict) else "?"
                        emit("installing", f"Installing {pkg}...", {"package": pkg})
                        emit("agent_reasoning", f"Installing dependency: {pkg}", {})
                    elif evt_name == "read_file":
                        fname = tool_input.get("filename", "?") if isinstance(tool_input, dict) else "?"
                        emit("agent_reasoning", f"Reading file: {fname}", {})
                    elif evt_name == "list_directory":
                        emit("agent_reasoning", "Listing workspace files...", {})
                    elif evt_name == "run_build":
                        emit("building", "Running build...", {})
                        emit("agent_reasoning", "Running build to verify...", {})
                    elif evt_name == "run_tests":
                        emit("testing", "Running tests...", {})
                        emit("agent_reasoning", "Running test suite...", {})
                    else:
                        emit("agent_reasoning", f"Calling tool: {evt_name}", {})

                # Tool end
                elif evt_type == "on_tool_end":
                    output = evt_data.get("output", "")
                    output_str = str(output)[:500] if output else ""
                    if evt_name == "write_file":
                        # The file_written event was already emitted by the tool itself
                        pass
                    elif evt_name == "run_terminal":
                        emit("agent_reasoning", f"Command finished: {output_str[:200]}", {})
                    elif evt_name == "install_dependency":
                        emit("agent_reasoning", f"Install result: {output_str[:200]}", {})
                    elif evt_name == "list_directory":
                        emit("agent_reasoning", f"Found files: {output_str[:300]}", {})

                # Error events
                elif evt_type == "on_chain_error" or "error" in evt_type.lower():
                    err_msg = str(evt_data)[:500]
                    emit("agent_error", f"Agent error: {err_msg}", {"error": err_msg})

        except Exception as e:
            emit("agent_error", f"Implementation failed: {e}", {"error": str(e)})
            import traceback
            emit("agent_error", traceback.format_exc()[-500:], {"traceback": True})

        emit("agent_step", "✓ Implementation complete", {"step": "implement_done"})
        return {"status": "implemented", "files_changed": files_created, "commands_executed": commands_run}

    # ------------------------------------------------------------------
    # NODE: BUILD CHECK
    # ------------------------------------------------------------------
    async def build_node(state: AgentWorkflowState):
        emit("agent_step", "🔨 Checking build...", {"step": "build"})
        pkg_path = os.path.join(state["project_path"], "package.json")
        if os.path.exists(pkg_path):
            emit("agent_reasoning", "Running `npm run build` to verify the project compiles...", {})
            try:
                res = subprocess.run(
                    "npm run build",
                    shell=True, cwd=state["project_path"],
                    capture_output=True, text=True, timeout=180,
                )
                output = ((res.stdout or "") + (res.stderr or ""))[-3000:]
                if res.returncode == 0:
                    emit("build_result", "✓ Build successful!", {"passed": True, "output": output})
                    emit("agent_reasoning", "Build passed! The project compiles correctly.", {})
                    return {"build_report": f"BUILD PASSED\n\n{output}", "status": "built"}
                else:
                    emit("build_result", "✗ Build failed", {"passed": False, "output": output})
                    emit("agent_reasoning", f"Build failed. I need to fix the errors:\n{output[:500]}", {})
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
            emit("build_result", "✓ Application files verified", {"passed": True})
            emit("agent_reasoning", "Files are present. No build step needed for this project type.", {})
            return {"build_report": "Files present.", "status": "built"}
        emit("build_result", "⚠ No recognizable entry point found", {"passed": False})
        emit("agent_reasoning", "Warning: no index.html or main.py found. The build may be incomplete.", {})
        return {"build_report": "No entry point found.", "status": "build_failed", "errors": ["No entry point"]}

    # ------------------------------------------------------------------
    # NODE: EVALUATE
    # ------------------------------------------------------------------
    async def evaluate_node(state: AgentWorkflowState):
        emit("agent_step", "📊 Evaluating result...", {"step": "evaluate"})
        if state.get("status") == "build_failed":
            emit("agent_reasoning", "Build failed — will attempt repair.", {})
            return {"status": "failed"}
        emit("agent_reasoning", "Build succeeded! Application is ready.", {})
        return {"status": "passed"}

    # ------------------------------------------------------------------
    # NODE: REPAIR (streamed)
    # ------------------------------------------------------------------
    async def repair_node(state: AgentWorkflowState):
        attempts = state.get("repair_attempts", 0) + 1
        max_att = state.get("max_repair_attempts", 3)
        emit("agent_step", f"🔧 Repairing (attempt {attempts}/{max_att})...", {"step": "repair", "attempt": attempts})

        report = state.get("build_report", "") or state.get("test_report", "")
        report = report[-2000:]

        prompt = f"""The build failed in {state['project_path']}. Fix the issue.

USER REQUEST:
{state['user_request']}

BUILD ERROR:
{report}

INSTRUCTIONS:
1. Call list_directory() to see current files.
2. Call read_file() on the file that's likely causing the error.
3. Use edit_file() or write_file() to fix the issue.
4. Do NOT fake success — actually fix the root cause.
"""

        emit("agent_reasoning", f"Repair attempt {attempts}. Analyzing the build error and fixing the root cause...", {})

        try:
            async for event in deep_agent.astream_events(
                {"messages": [{"role": "user", "content": prompt}]},
                version="v2",
            ):
                evt_type = event.get("event", "")
                evt_name = event.get("name", "")
                evt_data = event.get("data", {})

                if evt_type == "on_chat_model_stream":
                    chunk = evt_data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        emit("agent_token", chunk.content, {})

                elif evt_type == "on_tool_start":
                    tool_input = evt_data.get("input", {})
                    if evt_name == "write_file":
                        fname = tool_input.get("filename", "?") if isinstance(tool_input, dict) else "?"
                        emit("file_creating", f"Writing {fname}...", {"filename": fname})
                        emit("agent_reasoning", f"Rewriting file: {fname}", {})
                    elif evt_name == "edit_file":
                        fname = tool_input.get("filename", "?") if isinstance(tool_input, dict) else "?"
                        emit("file_editing", f"Editing {fname}...", {"filename": fname})
                        emit("agent_reasoning", f"Patching file: {fname}", {})
                    elif evt_name == "read_file":
                        fname = tool_input.get("filename", "?") if isinstance(tool_input, dict) else "?"
                        emit("agent_reasoning", f"Reading {fname} to understand the issue...", {})
                    elif evt_name == "run_terminal":
                        cmd = tool_input.get("command", "?") if isinstance(tool_input, dict) else "?"
                        emit("command_running", f"$ {cmd}", {"command": cmd, "cwd": project_path})
                    elif evt_name == "list_directory":
                        emit("agent_reasoning", "Listing workspace to inspect current state...", {})

                elif evt_type == "on_tool_end":
                    output = evt_data.get("output", "")
                    output_str = str(output)[:300] if output else ""
                    if evt_name in ("read_file", "list_directory"):
                        emit("agent_reasoning", f"Result: {output_str[:200]}", {})

        except Exception as e:
            emit("agent_error", f"Repair failed: {e}", {"error": str(e)})

        return {"repair_attempts": attempts, "status": "repairing"}

    # ------------------------------------------------------------------
    # NODE: COMPLETE
    # ------------------------------------------------------------------
    async def complete_node(state: AgentWorkflowState):
        emit("agent_step", "✅ Finalizing...", {"step": "complete"})
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
        emit("agent_reasoning", "All done! Your application is ready to use.", {})
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
        return "evaluate"

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
    builder.add_node("implement", implement_node)
    builder.add_node("build", build_node)
    builder.add_node("evaluate", evaluate_node)
    builder.add_node("repair", repair_node)
    builder.add_node("complete", complete_node)

    builder.add_edge(START, "analyze")
    builder.add_edge("analyze", "implement")
    builder.add_edge("implement", "build")
    builder.add_conditional_edges("build", route_after_build, {"repair": "repair", "evaluate": "evaluate"})
    builder.add_edge("evaluate", "complete")
    builder.add_edge("repair", "build")
    builder.add_edge("complete", END)

    return builder.compile()


# ============================================================
# CONVERSATIONAL CHAT AGENT (with memory)
# ============================================================
from langgraph.checkpoint.memory import MemorySaver

# Per-project chat agents with memory
_chat_agents: Dict[str, Any] = {}


def get_or_create_chat_agent(
    project_path: str,
    provider_config: Optional[ProviderConfig] = None,
    event_emitter: Optional[Callable[[str, str, dict], None]] = None,
    approval_callback: Optional[Callable[[str, str, dict], bool]] = None,
):
    """Get (or create) a conversational chat agent for a project.
    The agent uses a MemorySaver checkpointer keyed by project_path,
    so it remembers the full conversation history across calls.
    """
    if project_path in _chat_agents:
        return _chat_agents[project_path]

    settings = load_settings()
    model = get_chat_model(provider_config or settings.ai)
    tools = build_agent_tools(project_path, event_emitter, approval_callback)

    system_prompt = f"""You are NexusAI, an autonomous senior software engineer working inside a desktop IDE.

Your workspace is: {project_path}

You have access to tools for reading, writing, and editing files, running terminal commands,
installing dependencies, running builds and tests, and searching the codebase.

You remember the full conversation history — the user can ask follow-up questions
and you can reference what you did previously.

WORKFLOW:
1. When the user asks you to build something, inspect the workspace first with list_directory().
2. Read any relevant existing files with read_file().
3. Create or modify files using write_file() and edit_file().
4. For npm projects, create package.json and call install_dependency() for packages.
5. Run the build with run_build() to verify.
6. If the build fails, read the error, fix the issue, and rebuild.

IMPORTANT RULES:
- Actually CREATE files using write_file(). Do not just describe what to do.
- Make sure all code is complete and functional — no placeholders or TODOs.
- If a command fails, read the error output and fix the root cause.
- Think step by step before each action.
- When the user asks a question about the codebase, use read_file() and list_directory()
  to inspect the code before answering.
- Reference previous work when relevant ("I already created index.html, so now I'll...").
"""

    checkpointer = MemorySaver()

    agent = create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
        checkpointer=checkpointer,
    )

    _chat_agents[project_path] = agent
    return agent


def clear_chat_agent(project_path: str):
    """Clear the chat agent (and its memory) for a project."""
    _chat_agents.pop(project_path, None)


async def run_chat_turn(
    project_path: str,
    message: str,
    provider_config: Optional[ProviderConfig] = None,
    event_emitter: Optional[Callable[[str, str, dict], None]] = None,
    approval_callback: Optional[Callable[[str, str, dict], bool]] = None,
    thread_id: Optional[str] = None,
) -> str:
    """Run one conversational turn. Streams events via event_emitter.
    The agent remembers all previous turns (via MemorySaver checkpointer).
    Returns the full assistant response text.
    """
    import asyncio

    agent = get_or_create_chat_agent(project_path, provider_config, event_emitter, approval_callback)
    tid = thread_id or project_path

    config = {"configurable": {"thread_id": tid}}

    full_response = ""

    def emit(event_type: str, text: str, data: dict = None):
        if event_emitter:
            event_emitter(event_type, text, data or {})

    emit("agent_reasoning", "Thinking about your request...", {})

    try:
        async for event in agent.astream_events(
            {"messages": [{"role": "user", "content": message}]},
            config=config,
            version="v2",
        ):
            evt_type = event.get("event", "")
            evt_name = event.get("name", "")
            evt_data = event.get("data", {})

            # LLM token streaming — accumulate the response
            if evt_type == "on_chat_model_stream":
                chunk = evt_data.get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    full_response += chunk.content
                    emit("agent_token", chunk.content, {})

            # Tool start
            elif evt_type == "on_tool_start":
                tool_input = evt_data.get("input", {})
                if isinstance(tool_input, dict):
                    if evt_name == "write_file":
                        fname = tool_input.get("filename", "?")
                        emit("file_creating", f"Writing {fname}...", {"filename": fname})
                        emit("agent_reasoning", f"Creating file: {fname}", {})
                    elif evt_name == "edit_file":
                        fname = tool_input.get("filename", "?")
                        emit("file_editing", f"Editing {fname}...", {"filename": fname})
                        emit("agent_reasoning", f"Editing file: {fname}", {})
                    elif evt_name == "read_file":
                        fname = tool_input.get("filename", "?")
                        emit("agent_reasoning", f"Reading file: {fname}", {})
                    elif evt_name == "run_terminal":
                        cmd = tool_input.get("command", "?")
                        emit("command_running", f"$ {cmd}", {"command": cmd, "cwd": project_path})
                        emit("agent_reasoning", f"Running: {cmd}", {})
                    elif evt_name == "install_dependency":
                        pkg = tool_input.get("package", "?")
                        emit("installing", f"Installing {pkg}...", {"package": pkg})
                        emit("agent_reasoning", f"Installing {pkg}", {})
                    elif evt_name == "list_directory":
                        emit("agent_reasoning", "Listing workspace files...", {})
                    elif evt_name == "run_build":
                        emit("building", "Running build...", {})
                        emit("agent_reasoning", "Running build to verify...", {})
                    elif evt_name == "run_tests":
                        emit("testing", "Running tests...", {})
                        emit("agent_reasoning", "Running test suite...", {})
                    elif evt_name == "search_files":
                        q = tool_input.get("query", "?")
                        emit("agent_reasoning", f"Searching for: {q}", {})
                    else:
                        emit("agent_reasoning", f"Calling tool: {evt_name}", {})

            # Tool end
            elif evt_type == "on_tool_end":
                output = evt_data.get("output", "")
                output_str = str(output)[:300] if output else ""
                if evt_name in ("read_file", "list_directory", "search_files"):
                    emit("agent_reasoning", f"Result: {output_str[:200]}", {})
                elif evt_name == "run_terminal":
                    emit("agent_reasoning", f"Command finished: {output_str[:200]}", {})

            # Error events
            elif "error" in evt_type.lower():
                err_msg = str(evt_data)[:500]
                emit("agent_error", f"Agent error: {err_msg}", {"error": err_msg})

    except Exception as e:
        import traceback
        err_detail = traceback.format_exc()[-800:]
        emit("agent_error", f"Chat failed: {e}", {"error": str(e), "traceback": err_detail})
        if not full_response:
            full_response = f"I encountered an error: {e}"

    emit("agent_response_complete", full_response, {"response": full_response})
    return full_response

