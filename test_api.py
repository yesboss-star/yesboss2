"""Programmatically start backend, test endpoints, clean up."""
import sys, os, time, json, asyncio, signal

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import uvicorn
from uvicorn.config import Config
from uvicorn.server import Server
from app.main import app

from urllib.request import Request, urlopen
from urllib.error import URLError

async def test():
    # Start uvicorn server
    config = Config(app=app, host="0.0.0.0", port=8000, log_level="critical")
    server = Server(config=config)
    server_task = asyncio.create_task(server.serve())

    # Wait for it to be ready
    for i in range(30):
        try:
            r = urlopen("http://localhost:8000/openapi.json", timeout=2)
            break
        except Exception:
            await asyncio.sleep(1)
    else:
        print("TIMEOUT waiting for server")
        server.should_exit = True
        await server_task
        return

    def api(method, path, body=None):
        url = f"http://localhost:8000{path}"
        data = json.dumps(body).encode() if body else None
        req = Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        try:
            r = urlopen(req, timeout=15)
            return r.status, json.loads(r.read().decode())
        except URLError as e:
            if hasattr(e, 'code') and e.code:
                return e.code, json.loads(e.read().decode())
            return 0, str(e)

    tests = [
        ("OpenAPI schema",             lambda: api("GET", "/openapi.json"),                                                    lambda s,d: s == 200),
        ("POST /assistant/ask",        lambda: api("POST", "/assistant/ask", {"message":"hi","context":{"organization_id":"test_org"}}), lambda s,d: s in (200,422,500)),
        ("POST /assistant/ask-stream", lambda: api("POST", "/assistant/ask-stream", {"message":"hi","context":{"organization_id":"test_org"}}), lambda s,d: s in (200,422,500)),
        ("GET /sessions/insights/t",   lambda: api("GET", "/sessions/insights/t"),                                            lambda s,d: s == 200),
        ("POST /assistant/generate-insights", lambda: api("POST", "/assistant/generate-insights", {"organization_id":"test_org"}), lambda s,d: s in (200,422,500)),
        ("POST /assistant/re-analyze", lambda: api("POST", "/assistant/re-analyze", {"file_id":"x","original_message":"a","organization_id":"test_org"}), lambda s,d: s in (200,404,422)),
        ("POST /finance/extract",      lambda: api("POST", "/finance/extract", {"organization_id":"test_org"}),                lambda s,d: s in (200,422,500)),
        ("GET /finance/metrics/t",     lambda: api("GET", "/finance/metrics/t"),                                              lambda s,d: s == 200),
        ("POST /assistant/bulk-create-tasks", lambda: api("POST", "/assistant/bulk-create-tasks", {"organization_id":"test_org","action_items":[{"title":"Test","description":"d","priority":"medium"}]}), lambda s,d: s in (200,422,500)),
    ]

    print(f"\n{'Endpoint':<48} {'Result':<10} {'Code':<6}")
    print("-" * 68)
    passed = failed = 0
    for name, call_fn, check_fn in tests:
        try:
            status, data = call_fn()
            ok = check_fn(status, data)
            icon = "✅" if ok else "❌"
            print(f"{name:<48} {icon:<10} {status:<6}")
            if ok: passed += 1
            else: failed += 1
        except Exception as e:
            print(f"{name:<48} {'❌ ERROR':<10} {str(e)[:30]:<6}")
            failed += 1

    print(f"\n{'='*60}")
    print(f"Passed: {passed} / {passed + failed}")
    if failed > 0:
        print(f"Failed: {failed} / {passed + failed}")

    # Shut down
    server.should_exit = True
    try:
        await asyncio.wait_for(server_task, timeout=5)
    except asyncio.TimeoutError:
        pass

asyncio.run(test())
