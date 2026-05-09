from __future__ import annotations
from src.config import get_data_dir

import json
import aiosqlite

_DB_PATH = str(get_data_dir() / "memory.db")


def get_db() -> aiosqlite.Connection:
    return aiosqlite.connect(_DB_PATH)

async def load_messages(session_id: str) -> list[dict]:
    messages = []
    async with get_db() as db:
        db.row_factory = __import__("aiosqlite").Row
        rows = await db.execute(
            'SELECT msg FROM message WHERE session_id = ? ORDER BY "index"',
            (session_id,),
        )
        async for row in rows:
            messages.append(json.loads(row["msg"]))
    return messages


async def update_session_name(session_id: str, name: str) -> None:
    async with get_db() as db:
        await db.execute(
            "UPDATE session SET name = ? WHERE id = ? AND (name IS NULL OR name = '')",
            (name, session_id),
        )
        await db.commit()
