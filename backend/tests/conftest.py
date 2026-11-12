"""Shared fixtures for offline (no network, no real database) behaviour tests.

``offline_db`` swaps every ``get_database`` for an in-memory mongomock database, records
outgoing SMTP instead of sending it, and makes any non-loopback socket connection raise,
so a test can never reach production Mongo, Gmail, Zoho, Google or an LLM.
"""
import smtplib
import socket
import sys
from types import SimpleNamespace

import mongomock
import pytest

ORG = "6a701c5f6183f425010e290d"
OWNER_UID = "owner-uid-1"
OWNER_EMAIL = "owner@test.local"
EMP = "emp@test.local"
MGR = "mgr@test.local"


class _FakeSMTP:
    sent: list = []

    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def set_debuglevel(self, *a):
        pass

    def starttls(self, *a, **k):
        pass

    def ehlo(self, *a, **k):
        pass

    def login(self, *a, **k):
        pass

    def quit(self):
        pass

    def sendmail(self, frm, to, msg):
        _FakeSMTP.sent.append({"to": to if isinstance(to, str) else ",".join(to), "msg": str(msg)})

    def send_message(self, msg, *a, **k):
        _FakeSMTP.sent.append({"to": msg["To"], "msg": str(msg)})


def _is_loopback(addr) -> bool:
    host = addr[0] if isinstance(addr, (tuple, list)) else addr
    return str(host) in ("127.0.0.1", "::1", "localhost", "")


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    """The app's rate limiter allows 300 requests a minute per client address, and every
    TestClient shares one address, so a long suite trips it (429 where a test expects 403).
    Start each test with empty counters."""
    from app.main import RateLimitMiddleware, app

    layer = app.middleware_stack
    while layer is not None:
        if isinstance(layer, RateLimitMiddleware):
            layer.requests.clear()
            break
        layer = getattr(layer, "app", None)
    yield


@pytest.fixture
def offline_db(monkeypatch):
    from bson import ObjectId

    # make sure the modules that import get_database are loaded before we patch them
    import app.api.websocket as ws_mod  # noqa: F401
    import app.core.notification_service as ns
    import app.core.scheduler  # noqa: F401
    import app.main  # noqa: F401
    from app.core.config import settings

    db = mongomock.MongoClient()["yesboss_offline"]
    for name, mod in list(sys.modules.items()):
        if name.startswith("app.") and hasattr(mod, "get_database"):
            monkeypatch.setattr(mod, "get_database", lambda db=db: db, raising=False)

    # no real network (asyncio's Windows self-pipe needs loopback)
    real_connect, real_connect_ex = socket.socket.connect, socket.socket.connect_ex

    def guard(orig):
        def wrapper(self, addr, *a, **k):
            if _is_loopback(addr):
                return orig(self, addr, *a, **k)
            raise OSError("NETWORK BLOCKED by offline test harness")
        return wrapper

    def blocked(address, *a, **k):
        raise OSError("NETWORK BLOCKED by offline test harness")

    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(socket.socket, "connect", guard(real_connect))
    monkeypatch.setattr(socket.socket, "connect_ex", guard(real_connect_ex))

    _FakeSMTP.sent = []
    monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", _FakeSMTP)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.offline.test")
    monkeypatch.setattr(settings, "SMTP_USER", "offline")
    monkeypatch.setattr(settings, "SMTP_PASS", "offline")
    monkeypatch.setattr(settings, "ZOHO_CLIQ_ENABLED", False)
    monkeypatch.setattr(settings, "TAZ_WEBHOOK_URL", "")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "")

    ns._email_rate_limit.clear()
    ws_mod.manager.user_connections.clear()
    ws_mod.manager.active_connections.clear()

    db.organizations.insert_one({"_id": ObjectId(ORG), "name": "TestOrg", "owner_id": OWNER_UID})
    db.users.insert_many([
        {"uid": OWNER_UID, "email": OWNER_EMAIL, "role": "owner", "organization_id": ORG},
        {"uid": "emp-uid", "email": EMP, "role": "employee", "organization_id": ORG},
        {"uid": "mgr-uid", "email": MGR, "role": "employee", "organization_id": ORG},
    ])
    db.org_chart_members.insert_many([
        {"organization_id": ORG, "email": EMP, "manager_email": MGR},
        {"organization_id": ORG, "email": MGR},
    ])
    yield SimpleNamespace(db=db, mail=_FakeSMTP.sent, org=ORG, emp=EMP, mgr=MGR,
                          owner_uid=OWNER_UID, owner_email=OWNER_EMAIL)


@pytest.fixture
def bypass_guards():
    """For tests that exercise a handler's own logic, not the router-level auth/tenant guards
    (those are covered in test_tenant_guard.py). Never touches a real database."""
    from app.dependencies.tenant import require_auth, require_tenant
    from app.main import app

    user = SimpleNamespace(id="test-user", uid="test-user", email="tester@test.local", custom_claims={})
    app.dependency_overrides[require_tenant] = lambda: user
    app.dependency_overrides[require_auth] = lambda: user
    yield user
    app.dependency_overrides.pop(require_tenant, None)
    app.dependency_overrides.pop(require_auth, None)
