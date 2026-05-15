from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine

from agentscope.mcp import HttpStatelessClient
from agentscope.memory import AsyncSQLAlchemyMemory
from agentscope.tool import (
    Toolkit,
    execute_python_code,
    execute_shell_command,
    view_text_file,
    write_text_file,
)

from config import AppConfig, get_data_dir
from chat.agent.model_factory import create_formatter, create_model
from chat.agent.react_agent_factory import _fix_schema_for_deepseek, _parse_template
from chat.agent.deep_research.deep_research_agent import DeepResearchAgent
from chat.agent.deep_research.utils import load_prompt_dict

_TEMPLATE_DIR = get_data_dir() / "templates"

_BUILTIN_TOOLS = {
    "execute_python_code": execute_python_code,
    "execute_shell_command": execute_shell_command,
    "view_text_file": view_text_file,
    "write_text_file": write_text_file,
}


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


async def load_deep_research_agent(
    template_name: str,
    app_config: AppConfig,
    engine: AsyncEngine,
    user_id: str | None = None,
    session_id: str | None = None,
) -> DeepResearchAgent:
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

    max_iters = meta.get("max_iters", mc.max_iters)
    max_depth = meta.get("max_depth", 3)
    tmp_file_storage_dir = meta.get("tmp_dir", str(get_data_dir() / "deep_research"))

    prompt_dict = load_prompt_dict()
    add_note = prompt_dict["add_note"].format_map(
        {"finish_function_name": "generate_response"},
    )
    tool_use_rule = prompt_dict["tool_use_rule"].format_map(
        {"tmp_file_storage_dir": tmp_file_storage_dir},
    )
    enhanced_sys_prompt = f"{sys_prompt}\n{add_note}\n{tool_use_rule}"

    agent = DeepResearchAgent(
        name=meta.get("name", template_name),
        model=model,
        formatter=formatter,
        memory=AsyncSQLAlchemyMemory(
            engine_or_session=engine,
            user_id=user_id,
            session_id=session_id,
        ),
        search_mcp_client=None,
        sys_prompt=enhanced_sys_prompt,
        max_iters=max_iters,
        max_depth=max_depth,
        tmp_file_storage_dir=tmp_file_storage_dir,
    )
    agent.set_console_output_enabled(enabled=True)
    return agent
