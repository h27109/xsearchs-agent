from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from manage.auth import get_current_user, require_admin
from manage.database import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def list_users(_admin: dict = Depends(require_admin)):
    users = []
    async with get_db() as db:
        db.row_factory = __import__("aiosqlite").Row
        rows = await db.execute(
            "SELECT id, is_admin, is_active FROM users ORDER BY id",
        )
        for row in await rows.fetchall():
            users.append({
                "id": row["id"],
                "is_admin": bool(row["is_admin"]),
                "is_active": bool(row["is_active"]),
            })
    return {"users": users}


@router.post("")
async def create_user(
    request: dict,
    _admin: dict = Depends(require_admin),
):
    user_id = (request.get("id") or "").strip()
    if not user_id:
        return JSONResponse(status_code=422, content={"error": "用户名不能为空"})

    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if await cursor.fetchone():
            return JSONResponse(status_code=409, content={"error": "用户已存在"})
        await db.execute(
            "INSERT INTO users (id, is_admin, is_active) VALUES (?, 0, 1)",
            (user_id,),
        )
        await db.commit()
    return {"id": user_id}


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    request: dict,
    _admin: dict = Depends(require_admin),
):
    if user_id == "admin":
        return JSONResponse(status_code=403, content={"error": "不能修改 admin 用户"})

    updates = []
    values: list = []
    if "is_admin" in request:
        updates.append("is_admin = ?")
        values.append(1 if request["is_admin"] else 0)
    if "is_active" in request:
        updates.append("is_active = ?")
        values.append(1 if request["is_active"] else 0)

    if not updates:
        return JSONResponse(status_code=422, content={"error": "无有效更新字段"})

    values.append(user_id)
    async with get_db() as db:
        await db.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
            tuple(values),
        )
        await db.commit()
    return {"success": True}


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    _admin: dict = Depends(require_admin),
):
    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if await cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        await db.execute(
            "UPDATE users SET passwd = NULL WHERE id = ?", (user_id,)
        )
        await db.commit()
    return {"success": True}
