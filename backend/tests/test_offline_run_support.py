"""The pieces that make a local, production-isolated run possible."""
import importlib

import mongomock

import app.core.database as dbm
from app.core.config import settings


def _connect_with(monkeypatch, uri):
    captured = {}

    class Spy(mongomock.MongoClient):
        def __init__(self, *a, **kw):
            captured.update(kw)
            super().__init__()

    monkeypatch.setattr(dbm, "MongoClient", Spy)
    monkeypatch.setattr(settings, "MONGODB_URI", uri)
    monkeypatch.setattr(dbm, "_patch_dns_resolver", lambda: None)
    dbm.connect_mongodb()
    return captured


def test_local_mongo_is_not_forced_onto_tls(monkeypatch):
    opts = _connect_with(monkeypatch, "mongodb://127.0.0.1:27017/yesboss_local")
    assert opts["tls"] is False
    assert not any(k.startswith("tlsAllow") or k == "tlsCAFile" for k in opts)


def test_hosted_mongo_keeps_verified_tls(monkeypatch):
    opts = _connect_with(monkeypatch, "mongodb://cluster0.example.net/db")
    assert opts["tls"] is True
    assert opts["tlsAllowInvalidCertificates"] is False and opts["tlsAllowInvalidHostnames"] is False


def test_env_file_override_is_honoured(tmp_path, monkeypatch):
    env = tmp_path / "custom.env"
    env.write_text("SCHEDULER_ENABLED=false\nADMIN_API_KEY=from-custom-file\n")
    monkeypatch.setenv("ENV_FILE", str(env))
    import app.core.config as cfg

    original = cfg.settings  # other modules hold this exact object
    try:
        reloaded = importlib.reload(cfg)
        assert reloaded.settings.SCHEDULER_ENABLED is False
        assert reloaded.settings.ADMIN_API_KEY == "from-custom-file"
    finally:
        monkeypatch.delenv("ENV_FILE", raising=False)
        monkeypatch.delenv("SCHEDULER_ENABLED", raising=False)
        monkeypatch.delenv("ADMIN_API_KEY", raising=False)
        importlib.reload(cfg)
        cfg.settings = original


def test_firebase_read_only_blocks_every_mutation(monkeypatch):
    import app.core.firebase_admin as fb

    def boom():
        raise AssertionError("touched the real Firebase project")

    monkeypatch.setattr(fb, "get_firebase_auth", boom)
    monkeypatch.setattr(settings, "FIREBASE_READ_ONLY", True)
    fb.set_custom_user_claims("uid", {"role": "owner"})  # silently skipped
    assert fb.delete_user("uid") is False
    import pytest

    with pytest.raises(RuntimeError):
        fb.create_user("a@b.test", "secret1")
