import json
import os
from typing import Any, Dict, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_openrouter import ChatOpenRouter
from pydantic import BaseModel, Field

from deep_agent.nexus_credentials import store_api_key, load_api_key, clear_api_key

CONFIG_FILE = os.path.join(os.getcwd(), ".nexus_config.json")

# Provider presets — used to pre-fill the form, NOT to restrict the user.
PROVIDER_PRESETS = {
    "OpenRouter": {
        "provider_type": "cloud",
        "base_url": "https://openrouter.ai/api/v1",
        "models": [
            "google/gemini-2.0-flash-exp:free",
            "anthropic/claude-3.5-sonnet",
            "openai/gpt-4o-mini",
            "meta-llama/llama-3.3-70b-instruct:free",
            "deepseek/deepseek-chat",
            "qwen/qwen-2.5-coder-32b-instruct:free",
        ],
    },
    "OpenAI": {
        "provider_type": "cloud",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    "DeepSeek": {
        "provider_type": "cloud",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "Anthropic": {
        "provider_type": "cloud",
        "base_url": "https://api.anthropic.com/v1",
        "models": ["claude-3.5-sonnet", "claude-3.5-haiku", "claude-3-opus"],
    },
    "Ollama": {
        "provider_type": "local",
        "base_url": "http://localhost:11434/v1",
        "models": [
            "qwen2.5-coder:latest",
            "llama3.2:latest",
            "deepseek-coder-v2:latest",
            "codellama:latest",
            "mistral:latest",
        ],
    },
    "LMStudio": {
        "provider_type": "local",
        "base_url": "http://localhost:1234/v1",
        "models": ["local-model"],
    },
    "vLLM": {
        "provider_type": "local",
        "base_url": "http://localhost:8000/v1",
        "models": ["custom-model"],
    },
    "Custom": {
        "provider_type": "cloud",
        "base_url": "",
        "models": [],
    },
}


class ProviderConfig(BaseModel):
    provider_type: str = Field(default="cloud", description="'cloud' or 'local'")
    provider_name: str = Field(default="OpenRouter")
    base_url: str = Field(default="https://openrouter.ai/api/v1")
    # NOTE: api_key is NOT persisted to the config file — it goes to the OS keyring.
    api_key: Optional[str] = Field(default="", exclude=True)
    model: str = Field(default="google/gemini-2.0-flash-exp:free")
    temperature: float = Field(default=0.0)
    max_tokens: Optional[int] = Field(default=4096)
    timeout: int = Field(default=60)


class NexusSettings(BaseModel):
    general: Dict[str, Any] = Field(default_factory=lambda: {
        "theme": "dark-nexus",
        "default_project_dir": os.path.join(os.getcwd(), "projects"),
        "startup_behavior": "restore_last",
        "language": "en",
    })
    ai: ProviderConfig = Field(default_factory=ProviderConfig)
    agent: Dict[str, Any] = Field(default_factory=lambda: {
        "max_repair_attempts": 3,
        "auto_run_commands": False,
        "require_approval": True,
        "browser_testing": True,
        "build_automatically": True,
        "repair_automatically": True,
    })
    security: Dict[str, Any] = Field(default_factory=lambda: {
        "allowed_workspace_only": True,
        "allow_terminal": True,
        "command_blocklist": ["rm -rf /", "format", "del /f /s /q C:"],
        "require_approval_for": ["rm", "del", "format", "git push", "npm publish"],
    })
    network: Dict[str, Any] = Field(default_factory=lambda: {
        "endpoint": "https://network.nexusai.dev",
        "agent_identity": "local-agent",
        "auto_share_experiences": False,
        "auto_retrieve_experiences": True,
    })
    about: Dict[str, Any] = Field(default_factory=lambda: {
        "version": "0.2.0",
        "build": "nexus-studio-desktop",
    })


def load_settings() -> NexusSettings:
    """Load settings from disk; API key is loaded separately from secure storage."""
    env_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY", "")
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Strip any api_key from the JSON if it leaked in (defense-in-depth)
                ai_data = data.get("ai", {})
                ai_data.pop("api_key", None)
                settings = NexusSettings(**data)
                # Hydrate the API key from the secure store
                stored = load_api_key()
                settings.ai.api_key = stored or env_key or ""
                return settings
        except Exception as e:
            print(f"Warning: Failed to load config: {e}")

    settings = NexusSettings()
    stored = load_api_key()
    settings.ai.api_key = stored or env_key or ""
    return settings


def save_settings(settings: NexusSettings) -> None:
    """Persist settings WITHOUT the API key (which goes to secure storage)."""
    data = settings.dict()
    api_key = data.get("ai", {}).pop("api_key", "")
    # Persist the API key to secure storage (keyring or encrypted fallback)
    if api_key:
        store_api_key(api_key)
    else:
        clear_api_key()
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def clear_credentials() -> bool:
    """Remove the API key from secure storage."""
    return clear_api_key()


def get_chat_model(config: Optional[ProviderConfig] = None) -> BaseChatModel:
    """Instantiate the appropriate ChatModel based on provider config."""
    if config is None:
        settings = load_settings()
        config = settings.ai

    api_key = config.api_key or load_api_key() or "sk-dummy-key"
    base_url = config.base_url.rstrip("/") if config.base_url else None

    if "openrouter" in (base_url or "").lower() or config.provider_name.lower() == "openrouter":
        return ChatOpenRouter(
            model=config.model,
            temperature=config.temperature,
            api_key=api_key,
        )

    return ChatOpenAI(
        model=config.model,
        temperature=config.temperature,
        openai_api_key=api_key,
        openai_api_base=base_url,
        request_timeout=config.timeout,
        max_tokens=config.max_tokens,
    )


async def test_llm_connection(config: ProviderConfig) -> Dict[str, Any]:
    """Validate endpoint connectivity and model response."""
    try:
        model = get_chat_model(config)
        test_msg = "Hello! Please reply with 'NexusAI OK' to confirm connection."
        response = await model.ainvoke(test_msg)
        content = response.content if hasattr(response, "content") else str(response)
        return {
            "success": True,
            "message": "Connection successful. Model responded.",
            "response": str(content)[:200],
            "model": config.model,
            "provider": config.provider_name,
            "base_url": config.base_url,
        }
    except Exception as e:
        error_msg = str(e)
        hint = "Check if endpoint is reachable, model name is correct, and API key is valid."
        base = config.base_url or ""
        if "11434" in base:
            hint = "Ollama: ensure `ollama serve` is running and `ollama pull " + config.model + "` is done."
        elif "1234" in base:
            hint = "LM Studio: start the local server tab and load the model."
        elif "openrouter" in base.lower():
            hint = "OpenRouter: verify your API key at https://openrouter.ai/keys"
        return {
            "success": False,
            "message": f"Connection failed: {error_msg[:300]}",
            "hint": hint,
            "provider": config.provider_name,
            "base_url": config.base_url,
        }


def get_presets() -> Dict[str, Any]:
    """Return the provider presets for the UI to render."""
    return PROVIDER_PRESETS
