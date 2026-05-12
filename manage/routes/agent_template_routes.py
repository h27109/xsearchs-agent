from __future__ import annotations

from pathlib import Path

import yaml
from fastapi import APIRouter

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "templates"

router = APIRouter(prefix="/agent-templates", tags=["agent-templates"])


def _parse_template(template_path: Path) -> tuple[dict, str]:
    content = template_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return {}, content
    _, frontmatter, body = content.split("---", 2)
    meta = yaml.safe_load(frontmatter) or {}
    return meta, body.strip()


@router.get("")
async def list_agent_templates():
    templates = []
    if _TEMPLATE_DIR.is_dir():
        for f in sorted(_TEMPLATE_DIR.glob("*.md")):
            meta, _ = _parse_template(f)
            templates.append({
                "name": meta.get("name", f.stem),
                "description": meta.get("description", ""),
                "provider": meta.get("provider", ""),
                "model": meta.get("model", ""),
                "color": meta.get("color", "none"),
            })
    return {"agent_templates": templates}
