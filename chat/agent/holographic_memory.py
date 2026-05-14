from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
from typing import Any

import numpy as np
from numpy.typing import NDArray

from agentscope.memory import LongTermMemoryBase
from agentscope.message import Msg, TextBlock
from agentscope.tool import ToolResponse


class HolographicLongTermMemory(LongTermMemoryBase):
    """基于 Holographic Reduced Representations 的长期记忆。

    不使用 embedding API，通过 n-gram 随机投影将文本编码为高维向量，
    所有记忆叠加在一条全息迹向量中，同时支持精确检索。
    """

    def __init__(
        self,
        dims: int = 1024,
        ngram_min: int = 2,
        ngram_max: int = 4,
        db_path: str = "",
        agent_name: str = "",
        user_name: str = "",
    ):
        super().__init__()
        self.dims = dims
        self.ngram_min = ngram_min
        self.ngram_max = ngram_max
        self.db_path = db_path
        self.agent_name = agent_name
        self.user_name = user_name

        self._trace: NDArray[np.float64] = np.zeros(dims)
        self._count: int = 0

    # ---- 向量编码 ----

    def _hash_vector(self, token: str) -> NDArray[np.float64]:
        """将 token（n-gram）映射为确定性随机单位向量。"""
        seed = int(hashlib.md5(token.encode()).hexdigest(), 16) % (2**31)
        rng = np.random.RandomState(seed)
        vec = rng.randn(self.dims)
        return vec / np.linalg.norm(vec)

    def _encode(self, text: str) -> NDArray[np.float64]:
        """N-gram 随机投影：文本 → 向量。

        对每个 n-gram 生成确定性随机向量并叠加，最后归一化。
        中文字符级 n-gram 天然覆盖常见词组模式。
        """
        vec = np.zeros(self.dims)
        count = 0
        for n in range(self.ngram_min, self.ngram_max + 1):
            for i in range(len(text) - n + 1):
                ngram = text[i : i + n]
                vec += self._hash_vector(ngram)
                count += 1
        if count > 0:
            vec /= np.sqrt(count)
        return vec

    @staticmethod
    def _cosine(a: NDArray[np.float64], b: NDArray[np.float64]) -> float:
        return float(
            np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10)
        )

    # ---- 存储 ----

    @property
    def _uid(self) -> str:
        return self.user_name or self.agent_name or "default"

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS holographic_memory (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                vector_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_hm_user ON holographic_memory(user_id)"
        )
        conn.commit()
        return conn

    # ---- Agent 工具接口 (agent_control 模式) ----

    async def record_to_memory(
        self,
        thinking: str,
        content: list[str],
        **kwargs: Any,
    ) -> ToolResponse:
        uid = self._uid
        recorded: list[str] = []

        def _store() -> None:
            conn = self._get_conn()
            for text in content:
                text = text.strip()
                if not text:
                    continue
                vec = self._encode(text)
                mem_id = hashlib.md5(f"{uid}:{text}".encode()).hexdigest()
                conn.execute(
                    "INSERT OR REPLACE INTO holographic_memory "
                    "(id, user_id, content, vector_json) VALUES (?, ?, ?, ?)",
                    (mem_id, uid, text, json.dumps(vec.tolist())),
                )
                self._trace += vec
                self._count += 1
                recorded.append(text)
            conn.commit()
            conn.close()

        await asyncio.to_thread(_store)
        return ToolResponse(
            content=[TextBlock(type="text", text=f"已记录 {len(recorded)} 条记忆")],
            metadata={"recorded": recorded},
        )

    async def retrieve_from_memory(
        self,
        keywords: list[str],
        limit: int = 5,
        **kwargs: Any,
    ) -> ToolResponse:
        uid = self._uid
        query_vec = self._encode(" ".join(keywords))

        def _search() -> list[str]:
            conn = self._get_conn()
            rows = conn.execute(
                "SELECT content, vector_json FROM holographic_memory WHERE user_id = ?",
                (uid,),
            ).fetchall()
            conn.close()

            if not rows:
                return []

            scored: list[tuple[float, str]] = []
            for content, vec_json in rows:
                stored_vec = np.array(json.loads(vec_json))
                scored.append((self._cosine(query_vec, stored_vec), content))

            scored.sort(key=lambda x: x[0], reverse=True)
            return [content for _, content in scored[:limit]]

        memories = await asyncio.to_thread(_search)
        if not memories:
            return ToolResponse(
                content=[TextBlock(type="text", text="未找到相关记忆")],
                metadata={"memories": []},
            )

        return ToolResponse(
            content=[TextBlock(
                type="text",
                text="相关记忆：\n" + "\n".join(f"- {m}" for m in memories),
            )],
            metadata={"memories": memories},
        )

    # ---- 开发者接口 ----

    async def record(
        self,
        msgs: list[Msg | None],
        **kwargs: Any,
    ) -> None:
        for msg in reversed(msgs):
            if msg is None:
                continue
            text = msg.get_text_content()
            if text and text.strip() and len(text) >= 20:
                await self.record_to_memory(
                    thinking="自动记录对话内容",
                    content=[text[:500]],
                )
                return

    async def retrieve(
        self,
        msg: Msg | list[Msg] | None,
        limit: int = 5,
        **kwargs: Any,
    ) -> str:
        text = ""
        if isinstance(msg, list):
            for m in reversed(msg):
                if m is not None:
                    text = m.get_text_content()
                    if text:
                        break
        elif msg is not None:
            text = msg.get_text_content()

        if not text or not text.strip():
            return ""

        result = await self.retrieve_from_memory(
            keywords=[text[:200]],
            limit=limit,
        )
        memories: list[str] = (result.metadata or {}).get("memories", [])
        if not memories:
            return ""

        return "## 相关历史记忆\n" + "\n".join(f"- {m}" for m in memories)

    # ---- 生命周期 ----

    async def async_init(self) -> None:
        def _rebuild() -> None:
            conn = self._get_conn()
            rows = conn.execute(
                "SELECT vector_json FROM holographic_memory WHERE user_id = ?",
                (self._uid,),
            ).fetchall()
            conn.close()
            self._trace = np.zeros(self.dims)
            self._count = 0
            for (vec_json,) in rows:
                self._trace += np.array(json.loads(vec_json))
                self._count += 1

        await asyncio.to_thread(_rebuild)

    @property
    def name(self) -> str:
        return "holographic_long_term_memory"
