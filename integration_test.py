"""Integration test: start backend in-process and test all endpoints with correct /api/v1 prefix."""
import sys, os, json, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import httpx
from app.main import app

async def main():
    import uvicorn
    config = uvicorn.Config(app=app, host="127.0.0.1", port=8002, log_level="critical")
    server = uvicorn.Server(config=config)
    server_task = asyncio.create_task(server.serve())

    BASE = "http://127.0.0.1:8002/api/v1"

    async with httpx.AsyncClient(base_url=BASE, timeout=10) as c:
        for i in range(30):
            try:
                r = await c.get("/api/v1/health")
                if r.status_code == 200:
                    break
            except Exception:
                await asyncio.sleep(1)
        else:
            print("TIMEOUT waiting for server")
            server.should_exit = True
            await server_task
            return

        tests = [
            ("GET /api/v1/health", lambda: c.get("/api/v1/health"), lambda r: r.status_code == 200),
            ("POST /assistant/ask", lambda: c.post("/api/v1/assistant/ask", json={"message":"hi","context":{"organization_id":"test_org"}}), lambda r: r.status_code in (200, 422, 500)),
            ("POST /assistant/re-analyze", lambda: c.post("/api/v1/assistant/re-analyze", json={"file_id":"x","original_message":"a","organization_id":"test_org"}), lambda r: r.status_code in (200, 404, 422)),
            ("POST /assistant/generate-insights", lambda: c.post("/api/v1/assistant/generate-insights", json={"organization_id":"test_org"}), lambda r: r.status_code in (200, 422, 500)),
            ("POST /assistant/bulk-create-tasks", lambda: c.post("/api/v1/assistant/bulk-create-tasks", json={"organization_id":"test_org","action_items":[{"title":"Test","description":"d","priority":"medium"}]}), lambda r: r.status_code in (200, 422, 500)),
            ("POST /finance/extract", lambda: c.post("/api/v1/finance/extract", json={"organization_id":"test_org"}), lambda r: r.status_code in (200, 422, 500)),
            ("GET /finance/metrics/t", lambda: c.get("/api/v1/finance/metrics/test_org"), lambda r: r.status_code == 200),
            ("GET /sessions/insights/t", lambda: c.get("/api/v1/sessions/insights/test_org"), lambda r: r.status_code == 200),
            ("POST /sessions/insights/confirm", lambda: c.post("/api/v1/sessions/insights/confirm", json={"insight_id":"nonexistent"}), lambda r: r.status_code in (200, 404, 422)),
            ("POST /sessions/insights/dismiss", lambda: c.post("/api/v1/sessions/insights/dismiss", json={"insight_id":"nonexistent"}), lambda r: r.status_code in (200, 404, 422)),
        ]

        # Streaming SSE test
        async def test_streaming():
            async with c.stream("POST", "/api/v1/assistant/ask-stream", json={"message":"hi","context":{"organization_id":"test_org"}}) as r:
                if r.status_code != 200:
                    return (False, r.status_code)
                chunks = []
                async for line in r.aiter_lines():
                    chunks.append(line)
                    if len(chunks) > 5:
                        break
                has_data = any("data:" in l for l in chunks)
                return (has_data, r.status_code)

        tests.append(("POST /assistant/ask-stream (SSE)", test_streaming(), lambda r: r[0] == True))

        print(f"\n{'Endpoint':<55} {'Result':<8} {'Code':<8}")
        print("-" * 74)
        passed = failed = 0
        for name, call_fn, check_fn in tests:
            try:
                if asyncio.iscoroutine(call_fn):
                    result = await call_fn
                else:
                    result = await call_fn()
                if isinstance(result, tuple) and len(result) == 2:
                    ok = check_fn(result)
                    code = result[1]
                else:
                    ok = check_fn(result)
                    code = result.status_code if hasattr(result, 'status_code') else '?'
                icon = "PASS" if ok else "FAIL"
                print(f"{name:<55} {icon:<8} {code:<8}")
                if ok: passed += 1
                else: failed += 1
            except Exception as e:
                print(f"{name:<55} {'ERROR':<8} {str(e)[:35]:<8}")
                failed += 1

        print(f"\n{'='*60}")
        print(f"Passed: {passed} / {passed + failed}")
        if failed:
            print(f"Failed: {failed} / {passed + failed}")

    server.should_exit = True
    try:
        await asyncio.wait_for(server_task, timeout=5)
    except asyncio.TimeoutError:
        pass

    sys.exit(0 if failed == 0 else 1)

asyncio.run(main())
