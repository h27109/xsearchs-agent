from __future__ import annotations

import os
from pathlib import Path

import aiosqlite

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _get_data_dir() -> Path:
    env = os.environ.get("XSEARCHS_USER_DATA")
    if env:
        return Path(env)
    return _PROJECT_ROOT / "data"


_DB_PATH = str(_get_data_dir() / "memory.db")


def get_db() -> aiosqlite.Connection:
    return aiosqlite.connect(_DB_PATH)

_INIT_SQL = [
    """CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) NOT NULL,
        passwd VARCHAR(255),
        is_admin INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        PRIMARY KEY (id)
    )""",
    """CREATE TABLE IF NOT EXISTS session (
        id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) DEFAULT '',
        agent_id VARCHAR(255) DEFAULT 'simple-react-agent',
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id)
    )""",
    """CREATE TABLE IF NOT EXISTS message (
        id VARCHAR(255) NOT NULL,
        msg JSON NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        "index" BIGINT NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(session_id) REFERENCES session (id)
    )""",
    """CREATE TABLE IF NOT EXISTS message_mark (
        msg_id VARCHAR(255) NOT NULL,
        mark VARCHAR(255) NOT NULL,
        PRIMARY KEY (msg_id, mark),
        FOREIGN KEY(msg_id) REFERENCES message (id) ON DELETE CASCADE
    )""",
    """CREATE TABLE IF NOT EXISTS auth_tokens (
        token VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (token),
        FOREIGN KEY(user_id) REFERENCES users (id)
    )""",
    """CREATE INDEX IF NOT EXISTS ix_message_index ON message ("index")""",
]


async def init_db() -> None:
    os.makedirs(str(_get_data_dir()), exist_ok=True)
    async with aiosqlite.connect(_DB_PATH) as db:
        for sql in _INIT_SQL:
            await db.execute(sql)
        # Migration: add agent_id column for existing databases
        try:
            await db.execute(
                "ALTER TABLE session ADD COLUMN agent_id VARCHAR(255) DEFAULT 'simple-react-agent'"
            )
        except aiosqlite.OperationalError:
            pass
        await db.execute(
            "INSERT OR IGNORE INTO users (id, is_admin, is_active) "
            "VALUES ('admin', 1, 1)",
        )
        await db.commit()
