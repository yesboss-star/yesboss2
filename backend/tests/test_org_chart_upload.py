"""Bulk org-chart upload: data cleaning, duplicates and error handling (offline)."""
import io

import pytest
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.dependencies.scope import is_org_member
from app.main import app

CSV = (
    "Name,Email,Role,Department,Reports To\n"
    "Asha Rao,Asha.Rao@Test.Local,Developer,Engineering,\n"
    "Bela Shah,bela@test.local,,Sales,Asha.Rao@Test.Local\n"
    "Bela Again,BELA@test.local,Lead,Sales,\n"
    "No Email,,Developer,Engineering,\n"
    "Bad Email,not-an-email,Developer,Engineering,\n"
)


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def api(offline_db):
    app.dependency_overrides[get_current_user] = lambda: U(offline_db.owner_uid, offline_db.owner_email)
    c = TestClient(app)

    def upload(content: bytes, filename: str, org=None):
        return c.post("/api/v1/org-chart/upload", data={"organization_id": org or offline_db.org},
                      files={"file": (filename, io.BytesIO(content), "application/octet-stream")})

    c.upload = upload
    c.o = offline_db
    yield c
    app.dependency_overrides.pop(get_current_user, None)


def members(api, email=None):
    q = {"organization_id": api.o.org}
    if email:
        q["email"] = email
    return list(api.o.db.org_chart_members.find(q))


def test_csv_emails_are_normalised_and_bad_rows_reported(api):
    r = api.upload(CSV.encode(), "team.csv")
    assert r.status_code == 200, r.text
    body = r.json()
    emails = {m["email"] for m in members(api)}
    assert "asha.rao@test.local" in emails and "bela@test.local" in emails
    assert all(e == e.lower() for e in emails), "emails must be stored lower-case (membership checks compare lower-case)"
    assert "not-an-email" not in emails
    assert len(body["errors"]) == 2  # blank email + invalid email


def test_duplicate_rows_and_reuploads_do_not_create_duplicates(api):
    api.upload(CSV.encode(), "team.csv")
    api.upload(CSV.encode(), "team.csv")
    assert len(members(api, "bela@test.local")) == 1
    assert len(members(api, "asha.rao@test.local")) == 1


def test_blank_cells_do_not_become_the_text_nan_or_empty_role(api):
    api.upload(CSV.encode(), "team.csv")
    bela = members(api, "bela@test.local")[0]
    assert bela["role"] in ("lead", "employee")  # blank role falls back, never ""/"nan"
    asha = members(api, "asha.rao@test.local")[0]
    assert asha["manager_email"] in (None, "")


def test_manager_email_is_normalised(api):
    api.upload(CSV.encode(), "team.csv")
    bela = [m for m in members(api, "bela@test.local")][0]
    assert bela["manager_email"] in (None, "asha.rao@test.local")


def test_excel_blank_cells_are_not_the_string_nan(api):
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Name", "Email", "Role", "Department", "Manager"])
    ws.append(["Chen", "chen@test.local", None, "Ops", None])
    ws.append(["Ghost", None, "Dev", "Ops", None])
    buf = io.BytesIO()
    wb.save(buf)
    r = api.upload(buf.getvalue(), "team.xlsx")
    assert r.status_code == 200, r.text
    emails = {m["email"] for m in members(api)}
    assert "nan" not in emails and "chen@test.local" in emails
    chen = members(api, "chen@test.local")[0]
    assert chen["role"] != "nan" and chen["manager_email"] in (None, "")
    assert len(r.json()["errors"]) == 1


def test_uploaded_members_get_access_even_if_the_sheet_used_capitals(api):
    import asyncio

    api.upload(CSV.encode(), "team.csv")
    user = U("asha-uid", "Asha.Rao@Test.Local")  # Firebase email casing can differ
    assert asyncio.run(is_org_member(api.o.db, api.o.org, user))


def test_unsupported_and_missing_filenames_are_400_not_500(api):
    assert api.upload(b"x", "team.pdf").status_code == 400
    r = api.post("/api/v1/org-chart/upload", data={"organization_id": api.o.org},
                   files={"file": ("", io.BytesIO(b"x"), "text/csv")})
    assert r.status_code in (400, 422)
