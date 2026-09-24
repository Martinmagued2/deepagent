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
from deep_agent.nexus_git import get_git_status, git_stage_all_and_commit, get_git_diff
from deep_agent.nexus_tools import build_agent_tools
from deep_agent.nexus_graph import create_nexus_graph, AgentWorkflowState

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
    "build_agent_tools",
    "create_nexus_graph",
    "AgentWorkflowState",
]
