"""NexusAI Studio — deep_agent package exports."""

from deep_agent.nexus_llm import (
    ProviderConfig,
    NexusSettings,
    load_settings,
    save_settings,
    test_llm_connection,
    get_chat_model,
)
from deep_agent.nexus_workspace import workspace_mgr, WorkspaceManager
from deep_agent.nexus_experience import experience_network, Experience, ExperienceNetwork
from deep_agent.nexus_git import (
    get_git_status,
    git_stage_all_and_commit,
    get_git_diff,
    stage_file,
    unstage_file,
    stage_all,
    git_commit,
    git_pull,
    git_push,
    git_log,
)
from deep_agent.nexus_tools import build_agent_tools
from deep_agent.nexus_graph import create_nexus_graph, AgentWorkflowState
from deep_agent.nexus_credentials import (
    store_api_key,
    load_api_key,
    clear_api_key,
    has_api_key,
)

__all__ = [
    "ProviderConfig",
    "NexusSettings",
    "load_settings",
    "save_settings",
    "test_llm_connection",
    "get_chat_model",
    "workspace_mgr",
    "WorkspaceManager",
    "experience_network",
    "Experience",
    "ExperienceNetwork",
    "get_git_status",
    "git_stage_all_and_commit",
    "get_git_diff",
    "stage_file",
    "unstage_file",
    "stage_all",
    "git_commit",
    "git_pull",
    "git_push",
    "git_log",
    "build_agent_tools",
    "create_nexus_graph",
    "AgentWorkflowState",
    "store_api_key",
    "load_api_key",
    "clear_api_key",
    "has_api_key",
    "main",
]


def main():
    """Entry point for the `deep-agent` console script."""
    import os
    import sys
    import subprocess
    import webbrowser
    import time
    import socket

    print("==================================================")
    print("           NEXUSAI DESKTOP STUDIO IDE             ")
    print("==================================================")
    print("Starting NexusAI local server...")

    deepagent_dir = os.path.dirname(os.path.abspath(__file__))

    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "deep_agent.server:app",
         "--host", "127.0.0.1", "--port", "8000", "--log-level", "info"],
        cwd=deepagent_dir,
    )

    url = "http://127.0.0.1:8000"
    print(f"\nWaiting for server at {url} ...")

    start = time.time()
    while time.time() - start < 15:
        try:
            with socket.create_connection(("127.0.0.1", 8000), timeout=1):
                print(f"NexusAI Studio is ready!  →  {url}")
                print("Opening browser...")
                webbrowser.open(url)
                break
        except OSError:
            time.sleep(0.3)
    else:
        print("ERROR: Server did not start within 15 seconds.")
        server_process.terminate()
        return

    try:
        server_process.wait()
    except KeyboardInterrupt:
        print("\nStopping NexusAI Studio...")
        server_process.terminate()
