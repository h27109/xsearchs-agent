from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials

from manage.auth import create_token, delete_token, get_current_user, security_scheme
from manage.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(request: dict):
    user_id = (request.get("id") or "").strip()
    password = (request.get("password") or "").strip()

    if not user_id:
        return JSONResponse(status_code=422, content={"error": "用户名不能为空"})

    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, passwd, is_admin, is_active FROM users WHERE id = ?",
            (user_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        if not row["is_active"]:
            raise HTTPException(status_code=403, detail="账号已被禁用")
        stored_passwd = row["passwd"] or ""

    if not stored_passwd:
        if password:
            async with get_db() as db:
                await db.execute(
                    "UPDATE users SET passwd = ? WHERE id = ?",
                    (password, user_id),
                )
                await db.commit()
        else:
            return {"need_set_password": True, "user_id": user_id, "is_admin": bool(row["is_admin"])}
    else:
        if not password:
            raise HTTPException(status_code=401, detail="请输入密码")
        if password != stored_passwd:
            raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = await create_token(user_id)
    return {"token": token, "user_id": user_id, "is_admin": bool(row["is_admin"])}


@router.post("/set-password")
async def set_password(
    request: dict,
    user: dict = Depends(get_current_user),
):
    new_password = (request.get("new_password") or "").strip()
    if not new_password:
        return JSONResponse(status_code=422, content={"error": "密码不能为空"})

    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT passwd FROM users WHERE id = ?", (user["user_id"],)
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        if row["passwd"]:
            return JSONResponse(
                status_code=400, content={"error": "密码已设置，请使用修改密码接口"}
            )
        await db.execute(
            "UPDATE users SET passwd = ? WHERE id = ?",
            (new_password, user["user_id"]),
        )
        await db.commit()
    return {"success": True}


@router.post("/change-password")
async def change_password(
    request: dict,
    user: dict = Depends(get_current_user),
):
    old_password = (request.get("old_password") or "").strip()
    new_password = (request.get("new_password") or "").strip()

    if not old_password or not new_password:
        return JSONResponse(status_code=422, content={"error": "旧密码和新密码不能为空"})

    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT passwd FROM users WHERE id = ?", (user["user_id"],)
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        if not row["passwd"] or old_password != row["passwd"]:
            raise HTTPException(status_code=401, detail="旧密码错误")
        await db.execute(
            "UPDATE users SET passwd = ? WHERE id = ?",
            (new_password, user["user_id"]),
        )
        await db.commit()
    return {"success": True}


@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
):
    if credentials:
        await delete_token(credentials.credentials)
    return {"success": True}


@router.get("/verify")
async def verify(user: dict = Depends(get_current_user)):
    return {"valid": True, "user_id": user["user_id"], "is_admin": user["is_admin"]}
