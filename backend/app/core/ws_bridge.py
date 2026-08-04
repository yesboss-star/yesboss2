import asyncio
from typing import Awaitable, Callable

_main_loop: asyncio.AbstractEventLoop | None = None


def bind_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_loop
    _main_loop = loop


def safe_ws(coro_factory: Callable[[], Awaitable[None]]) -> None:
    """Run a websocket coroutine on the uvicorn loop from any thread/loop."""
    global _main_loop
    loop = _main_loop or asyncio.get_event_loop()
    current = asyncio.get_running_loop()
    if current is loop:
        loop.create_task(coro_factory())
    else:
        asyncio.run_coroutine_threadsafe(coro_factory(), loop)
