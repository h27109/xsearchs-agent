from __future__ import annotations

from agentscope.embedding import (
    DashScopeTextEmbedding,
    OllamaTextEmbedding,
    OpenAITextEmbedding,
)
from agentscope.memory import Mem0LongTermMemory
from agentscope.model import AnthropicChatModel, OpenAIChatModel

from chat.config import AppConfig, MemoryEmbeddingConfig, ModelConfig, get_data_dir

# client_type → model class
_MODEL_CLASSES: dict[str, type] = {
    "anthropic": AnthropicChatModel,
    "openai": OpenAIChatModel,
}


def _create_memory_model(mc: ModelConfig):
    """创建 memory 使用的 LLM（必须 stream=False）。"""
    cls = _MODEL_CLASSES.get(mc.client_type)
    if not cls:
        raise ValueError(f"不支持的 client_type: {mc.client_type}")
    return cls(
        api_key=mc.api_key,
        model_name=mc.default_model,
        stream=False,
        client_kwargs={"base_url": mc.base_url},
    )


_EMBEDDING_FACTORIES = {
    "openai": lambda cfg: OpenAITextEmbedding(
        model_name=cfg.model,
        api_key=cfg.api_key,
        dimensions=cfg.dimensions,
        base_url=cfg.base_url or "https://api.openai.com/v1",
    ),
    "glm": lambda cfg: OpenAITextEmbedding(
        model_name=cfg.model,
        api_key=cfg.api_key,
        dimensions=cfg.dimensions,
        base_url=cfg.base_url or "https://open.bigmodel.cn/api/paas/v4",
    ),
    "dashscope": lambda cfg: DashScopeTextEmbedding(
        model_name=cfg.model,
        api_key=cfg.api_key,
        dimensions=cfg.dimensions,
    ),
    "ollama": lambda cfg: OllamaTextEmbedding(
        model_name=cfg.model,
        host=cfg.base_url or None,
        dimensions=cfg.dimensions,
    ),
}


def _create_embedding_model(embedding_cfg: MemoryEmbeddingConfig):
    factory = _EMBEDDING_FACTORIES.get(embedding_cfg.provider)
    if not factory:
        raise ValueError(
            f"不支持的 embedding provider: {embedding_cfg.provider}，"
            f"可选值: {list(_EMBEDDING_FACTORIES)}"
        )
    return factory(embedding_cfg)


def _build_mem0_config(memory_model, embedding_cfg: MemoryEmbeddingConfig, storage_dir: str):
    """构建 mem0 MemoryConfig，显式设置 embedding_dims 和存储路径。"""
    from pathlib import Path
    from mem0.configs.base import MemoryConfig
    from mem0.vector_stores.configs import VectorStoreConfig
    from agentscope.memory._long_term_memory._mem0._mem0_long_term_memory import (
        _create_agentscope_config_classes,
        Mem0LongTermMemory,
    )

    Mem0LongTermMemory._register_agentscope_providers()
    _ASLlmConfig, _ASEmbedderConfig = _create_agentscope_config_classes()

    embedding_model = _create_embedding_model(embedding_cfg)
    dims = embedding_cfg.dimensions

    qdrant_path = str(Path(storage_dir) / "qdrant")

    return MemoryConfig(
        llm=_ASLlmConfig(
            provider="agentscope",
            config={"model": memory_model},
        ),
        embedder=_ASEmbedderConfig(
            provider="agentscope",
            config={
                "model": embedding_model,
                "embedding_dims": dims,
            },
        ),
        vector_store=VectorStoreConfig(
            provider="qdrant",
            config={
                "embedding_model_dims": dims,
                "path": qdrant_path,
            },
        ),
    )


def create_long_term_memory(
    app_config: AppConfig,
    user_id: str,
) -> Mem0LongTermMemory | None:
    mem_cfg = app_config.memory
    if not mem_cfg.enabled:
        return None

    mc = app_config.models.get(mem_cfg.model_provider)
    if not mc:
        raise ValueError(
            f"memory 的 model_provider [{mem_cfg.model_provider}] 在 models 中未找到，"
            f"可用的有: {list(app_config.models)}"
        )

    memory_model = _create_memory_model(mc)
    storage_dir = str(get_data_dir() / "memory")
    mem0_config = _build_mem0_config(memory_model, mem_cfg.embedding, storage_dir)

    # agent_name / user_name 作为 mem0 元数据过滤键，按 user_id 隔离
    # run_name 不设，避免跨 session 检索不到历史记忆
    return Mem0LongTermMemory(
        agent_name=user_id,
        user_name=user_id,
        mem0_config=mem0_config,
    )
