from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.ext.asyncio import AsyncEngine

from agentscope.agent import ReActAgent
from agentscope.mcp import HttpStatelessClient
from agentscope.memory import AsyncSQLAlchemyMemory
from agentscope.tool import (
    Toolkit,
    execute_python_code,
    execute_shell_command,
    view_text_file,
)

from chat.config import AppConfig, get_data_dir
from chat.agent.model_factory import create_formatter, create_model
from chat.agent.user_memory import create_long_term_memory

_TEMPLATE_DIR = get_data_dir() / "templates"

_BUILTIN_TOOLS: dict[str, Any] = {
    "execute_python_code": execute_python_code,
    "execute_shell_command": execute_shell_command,
    "view_text_file": view_text_file,
}


def _parse_template(template_path: Path) -> tuple[dict, str]:
    content = template_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return {}, content
    _, frontmatter, body = content.split("---", 2)
    meta = yaml.safe_load(frontmatter) or {}
    return meta, body.strip()


_VALID_JSON_SCHEMA_TYPES = frozenset({
    "string", "integer", "number", "boolean", "object", "array", "null",
})


def _fix_schema_for_deepseek(schema: dict | list) -> dict | list:
    """递归修补 MCP 工具 JSON Schema，兼容 DeepSeek API 严格要求。

    修复三类问题：
    1. property 内 ``required: true/false`` → 删除（DeepSeek 只接受 parameters 级别的 array）
    2. ``type: false`` 或非标准 ``type``（如 ``"list"``）→ 替换为合法类型
    3. ``anyOf``/``oneOf`` 中的裸 ``false`` → 替换为 ``{"type": "string"}``
    """
    if isinstance(schema, dict):
        keys_to_delete: list[str] = []
        for key, value in schema.items():
            if key in ("anyOf", "oneOf") and isinstance(value, list):
                schema[key] = [
                    _fix_schema_for_deepseek(item) if isinstance(item, (dict, list))
                    else {"type": "string"} if item is False
                    else item
                    for item in value
                ]
            elif isinstance(value, dict):
                _fix_schema_for_deepseek(value)
            elif key == "required" and not isinstance(value, list):
                keys_to_delete.append(key)
            elif key == "type" and (
                value is False
                or (isinstance(value, str) and value not in _VALID_JSON_SCHEMA_TYPES)
            ):
                schema[key] = "array" if value == "list" else "string"
        for k in keys_to_delete:
            del schema[k]
    elif isinstance(schema, list):
        for item in schema:
            if isinstance(item, dict):
                _fix_schema_for_deepseek(item)
    return schema


async def _build_toolkit(meta: dict, mcp_config: dict, *, fix_deepseek: bool = False) -> Toolkit:
    toolkit = Toolkit()

    for tool_name in meta.get("tools", []):
        fn = _BUILTIN_TOOLS.get(tool_name)
        if fn:
            toolkit.register_tool_function(fn)

    for mcp_name in meta.get("mcp", []):
        server = mcp_config.get(mcp_name)
        if not isinstance(server, dict):
            continue
        url = server.get("url")
        if not url:
            continue
        client = HttpStatelessClient(
            name=mcp_name,
            transport=server.get("type", "streamable_http"),
            url=url,
            headers=server.get("headers", {}),
        )
        await toolkit.register_mcp_client(client, namesake_strategy="skip")

    if fix_deepseek:
        for tool in toolkit.tools.values():
            _fix_schema_for_deepseek(tool.json_schema)

    return toolkit


async def load_react_agent(
    template_name: str,
    app_config: AppConfig,
    engine: AsyncEngine,
    user_id: str | None = None,
    session_id: str | None = None,
) -> ReActAgent:
    template_path = _TEMPLATE_DIR / f"{template_name}.md"
    if not template_path.exists():
        raise FileNotFoundError(f"模板文件不存在: {template_path}")

    meta, sys_prompt = _parse_template(template_path)

    provider_name = meta.get("provider")
    if not provider_name:
        raise ValueError(f"模板 [{template_name}] 缺少必填字段: provider")

    mc = app_config.models.get(provider_name)
    if not mc:
        raise ValueError(f"配置中未找到 provider: {provider_name}，可用的有: {list(app_config.models)}")

    model_name = meta.get("model")
    if isinstance(model_name, list):
        model_name = model_name[0]

    model = create_model(mc, model_name)
    formatter = create_formatter(mc)
    toolkit = await _build_toolkit(
        meta, app_config.mcp, fix_deepseek=(provider_name == "deepseek"),
    )

    long_term_memory = create_long_term_memory(
        app_config, user_id or "",
    )

    agent = ReActAgent(
        name=meta.get("name", template_name),
        sys_prompt=sys_prompt,
        model=model,
        max_iters=mc.max_iters,
        formatter=formatter,
        toolkit=toolkit,
        long_term_memory=long_term_memory,
        long_term_memory_mode="agent_control",
        memory=AsyncSQLAlchemyMemory(
            engine_or_session=engine,
            user_id=user_id,
            session_id=session_id,
        ),
    )
    agent.set_console_output_enabled(enabled=True)
    return agent
