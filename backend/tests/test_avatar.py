"""Avatar probing: the UI sends HEAD before showing an avatar."""
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

import app.api.employees as employees_api
from app.main import app


def test_head_and_get_work_for_an_existing_avatar(tmp_path, monkeypatch):
    monkeypatch.setattr(employees_api, "AVATAR_DIR", str(tmp_path))
    (tmp_path / "me@test.local.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    c = TestClient(app)
    head = c.head("/api/v1/employees/avatar/me@test.local")
    assert head.status_code == 200 and head.headers["content-type"] == "image/png"
    assert c.get("/api/v1/employees/avatar/me@test.local").status_code == 200


def test_missing_avatar_is_404_for_both_methods(tmp_path, monkeypatch):
    monkeypatch.setattr(employees_api, "AVATAR_DIR", str(tmp_path))
    c = TestClient(app)
    assert c.head("/api/v1/employees/avatar/nobody@test.local").status_code == 404
    assert c.get("/api/v1/employees/avatar/nobody@test.local").status_code == 404


def test_cors_allows_head_so_cross_origin_probes_pass_preflight():
    cors = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    assert "HEAD" in cors.kwargs["allow_methods"]


def test_suggest_assignees_accepts_get_as_the_ui_sends_it(offline_db, monkeypatch):
    from types import SimpleNamespace

    from app.dependencies.auth import get_current_user, get_current_user_optional

    user = SimpleNamespace(id="owner-uid-1", uid="owner-uid-1", email="owner@test.local", custom_claims={})
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_current_user_optional] = lambda: user
    try:
        import app.api.smart_suggestions as smart

        async def fake_analyze(title, description=""):
            return {"work_category": "general"}

        monkeypatch.setattr(smart, "analyze_content", fake_analyze)
        r = TestClient(app).get(f"/api/v1/smart/suggest-assignees?title=Ship+it&organization_id={offline_db.org}")
        assert r.status_code == 200, r.text
        assert r.json()["suggestions"] == []
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_current_user_optional, None)
