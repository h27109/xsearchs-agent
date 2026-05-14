from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def get_data_dir() -> Path:
    env = os.environ.get("XSEARCHS_USER_DATA")
    if env:
        return Path(env)
    return _PROJECT_ROOT / "data"


def _load_env(data_dir: Path) -> dict[str, str]:
    """从用户数据目录读取 .env 文件为 key=value 字典。"""
    env_path = data_dir / ".env"
    env_vars: dict[str, str] = {}
    if not env_path.exists():
        return env_vars
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            env_vars[key.strip()] = value.strip()
    return env_vars


def _resolve_env_vars(obj):
    """递归遍历 dict/list/str，将 ${VAR} 占位符替换为 .env 中的值。"""
    if isinstance(obj, str):
        return re.sub(
            r"\$\{(\w+)\}",
            lambda m: _env_map.get(m.group(1), m.group(0)),
            obj,
        )
    if isinstance(obj, dict):
        return {k: _resolve_env_vars(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_resolve_env_vars(v) for v in obj]
    return obj


# 模块级变量，load_config() 时填充
_env_map: dict[str, str] = {}

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
class HolographicConfig:
    dims: int = 1024
    ngram_min: int = 2
    ngram_max: int = 4


@dataclass(frozen=True)
class MemoryConfig:
    enabled: bool = False
    holographic: HolographicConfig = field(default_factory=HolographicConfig)


@dataclass(frozen=True)
class AppConfig:
    models: dict[str, ModelConfig] = field(default_factory=dict)
    mcp: dict = field(default_factory=dict)
    sqlite_url: str = ""
    memory: MemoryConfig = field(default_factory=MemoryConfig)


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
    global _env_map

    data_dir = get_data_dir()

    # 1. 加载 .env
    _env_map = _load_env(data_dir)

    # 2. 加载 config.yaml 并替换 ${VAR}
    with open(data_dir / "config.yaml") as f:
        raw = yaml.safe_load(f)
    raw = _resolve_env_vars(raw)

    raw_models = raw.get("models")
    if not isinstance(raw_models, dict):
        raise ValueError("config.yaml 缺少 models 节")
    models: dict[str, ModelConfig] = {}
    for key, val in raw_models.items():
        models[key] = _parse_model_config(key, val)

    sqlite = raw.get("sqlite") or {}
    db_name = sqlite.get("db", "memory.db")
    sqlite_url = f"sqlite+aiosqlite:///{data_dir / db_name}"

    raw_memory = raw.get("memory") or {}
    raw_holographic = raw_memory.get("holographic") or {}
    memory_config = MemoryConfig(
        enabled=raw_memory.get("enabled", False),
        holographic=HolographicConfig(
            dims=raw_holographic.get("dims", 1024),
            ngram_min=raw_holographic.get("ngram_min", 2),
            ngram_max=raw_holographic.get("ngram_max", 4),
        ),
    )

    return AppConfig(
        models=models,
        mcp=raw.get("MCP", {}),
        sqlite_url=sqlite_url,
        memory=memory_config,
    )
