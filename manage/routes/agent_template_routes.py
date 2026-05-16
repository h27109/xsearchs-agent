from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

import httpx
import yaml
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import get_data_dir
from manage.auth import require_admin

_TEMPLATE_DIR = get_data_dir() / "templates"

CHAT_PROCESS_URL = "http://127.0.0.1:8090/process"

_SAFE_FIELDS = {"name", "description", "provider", "model", "color", "mcp", "tools"}

router = APIRouter(prefix="/agent-templates", tags=["agent-templates"])


# =============================================================================
# Request/Response Models
# =============================================================================

class TemplateContent(BaseModel):
    name: str
    description: str = ""
    provider: str = "deepseek"
    model: str = "deepseek-v4-pro"
    color: str = "none"
    mcp: list[str] = []
    tools: list[str] = []
    system_prompt: str = ""


class GenerateRequest(BaseModel):
    prompt: str


class GenerateResponse(BaseModel):
    identifier: str
    when_to_use: str
    system_prompt: str
    provider: str = "deepseek"
    model: str = "deepseek-v4-pro"
    color: str = "none"
    mcp: list[str] = []
    tools: list[str] = []


# =============================================================================
# Helpers: Template File I/O
# =============================================================================

def _parse_template(path: Path) -> tuple[dict, str]:
    content = path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return {}, content
    _, fm, body = content.split("---", 2)
    meta = yaml.safe_load(fm) or {}
    return meta, body.strip()


def _to_safe_meta(raw: dict) -> dict:
    return {k: v for k, v in raw.items() if k in _SAFE_FIELDS}


def _write_template(meta: dict, system_prompt: str) -> Path:
    _TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = meta.get("name", "untitled").replace(" ", "-")

    lines = ["---"]
    for k in ("name", "description", "provider", "model", "color"):
        lines.append(f"{k}: {meta.get(k, '')}")
    mcp_list = meta.get("mcp") or []
    if mcp_list:
        lines.append("mcp:")
        for item in mcp_list:
            lines.append(f"   - {item}")
    tools_list = meta.get("tools") or []
    if tools_list:
        lines.append("tools:")
        for item in tools_list:
            lines.append(f"    - {item}")
    lines.append("---")
    lines.append("")
    lines.append(system_prompt)

    file_path = _TEMPLATE_DIR / f"{safe_name}.md"
    file_path.write_text("\n".join(lines), encoding="utf-8")
    return file_path


def _get_path_by_name(name: str) -> Path | None:
    if not _TEMPLATE_DIR.is_dir():
        return None
    for f in _TEMPLATE_DIR.glob("*.md"):
        meta, _ = _parse_template(f)
        if meta.get("name") == name:
            return f
    return None


def _get_existing_names() -> list[str]:
    names: list[str] = []
    if _TEMPLATE_DIR.is_dir():
        for f in sorted(_TEMPLATE_DIR.glob("*.md")):
            meta, _ = _parse_template(f)
            names.append(meta.get("name", f.stem))
    return names


# =============================================================================
# Helpers: Chat Backend SSE Client
# =============================================================================

def _parse_sse_line(line: str) -> dict | None:
    """解析单行 SSE data。"""
    if not line.startswith("data: "):
        return None
    json_str = line[6:].strip()
    if not json_str:
        return None
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        return None


def _extract_text_from_event(event: dict) -> str | None:
    """从单个 SSE 事件中提取文本 delta。"""
    if event.get("object") == "content" and event.get("type") == "text":
        return event.get("text") or ""
    return None


def _extract_final_text(events: list[dict]) -> str:
    """从 completed 事件中提取完整文本。"""
    for event in events:
        if event.get("object") == "response" and event.get("status") == "completed":
            output = event.get("output") or []
            for msg in output:
                if msg.get("role") != "assistant":
                    continue
                content = msg.get("content")
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            parts.append(block.get("text", ""))
                    return "".join(parts)
    return ""


def _parse_md_from_text(text: str) -> tuple[dict, str]:
    """解析 LLM 输出的 Markdown 模板，提取 frontmatter + body。"""
    text = text.strip()
    text = re.sub(r"^```(?:markdown|md)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            fm = yaml.safe_load(parts[1]) or {}
            return fm, parts[2].strip()
    raise ValueError("响应中未找到有效的 YAML frontmatter")


async def _stream_agent_generator(
    user_prompt: str,
    auth_header: str,
    existing_names: list[str],
):
    """流式调用 chat 后端，逐块转发文本 delta，最终发送 completed 事件。"""
    existing_hint = ""
    if existing_names:
        existing_hint = f"\n\n注意：以下模板名称已存在，请避免使用：{', '.join(existing_names)}"

    headers = {"Content-Type": "application/json"}
    if auth_header:
        headers["Authorization"] = auth_header

    payload = {
        "input": [
            {
                "role": "user",
                "content": [{"type": "text", "text": user_prompt + existing_hint}],
            }
        ],
        "session_id": str(uuid.uuid4()),
        "stream": True,
        "agent_id": "agent-generator",
    }

    accumulated_events: list[dict] = []

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", CHAT_PROCESS_URL, json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    event = _parse_sse_line(line)
                    if event is None:
                        continue

                    if event.get("error"):
                        yield f"event: error\ndata: {json.dumps({'message': event['error'].get('message', str(event['error']))}, ensure_ascii=False)}\n\n"
                        return

                    text = _extract_text_from_event(event)
                    if text is not None:
                        accumulated_events.append(event)
                        yield f"event: delta\ndata: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
                    elif event.get("object") == "response" and event.get("status") == "completed":
                        accumulated_events.append(event)

        # 流结束，提取完整文本并解析模板
        full_text = _extract_final_text(accumulated_events)
        if not full_text:
            # fallback: 拼接 delta
            full_text = "".join(
                _extract_text_from_event(e) or "" for e in accumulated_events
            )

        if not full_text:
            yield f"event: error\ndata: {json.dumps({'message': 'chat 后端未返回有效响应'}, ensure_ascii=False)}\n\n"
            return

        fm, body = _parse_md_from_text(full_text)
        if not fm.get("name") or not body:
            yield f"event: error\ndata: {json.dumps({'message': '生成的模板不完整，缺少 name 或 system prompt'}, ensure_ascii=False)}\n\n"
            return

        result = GenerateResponse(
            identifier=fm["name"],
            when_to_use=fm.get("description", ""),
            system_prompt=body,
            provider=fm.get("provider", "deepseek"),
            model=fm.get("model", "deepseek-v4-pro"),
            color=fm.get("color", "none"),
            mcp=fm.get("mcp") or [],
            tools=fm.get("tools") or [],
        )
        yield f"event: completed\ndata: {result.model_dump_json()}\n\n"

    except httpx.HTTPStatusError as e:
        yield f"event: error\ndata: {json.dumps({'message': f'chat 后端返回 {e.response.status_code}'}, ensure_ascii=False)}\n\n"
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'message': str(e)}, ensure_ascii=False)}\n\n"


# =============================================================================
# Routes
# =============================================================================

@router.get("")
async def list_agent_templates():
    templates = []
    if _TEMPLATE_DIR.is_dir():
        for f in sorted(_TEMPLATE_DIR.glob("*.md")):
            meta, _ = _parse_template(f)
            templates.append(_to_safe_meta(meta))
    return {"agent_templates": templates}


@router.get("/{name}")
async def get_agent_template(name: str):
    path = _get_path_by_name(name)
    if path is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    meta, body = _parse_template(path)
    return {"name": name, "system_prompt": body, **_to_safe_meta(meta)}


@router.post("")
async def create_agent_template(
    payload: TemplateContent,
    _admin: dict = Depends(require_admin),
):
    existing = _get_path_by_name(payload.name)
    if existing is not None:
        raise HTTPException(status_code=409, detail="模板名称已存在")
    meta = payload.model_dump(exclude={"system_prompt"})
    _write_template(meta, payload.system_prompt)
    return {"message": f"模板 '{payload.name}' 创建成功"}


@router.put("/{name}")
async def update_agent_template(
    name: str,
    payload: TemplateContent,
    _admin: dict = Depends(require_admin),
):
    path = _get_path_by_name(name)
    if path is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    if payload.name != name:
        existing = _get_path_by_name(payload.name)
        if existing is not None:
            raise HTTPException(status_code=409, detail="新名称已被占用")
        path.unlink()
    meta = payload.model_dump(exclude={"system_prompt"})
    _write_template(meta, payload.system_prompt)
    return {"message": f"模板 '{payload.name}' 更新成功"}


@router.delete("/{name}")
async def delete_agent_template(
    name: str,
    _admin: dict = Depends(require_admin),
):
    path = _get_path_by_name(name)
    if path is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    path.unlink()
    return {"message": f"模板 '{name}' 已删除"}


@router.post("/generate")
async def generate_agent_template(
    payload: GenerateRequest,
    request: Request,
    _admin: dict = Depends(require_admin),
):
    auth_header = request.headers.get("Authorization", "")
    return StreamingResponse(
        _stream_agent_generator(
            user_prompt=payload.prompt,
            auth_header=auth_header,
            existing_names=_get_existing_names(),
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
