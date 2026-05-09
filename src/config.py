from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def get_data_dir() -> Path:
    env = os.environ.get("XSEARCHS_USER_DATA")
    if env:
        return Path(env)
    return _PROJECT_ROOT / "data"


_CONFIG_PATH = get_data_dir() / "config.yaml"


@dataclass(frozen=True)
class ModelConfig:
    provider: str
    client_type: str
    formatter_type: str
    api_key: str
    models: tuple[str, ...]
    base_url: str
    enable_thinking: bool
    stream: bool
    max_iters: int

    @property
    def default_model(self) -> str:
        return self.models[0]


@dataclass(frozen=True)
class AppConfig:
    models: dict[str, ModelConfig] = field(default_factory=dict)
    mcp: dict = field(default_factory=dict)
    sqlite_url: str = ""


def _parse_model_config(provider_name: str, cfg: dict) -> ModelConfig:
    required = ("client_type", "formatter", "api_key", "model", "base_url", "max_iters")
    missing = [f for f in required if f not in cfg]
    if missing:
        raise ValueError(f"provider [{provider_name}] 缺少必填字段: {missing}")

    models = cfg["model"]
    models = tuple(models) if isinstance(models, list) else (models,)

    return ModelConfig(
        provider=provider_name,
        client_type=cfg["client_type"],
        formatter_type=cfg["formatter"],
        api_key=cfg["api_key"],
        models=models,
        base_url=cfg["base_url"],
        enable_thinking=cfg.get("enable_thinking", False),
        stream=cfg.get("stream", True),
        max_iters=cfg["max_iters"],
    )


def load_config() -> AppConfig:
    with open(_CONFIG_PATH) as f:
        raw = yaml.safe_load(f)

    raw_models = raw.get("models")
    if not isinstance(raw_models, dict):
        raise ValueError("config.yaml 缺少 models 节")
    models: dict[str, ModelConfig] = {}
    for key, val in raw_models.items():
        models[key] = _parse_model_config(key, val)

    sqlite = raw.get("sqlite")
    if not sqlite or "url" not in sqlite:
        raise ValueError("config.yaml 缺少 sqlite.url 配置")

    return AppConfig(
        models=models,
        mcp=raw.get("MCP", {}),
        sqlite_url=sqlite["url"],
    )
