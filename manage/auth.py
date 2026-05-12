from __future__ import annotations

import aiosqlite
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from manage.database import get_db

security_scheme = HTTPBasic(auto_error=False)


async def verify_password(user_id: str, password: str) -> dict | None:
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT is_admin, is_active, passwd FROM users WHERE id = ?",
            (user_id,),
        )
        row = await cursor.fetchone()
        if row is None or row["passwd"] != password:
            return None
        return {
            "user_id": user_id,
            "is_admin": bool(row["is_admin"]),
            "is_active": bool(row["is_active"]),
        }


async def get_current_user(
    credentials: HTTPBasicCredentials | None = Depends(security_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="请提供认证信息")
    user = await verify_password(credentials.username, credentials.password)
    if user is None:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="账号已被禁用")
    return user


async def require_admin(
    user: dict = Depends(get_current_user),
) -> dict:
    if not user["is_admin"]:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user
