from __future__ import annotations
from config import get_data_dir

import aiosqlite

_DB_PATH = str(get_data_dir() / "memory.db")


def get_db() -> aiosqlite.Connection:
    return aiosqlite.connect(_DB_PATH)
