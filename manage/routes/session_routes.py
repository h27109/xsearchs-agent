from __future__ import annotations

import json
import aiosqlite
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from manage.auth import get_current_user
from manage.database import get_db

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(user: dict = Depends(get_current_user)):
    sessions = []
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute(
            """SELECT s.id, s.user_id, s.name, s.agent_id, COUNT(m.id) as msg_count
               FROM session s
               LEFT JOIN message m ON m.session_id = s.id
               WHERE s.user_id = ?
               GROUP BY s.id ORDER BY s.rowid DESC""",
            (user["user_id"],),
        )
        for row in await rows.fetchall():
            sessions.append({
                "id": row["id"],
                "user_id": row["user_id"],
                "name": row["name"],
                "agent_id": row["agent_id"],
                "msg_count": row["msg_count"],
            })
    return {"sessions": sessions}


@router.post("")
async def create_session(
    request: dict,
    user: dict = Depends(get_current_user),
):
    session_id = request.get("id") or str(uuid4())
    name = request.get("name", "")
    agent_id = request.get("agent_id", "simple-react-agent")

    async with get_db() as db:
        await db.execute(
            "INSERT OR IGNORE INTO session (id, user_id, name, agent_id) VALUES (?, ?, ?, ?)",
            (session_id, user["user_id"], name, agent_id),
        )
        await db.commit()

    return {"id": session_id, "user_id": user["user_id"], "name": name, "agent_id": agent_id}


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    request: dict,
    user: dict = Depends(get_current_user),
):
    name = (request.get("name") or "").strip()
    if not name:
        return JSONResponse(status_code=422, content={"error": "会话名称不能为空"})

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT user_id FROM session WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="会话不存在")
        if row[0] != user["user_id"]:
            raise HTTPException(status_code=403, detail="无权修改此会话")

        await db.execute(
            "UPDATE session SET name = ? WHERE id = ?",
            (name, session_id),
        )
        await db.commit()

    return {"success": True}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT user_id FROM session WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="会话不存在")
        if row[0] != user["user_id"]:
            raise HTTPException(status_code=403, detail="无权删除此会话")

        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("DELETE FROM message WHERE session_id = ?", (session_id,))
        await db.execute("DELETE FROM session WHERE id = ?", (session_id,))
        await db.commit()

    return {"success": True}


@router.get("/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT user_id FROM session WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="会话不存在")
        if row[0] != user["user_id"]:
            raise HTTPException(status_code=403, detail="无权查看此会话")

        db.row_factory = aiosqlite.Row
        rows = await db.execute(
            'SELECT msg, "index" FROM message WHERE session_id = ? ORDER BY "index"',
            (session_id,),
        )
        messages = []
        for r in await rows.fetchall():
            msg = json.loads(r["msg"])
            msg["_index"] = r["index"]
            messages.append(msg)

    return {"messages": messages}
