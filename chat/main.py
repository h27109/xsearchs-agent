from contextlib import asynccontextmanager

import aiosqlite
from agentscope.pipeline import stream_printing_messages
from agentscope.session import RedisSession

from agentscope_runtime.engine import AgentApp
from agentscope_runtime.engine.schemas.agent_schemas import AgentRequest

from config import load_config
from chat.agent.react_agent_factory import load_react_agent
from chat.agent.deep_research_agent_factory import load_deep_research_agent
from chat.session import get_db

FALLBACK_TEMPLATE = "simple-react-agent"


async def ensure_session(session_id: str, user_id: str, agent_id: str, first_message: str = "") -> None:
    """Auto-create session row if not exists, using first message as name."""
    async with get_db() as db:
        name = first_message[:50] if first_message else ""
        await db.execute(
            "INSERT OR IGNORE INTO session (id, user_id, name, agent_id) VALUES (?, ?, ?, ?)",
            (session_id, user_id, name, agent_id),
        )
        await db.commit()


@asynccontextmanager
async def lifespan(app):
    import fakeredis

    app.state.config = load_config()
    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    app.state.session = RedisSession(connection_pool=fake_redis.connection_pool)
    yield
    print("AgentApp is shutting down...")


agent_app = AgentApp(
    app_name="Friday",
    app_description="A helpful assistant",
    lifespan=lifespan,
)

@agent_app.query(framework="agentscope")
async def query_func(
    self,
    msgs,
    request: AgentRequest = None,
    **kwargs,
):
    session_id = request.session_id
    user_id = request.user_id

    # Resolve agent_id: request → DB → fallback
    agent_id = getattr(request, "agent_id", None)
    if not agent_id:
        async with get_db() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT agent_id FROM session WHERE id = ?", (session_id,)
            )
            row = await cursor.fetchone()
            agent_id = row["agent_id"] if row and row["agent_id"] else FALLBACK_TEMPLATE

    # Auto-create session row if it doesn't exist yet
    first_msg_text = ""
    if msgs and len(msgs) > 0:
        first = msgs[0]
        if hasattr(first, "content"):
            raw = first.content
            if isinstance(raw, str):
                first_msg_text = raw
            elif isinstance(raw, list) and len(raw) > 0:
                block = raw[0]
                if isinstance(block, dict) and "text" in block:
                    first_msg_text = block["text"]
    await ensure_session(session_id, user_id, agent_id, first_msg_text)

    from sqlalchemy.ext.asyncio import create_async_engine

    cfg = agent_app.state.config
    engine = create_async_engine(cfg.sqlite_url)

    if agent_id == "deep-research-agent":
        agent = await load_deep_research_agent(
            template_name=agent_id,
            app_config=cfg,
            engine=engine,
            user_id=user_id,
            session_id=session_id,
        )
    else:
        agent = await load_react_agent(
            template_name=agent_id,
            app_config=cfg,
            engine=engine,
            user_id=user_id,
            session_id=session_id,
        )

    await agent_app.state.session.load_session_state(
        session_id=session_id,
        user_id=user_id,
        agent=agent,
    )

    async for msg, last in stream_printing_messages(
        agents=[agent],
        coroutine_task=agent(msgs),
    ):
        yield msg, last

    await agent_app.state.session.save_session_state(
        session_id=session_id,
        user_id=user_id,
        agent=agent,
    )


if __name__ == "__main__":
    host, port = "0.0.0.0", 8090
    agent_app.run(host=host, port=port, web_ui=False)
