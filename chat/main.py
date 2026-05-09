from contextlib import asynccontextmanager

from fastapi import Request
from agentscope.pipeline import stream_printing_messages
from agentscope.session import RedisSession

from agentscope_runtime.engine import AgentApp
from agentscope_runtime.engine.schemas.agent_schemas import AgentRequest

from chat.config import load_config
from chat.agent.react_agent_factory import load_react_agent
from chat.session import load_messages, update_session_name

DEFAULT_TEMPLATE = "simple-react-agent"


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

    from sqlalchemy.ext.asyncio import create_async_engine

    cfg = agent_app.state.config
    engine = create_async_engine(cfg.sqlite_url)
    agent = await load_react_agent(
        template_name=DEFAULT_TEMPLATE,
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
