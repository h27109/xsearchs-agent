from __future__ import annotations

from agentscope.formatter import AnthropicChatFormatter, DeepSeekChatFormatter, OpenAIChatFormatter
from agentscope.model import AnthropicChatModel, OpenAIChatModel

from src.config import ModelConfig

_CLIENT_TYPES: dict[str, type] = {
    "anthropic": AnthropicChatModel,
    "openai": OpenAIChatModel,
}

_FORMATTERS: dict[str, type] = {
    "anthropic": AnthropicChatFormatter,
    "openai": OpenAIChatFormatter,
    "deepseek": DeepSeekChatFormatter,
}


def create_model(config: ModelConfig, model_name: str | None = None) -> AnthropicChatModel | OpenAIChatModel:
    if config.client_type not in _CLIENT_TYPES:
        raise ValueError(f"不支持的 client_type: {config.client_type}，可选值: {list(_CLIENT_TYPES)}")
    name = model_name or config.default_model
    cls = _CLIENT_TYPES[config.client_type]
    return cls(
        api_key=config.api_key,
        model_name=name,
        enable_thinking=config.enable_thinking,
        stream=config.stream,
        client_kwargs={"base_url": config.base_url},
    )


def create_formatter(config: ModelConfig):
    if config.formatter_type not in _FORMATTERS:
        raise ValueError(f"不支持的 formatter: {config.formatter_type}，可选值: {list(_FORMATTERS)}")
    return _FORMATTERS[config.formatter_type]()
