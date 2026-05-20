"""Nacos 配置中心客户端 — 获取 agent 模板并同步到 data/templates/。

agent 分组的配置为 Agent Card JSON，提取 description 字段写入 .md 模板。
非 agent 分组的配置写入 data/nacos-cache/<group>/<dataId>。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from v2.nacos import ClientConfigBuilder, ConfigParam, GRPCConfig, NacosConfigService

from manage.database import get_data_dir

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nacos-client")

load_dotenv(get_data_dir() / ".env")

NACOS_USER_NAME = os.getenv("NACOS_USER_NAME", "")
NACOS_PASSWORD = os.getenv("NACOS_PASSWORD", "")
NACOS_SERVER_ADDR = os.getenv("NACOS_SERVER_ADDR", "")
NACOS_NAMESPACE = os.getenv("NACOS_NAME_SPACE", "")

AGENT_GROUP = "agent"

_watcher_task: asyncio.Task | None = None


def _nacos_http_base() -> str:
    addr = NACOS_SERVER_ADDR.rstrip("/")
    return f"{addr}/nacos"


def _build_client_config() -> ClientConfigBuilder:
    if not NACOS_SERVER_ADDR:
        raise RuntimeError("NACOS_SERVER_ADDR 未配置，请检查 data/.env")
    return (
        ClientConfigBuilder()
        .username(NACOS_USER_NAME)
        .password(NACOS_PASSWORD)
        .server_address(NACOS_SERVER_ADDR)
        .namespace_id(NACOS_NAMESPACE)
        .context_path("nacos")
        .log_level("INFO")
        .grpc_config(GRPCConfig(grpc_timeout=5000))
    )


# ---------------------------------------------------------------------------
# Admin API
# ---------------------------------------------------------------------------


async def _get_access_token(session: aiohttp.ClientSession) -> str:
    url = f"{_nacos_http_base()}/v1/auth/login"
    async with session.post(
        url, data={"username": NACOS_USER_NAME, "password": NACOS_PASSWORD}
    ) as resp:
        body = await resp.json()
        return body["accessToken"]


async def list_configs(
    group: str | None = None,
    page_size: int = 100,
) -> list[dict]:
    url = f"{_nacos_http_base()}/v3/admin/cs/config/list"
    params: dict[str, str | int] = {
        "namespaceId": NACOS_NAMESPACE,
        "pageNo": 1,
        "pageSize": page_size,
    }
    if group:
        params["group"] = group

    async with aiohttp.ClientSession() as session:
        token = await _get_access_token(session)
        params["accessToken"] = token
        async with session.get(url, params=params) as resp:
            body = await resp.json()

    if body.get("code") != 0:
        raise RuntimeError(f"Admin API 错误: {body}")
    return body["data"].get("pageItems", [])


# ---------------------------------------------------------------------------
# 模板同步：Nacos agent config → data/templates/<name>.md
# ---------------------------------------------------------------------------


def sync_agent_template(data_id: str, content: str) -> Path | None:
    """将 Nacos agent 配置转换为本地 .md 模板。"""
    try:
        card = json.loads(content)
        template_content = card.get("description", "")
        name = card.get("name", data_id)
    except json.JSONDecodeError:
        template_content = content
        name = data_id

    if not template_content.strip():
        logger.warning("模板内容为空: %s, 跳过", data_id)
        return None

    path = get_data_dir() / "templates" / f"{name}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(template_content, encoding="utf-8")
    logger.info("同步模板: %s → %s", data_id, path)
    return path


# ---------------------------------------------------------------------------
# 非 agent 分组：写入 data/nacos-cache/
# ---------------------------------------------------------------------------


def _write_to_cache(data_id: str, group: str, content: str) -> Path:
    safe_group = group.replace("/", "_")
    safe_data_id = data_id.replace("/", "_")
    d = get_data_dir() / "nacos-cache" / safe_group
    d.mkdir(parents=True, exist_ok=True)
    path = d / safe_data_id
    path.write_text(content, encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# 拉取 & 同步
# ---------------------------------------------------------------------------


async def fetch_agent_templates() -> None:
    """拉取 agent 分组所有配置，同步到 data/templates/。"""
    if not NACOS_SERVER_ADDR:
        logger.warning("NACOS_SERVER_ADDR 未配置，跳过模板同步")
        return

    try:
        items = await list_configs(group=AGENT_GROUP)
    except Exception as e:
        logger.error("拉取 agent 配置失败: %s", e)
        return

    # Nacos group 参数是模糊匹配，需精确过滤
    items = [i for i in items if i["groupName"] == AGENT_GROUP]

    if not items:
        logger.info("Nacos agent 分组无配置项")
        return

    config = _build_client_config().build()
    client = await NacosConfigService.create_config_service(config)
    try:
        for item in items:
            did, grp = item["dataId"], item["groupName"]
            content = await client.get_config(ConfigParam(data_id=did, group=grp))
            if content:
                sync_agent_template(did, content)
            else:
                logger.warning("配置 %s@%s 为空", did, grp)
    finally:
        await client.shutdown()


async def fetch_all_configs() -> None:
    """拉取所有分组配置，agent 分组走模板同步，其余走 cache。"""
    if not NACOS_SERVER_ADDR:
        logger.warning("NACOS_SERVER_ADDR 未配置，跳过配置拉取")
        return

    items = await list_configs()
    if not items:
        logger.info("Nacos 无配置项")
        return

    config = _build_client_config().build()
    client = await NacosConfigService.create_config_service(config)
    try:
        for item in items:
            did, grp = item["dataId"], item["groupName"]
            content = await client.get_config(ConfigParam(data_id=did, group=grp))
            if not content:
                logger.warning("配置 %s@%s 为空", did, grp)
                continue
            if grp == AGENT_GROUP:
                sync_agent_template(did, content)
            else:
                path = _write_to_cache(did, grp, content)
                logger.info("缓存: %s@%s → %s", did, grp, path)
    finally:
        await client.shutdown()


# ---------------------------------------------------------------------------
# Watch
# ---------------------------------------------------------------------------


async def watch_agent_templates() -> None:
    """监听 agent 分组配置变更，变更时自动同步模板。"""
    if not NACOS_SERVER_ADDR:
        logger.warning("NACOS_SERVER_ADDR 未配置，跳过模板监听")
        return

    try:
        items = await list_configs(group=AGENT_GROUP)
    except Exception as e:
        logger.error("拉取 agent 配置失败，无法监听: %s", e)
        return

    # Nacos group 参数是模糊匹配，需精确过滤
    items = [i for i in items if i["groupName"] == AGENT_GROUP]

    if not items:
        logger.info("Nacos agent 分组无配置项，跳过监听")
        return

    logger.info("发现 %d 个 agent 配置项，开始监听...", len(items))

    config = _build_client_config().build()
    client = await NacosConfigService.create_config_service(config)

    listeners: list[tuple[str, str, object]] = []

    async def on_change(tenant: str, did: str, grp: str, content: str) -> None:
        logger.info("[变更] %s@%s", did, grp)
        if content:
            sync_agent_template(did, content)
        else:
            logger.warning("[变更] %s@%s 内容为空", did, grp)

    for item in items:
        did, grp = item["dataId"], item["groupName"]
        content = await client.get_config(ConfigParam(data_id=did, group=grp))
        if content:
            sync_agent_template(did, content)
        await client.add_listener(data_id=did, group=grp, listener=on_change)
        listeners.append((did, grp, on_change))
        logger.info("  监听: %s@%s", did, grp)

    logger.info("agent 模板监听已注册，等待变更...")
    try:
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        pass
    finally:
        for did, grp, listener in listeners:
            await client.remove_listener(data_id=did, group=grp, listener=listener)
        await client.shutdown()
        logger.info("已退出模板监听")


def start_nacos_watcher() -> None:
    """在后台启动 nacos watch 任务。"""
    global _watcher_task
    if _watcher_task is not None and not _watcher_task.done():
        logger.info("nacos watcher 已在运行")
        return

    async def _run() -> None:
        try:
            await watch_agent_templates()
        except Exception as e:
            logger.error("nacos watcher 异常退出: %s", e)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        _watcher_task = loop.create_task(_run())
        logger.info("nacos watcher 后台任务已启动")
    else:
        logger.warning("无运行中的 event loop，nacos watcher 未启动")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


async def test_connection() -> None:
    try:
        items = await list_configs()
        logger.info("[OK] Nacos 连接成功，配置项 %d 个:", len(items))
        for item in items:
            logger.info(
                "  %s@%s (md5=%s)", item["dataId"], item["groupName"], item["md5"]
            )
    except Exception as e:
        logger.error("[FAIL] Nacos 连接失败 — %s", e)


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "test"

    if action == "test":
        asyncio.run(test_connection())
    elif action == "get":
        asyncio.run(fetch_agent_templates())
    elif action == "get-all":
        asyncio.run(fetch_all_configs())
    elif action == "watch":
        asyncio.run(watch_agent_templates())
    else:
        print("用法: python nacos_client.py [test|get|get-all|watch]")
