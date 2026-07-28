"""Test that all required routes are registered in the app (with /api/v1 prefix)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from app.main import app

routes = [r.path for r in app.routes if hasattr(r, 'path')]

print("All registered routes:")
for r in sorted(routes):
    if any(x in r for x in ["assistant","finance","sessions","health"]):
        print(f"  {r}")

expected_endpoints = [
    "/api/v1/assistant/ask",
    "/api/v1/assistant/ask-stream",
    "/api/v1/assistant/re-analyze",
    "/api/v1/assistant/generate-insights",
    "/api/v1/assistant/bulk-create-tasks",
    "/api/v1/finance/extract",
    "/api/v1/finance/metrics/{org_id}",
    "/api/v1/sessions/insights/{organization_id}",
    "/api/v1/sessions/insights/confirm",
    "/api/v1/sessions/insights/dismiss",
]

print(f"\n{'Expected Route':<55} {'Found':<10}")
print("-" * 67)
all_found = True
for route in expected_endpoints:
    found = route in routes
    icon = "OK" if found else "NO"
    print(f"{route:<55} {icon:<10}")
    if not found:
        all_found = False

print(f"\n{'='*67}")
print(f"All routes registered: {'YES' if all_found else 'NO'}")
sys.exit(0 if all_found else 1)
