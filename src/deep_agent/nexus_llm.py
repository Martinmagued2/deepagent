import json
import os
from typing import Any, Dict, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_openrouter import ChatOpenRouter
from pydantic import BaseModel, Field

CONFIG_FILE = os.path.join(os.getcwd(), ".nexus_config.json")

class ProviderConfig(BaseModel):
    provider_type: str = Field(default="cloud", description="'cloud' or 'local'")
    provider_name: str = Field(default="OpenRouter")  # OpenRouter, OpenAI, Ollama, LM Studio, Custom
    base_url: str = Field(default="https://openrouter.ai/api/v1")
    api_key: Optional[str] = Field(default="")
    model: str = Field(default="google/gemini-2.0-flash-exp:free")
    temperature: float = Field(default=0.0)
    max_tokens: Optional[int] = Field(default=4096)
    timeout: int = Field(default=60)

class NexusSettings(BaseModel):
    general: Dict[str, Any] = Field(default_factory=lambda: {
        "theme": "dark-nexus",
        "default_project_dir": os.path.join(os.getcwd(), "sandbox_app"),
        "startup_behavior": "restore_last"
    })
    ai: ProviderConfig = Field(default_factory=ProviderConfig)
    agent: Dict[str, Any] = Field(default_factory=lambda: {
        "max_repair_attempts": 3,
        "auto_run_commands": False,
        "require_approval": True,
        "browser_testing": True,
        "build_automatically": True,
        "repair_automatically": True
    })
    security: Dict[str, Any] = Field(default_factory=lambda: {
        "allowed_workspace_only": True,
        "allow_terminal": True
    })

def load_settings() -> NexusSettings:
    """Load settings from secure/local storage or environment defaults."""
    env_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY", "")
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                settings = NexusSettings(**data)
                # If API key empty in file, fallback to env if present
                if not settings.ai.api_key and env_key:
                    settings.ai.api_key = env_key
                return settings
        except Exception as e:
            print(f"Warning: Failed to load config: {e}")
    
    settings = NexusSettings()
    if env_key:
        settings.ai.api_key = env_key
    return settings

def save_settings(settings: NexusSettings) -> None:
    """Persist settings without exposing secrets in logs."""
    data = settings.dict()
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def get_chat_model(config: Optional[ProviderConfig] = None) -> BaseChatModel:
    """Instantiate the appropriate ChatModel based on provider config."""
    if config is None:
        settings = load_settings()
        config = settings.ai

    api_key = config.api_key or "sk-dummy-key"
    base_url = config.base_url.rstrip("/") if config.base_url else None

    # OpenRouter provider
    if "openrouter" in (base_url or "").lower() or config.provider_name.lower() == "openrouter":
        return ChatOpenRouter(
            model=config.model,
            temperature=config.temperature,
            api_key=config.api_key or os.getenv("OPENROUTER_API_KEY", ""),
        )

    # Generic OpenAI-compatible (Ollama, LM Studio, vLLM, OpenAI, DeepSeek, etc.)
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
            "message": "Connection successful. Model responded successfully.",
            "response": str(content)[:200],
            "model": config.model,
            "provider": config.provider_name
        }
    except Exception as e:
        error_msg = str(e)
        hint = "Check if endpoint is reachable, model name is correct, and API key is valid."
        if "11434" in (config.base_url or ""):
            hint = "Ollama detected: ensure `ollama serve` is running and the model is pulled (`ollama pull " + config.model + "`)."
        elif "1234" in (config.base_url or ""):
            hint = "LM Studio detected: ensure local server is started and model is loaded."
        
        return {
            "success": False,
            "message": f"Connection failed: {error_msg}",
            "hint": hint,
            "provider": config.provider_name,
            "base_url": config.base_url
        }
