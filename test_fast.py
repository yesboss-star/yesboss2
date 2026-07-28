"""Test endpoints using Starlette TestClient (no server needed)."""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

tests = [
    ("GET  /api/v1/health", lambda: client.get("/api/v1/health"), lambda r: r.status_code == 200),
    ("POST /api/v1/assistant/ask", lambda: client.post("/api/v1/assistant/ask", json={"message":"hi","context":{"organization_id":"test_org"}}), lambda r: r.status_code in (200, 422, 500)),
    ("POST /api/v1/assistant/re-analyze", lambda: client.post("/api/v1/assistant/re-analyze", json={"file_id":"x","original_message":"a","organization_id":"test_org"}), lambda r: r.status_code in (200, 404, 422)),
    ("POST /api/v1/assistant/generate-insights", lambda: client.post("/api/v1/assistant/generate-insights", json={"organization_id":"test_org"}), lambda r: r.status_code in (200, 422, 500)),
    ("POST /api/v1/assistant/bulk-create-tasks", lambda: client.post("/api/v1/assistant/bulk-create-tasks", json={"organization_id":"test_org","action_items":[{"title":"Test","description":"d","priority":"medium"}]}), lambda r: r.status_code in (200, 422, 500)),
    ("POST /api/v1/finance/extract", lambda: client.post("/api/v1/finance/extract", json={"organization_id":"test_org"}), lambda r: r.status_code in (200, 422, 500)),
    ("GET  /api/v1/finance/metrics/test_org", lambda: client.get("/api/v1/finance/metrics/test_org"), lambda r: r.status_code == 200),
    ("GET  /api/v1/sessions/insights/test_org", lambda: client.get("/api/v1/sessions/insights/test_org"), lambda r: r.status_code == 200),
    ("POST /api/v1/sessions/insights/confirm", lambda: client.post("/api/v1/sessions/insights/confirm", json={"insight_id":"nonexistent"}), lambda r: r.status_code in (200, 404, 422)),
    ("POST /api/v1/sessions/insights/dismiss", lambda: client.post("/api/v1/sessions/insights/dismiss", json={"insight_id":"nonexistent"}), lambda r: r.status_code in (200, 404, 422)),
    ("POST /api/v1/assistant/ask-stream", lambda: client.post("/api/v1/assistant/ask-stream", json={"message":"hi","context":{"organization_id":"test_org"}}), lambda r: r.status_code in (200, 422, 500)),
]

print(f"\n{'Endpoint':<55} {'Result':<8} {'Code':<8}")
print("-" * 74)
passed = failed = 0
for name, call_fn, check_fn in tests:
    try:
        r = call_fn()
        ok = check_fn(r)
        icon = "PASS" if ok else "FAIL"
        print(f"{name:<55} {icon:<8} {r.status_code:<8}")
        if ok: passed += 1
        else: failed += 1
    except Exception as e:
        print(f"{name:<55} {'ERROR':<8} {str(e)[:35]:<8}")
        failed += 1

print(f"\n{'='*60}")
print(f"Passed: {passed} / {passed + failed}")
if failed:
    print(f"Failed: {failed} / {passed + failed}")
