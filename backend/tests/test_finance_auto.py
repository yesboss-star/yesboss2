"""Financial figures are read automatically from an owner's financial upload, and nothing else (offline)."""
from datetime import datetime
from types import SimpleNamespace

import pytest

import app.core.finance_auto as fa
from app.core.finance_auto import auto_extract_after_upload, looks_financial, save_metrics

PNL = "Profit and Loss, October. Revenue 3,456,789. Expenses 2,111,222. Net profit 1,345,567."
NOTES = "Meeting notes: Rahul will send the demo recording. Budget approved earlier."


def _owner(offline_db):
    return SimpleNamespace(id="owner-uid-1", email="owner@test.local")


def _doc(offline_db, file_id, filename, text):
    offline_db.db.documents.insert_one({"file_id": file_id, "filename": filename, "org_id": offline_db.org, "text": text, "created_at": datetime.utcnow()})


@pytest.fixture
def reader(monkeypatch):
    calls = []

    async def fake(text, filename=""):
        calls.append(filename)
        return {"document_type": "pnl", "revenue": {"value": 3456789.0, "currency": "INR"}} if "Revenue" in text else {"document_type": "other", "notes": "no figures"}

    monkeypatch.setattr(fa, "extract_financial_metrics", fake)
    return calls


# ---------------------------------------------------------------- which files are even looked at
def test_only_files_with_financial_wording_are_considered():
    assert looks_financial(PNL, "oct.csv")
    assert looks_financial("Quarterly budget and cash flow forecast")
    assert not looks_financial(NOTES, "notes.txt")  # one finance word is not a financial statement
    assert not looks_financial("", "x") and not looks_financial(None)


# ---------------------------------------------------------------- the automatic read
async def test_an_owners_financial_file_is_read_and_stored(offline_db, reader):
    _doc(offline_db, "f1", "PnL_Oct.csv", PNL)
    await auto_extract_after_upload("f1", offline_db.org, _owner(offline_db))
    rec = offline_db.db.financial_metrics.find_one({"organization_id": offline_db.org})
    assert rec["file_id"] == "f1" and rec["filename"] == "PnL_Oct.csv" and rec["metrics"]["revenue"]["value"] == 3456789.0


async def test_an_employees_upload_is_never_read_into_company_figures(offline_db, reader):
    _doc(offline_db, "f1", "mine.csv", PNL)
    await auto_extract_after_upload("f1", offline_db.org, SimpleNamespace(id="emp-uid", email="emp@test.local"))
    assert offline_db.db.financial_metrics.count_documents({}) == 0 and not reader


async def test_non_financial_files_cost_no_ai_call_and_store_nothing(offline_db, reader):
    _doc(offline_db, "f1", "notes.txt", NOTES)
    await auto_extract_after_upload("f1", offline_db.org, _owner(offline_db))
    assert offline_db.db.financial_metrics.count_documents({}) == 0 and not reader


async def test_a_file_the_reader_says_is_not_financial_stores_nothing(offline_db, reader):
    _doc(offline_db, "f1", "plan.txt", "Business plan: expenses and budget are discussed, but no figures. Cash flow later.")
    await auto_extract_after_upload("f1", offline_db.org, _owner(offline_db))
    assert reader == ["plan.txt"] and offline_db.db.financial_metrics.count_documents({}) == 0


async def test_another_organizations_file_id_is_ignored(offline_db, reader):
    offline_db.db.documents.insert_one({"file_id": "x", "filename": "p.csv", "org_id": "someone-else", "text": PNL})
    await auto_extract_after_upload("x", offline_db.org, _owner(offline_db))
    assert offline_db.db.financial_metrics.count_documents({}) == 0


async def test_a_failure_never_escapes_into_the_upload(offline_db, monkeypatch):
    async def boom(text, filename=""):
        raise RuntimeError("model down")

    monkeypatch.setattr(fa, "extract_financial_metrics", boom)
    _doc(offline_db, "f1", "PnL.csv", PNL)
    await auto_extract_after_upload("f1", offline_db.org, _owner(offline_db))  # must simply return
    assert offline_db.db.financial_metrics.count_documents({}) == 0


# ---------------------------------------------------------------- one record per file, honest trend
def test_reading_the_same_file_again_updates_its_record_and_trends_against_the_previous_file(offline_db):
    db, org = offline_db.db, offline_db.org
    old = {"file_id": "a", "filename": "Sep.csv"}
    new = {"file_id": "b", "filename": "Oct.csv"}
    save_metrics(db, org, old, {"revenue": {"value": 100.0}})
    _, trend = save_metrics(db, org, new, {"revenue": {"value": 150.0}})
    save_metrics(db, org, new, {"revenue": {"value": 200.0}})  # pressing the button again on the same file
    assert db.financial_metrics.count_documents({"organization_id": org}) == 2
    assert db.financial_metrics.find_one({"file_id": "b"})["metrics"]["revenue"]["value"] == 200.0
    assert trend  # compared with the September file, not with itself


# ---------------------------------------------------------------- the button still works the same way
def test_the_extract_button_route_uses_the_same_storage(offline_db, monkeypatch):
    from fastapi.testclient import TestClient

    import app.api.finance as finance
    from app.dependencies.auth import get_current_user, get_current_user_optional
    from app.main import app

    async def fake(text, filename=""):
        return {"document_type": "pnl", "revenue": {"value": 10.0, "currency": None}}

    monkeypatch.setattr(finance, "extract_financial_metrics", fake)
    _doc(offline_db, "f9", "PnL.csv", PNL)

    class U:
        id = uid = "owner-uid-1"
        email = "owner@test.local"
        custom_claims: dict = {}

    app.dependency_overrides[get_current_user] = lambda: U()
    app.dependency_overrides[get_current_user_optional] = lambda: U()
    try:
        c = TestClient(app)
        for _ in range(2):
            r = c.post("/api/v1/finance/extract", params={"organization_id": offline_db.org, "file_id": "f9"})
            assert r.status_code == 200 and r.json()["extracted"] is True
        assert offline_db.db.financial_metrics.count_documents({"organization_id": offline_db.org}) == 1  # no duplicate on a second press
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_current_user_optional, None)
