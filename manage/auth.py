from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import aiosqlite
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from manage.database import get_db

_TOKEN_TTL_HOURS = 24
security_scheme = HTTPBearer(auto_error=False)


async def create_token(user_id: str) -> str:
    token = str(uuid.uuid4())
    async with get_db() as db:
        await db.execute(
            "INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)",
            (token, user_id),
        )
        await db.commit()
    return token


async def verify_token(token: str) -> dict | None:
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT t.user_id, t.created_at, u.is_admin, u.is_active, u.passwd
               FROM auth_tokens t
               JOIN users u ON u.id = t.user_id
               WHERE t.token = ?""",
            (token,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        created_at = datetime.fromisoformat(row["created_at"])
        if datetime.utcnow() - created_at > timedelta(hours=_TOKEN_TTL_HOURS):
            await db.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
            await db.commit()
            return None
        return {
            "user_id": row["user_id"],
            "is_admin": bool(row["is_admin"]),
            "is_active": bool(row["is_active"]),
        }


async def delete_token(token: str) -> None:
    async with get_db() as db:
        await db.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
        await db.commit()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> dict | None:
    if credentials is None:
        return None
    user_info = await verify_token(credentials.credentials)
    if user_info is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user_info["is_active"]:
        raise HTTPException(status_code=403, detail="账号已被禁用")
    return user_info


async def require_admin(
    user: dict | None = Depends(get_current_user),
) -> dict:
    if user is None:
        raise HTTPException(status_code=401, detail="请先登录")
    if not user["is_admin"]:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user
