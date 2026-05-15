from __future__ import annotations

from chat.agent.holographic_memory import HolographicLongTermMemory
from config import AppConfig, get_data_dir


def create_long_term_memory(
    app_config: AppConfig,
    user_id: str,
) -> HolographicLongTermMemory | None:
    """创建全息长期记忆实例。"""
    mem_cfg = app_config.memory
    if not mem_cfg.enabled:
        return None

    hc = mem_cfg.holographic
    db_path = str(get_data_dir() / "memory.db")

    return HolographicLongTermMemory(
        dims=hc.dims,
        ngram_min=hc.ngram_min,
        ngram_max=hc.ngram_max,
        db_path=db_path,
        agent_name=user_id,
        user_name=user_id,
    )
