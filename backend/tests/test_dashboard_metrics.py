"""The AI dashboard's module tiles show only figures the app really has (offline)."""
import pytest
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.main import app

FOUNDER = "/api/v1/dashboard/metrics/founder"
INVENTED = ("revenue", "growth_rate", "customer_count", "profitability")


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def world(offline_db):
    o = offline_db
    o.db.organizations.update_one({"_id": o.db.organizations.find_one({})["_id"]}, {"$unset": {"industry": ""}})
    app.dependency_overrides[get_current_user] = lambda: U(o.owner_uid, o.owner_email)

    class W:
        db = o.db
        org = o.org
        c = TestClient(app)

    yield W
    app.dependency_overrides.pop(get_current_user, None)


def test_business_figures_the_app_does_not_hold_are_reported_as_no_data(world):
    """Revenue was tasks x 100, customers was the team size, profitability was the share of tasks done:
    stand-ins that read as real business numbers. They are now an honest 'no data'."""
    for i in range(5):
        world.db.tasks.insert_one({"organization_id": world.org, "title": f"t{i}", "status": "completed" if i < 2 else "pending"})
    world.db.org_chart_members.insert_one({"organization_id": world.org, "email": "a@test.local", "full_name": "A"})
    metrics = world.c.get(FOUNDER, params={"organization_id": world.org}).json()["metrics"]
    for name in INVENTED:
        assert metrics[name] == {"value": None, "change": "no data", "trend": "neutral"}, name


def test_headcount_is_the_real_org_chart_size(world):
    world.db.org_chart_members.delete_many({"organization_id": world.org})
    for i in range(3):
        world.db.org_chart_members.insert_one({"organization_id": world.org, "email": f"m{i}@test.local", "full_name": f"M{i}"})
    metrics = world.c.get(FOUNDER, params={"organization_id": world.org}).json()["metrics"]
    assert metrics["headcount"]["value"] == 3


def test_every_tile_has_a_text_or_number_change_and_a_known_trend(world):
    """The page prints `change` and picks an arrow from `trend`; anything else broke it ('NaN%')."""
    metrics = world.c.get(FOUNDER, params={"organization_id": world.org}).json()["metrics"]
    assert metrics
    for tile in metrics.values():
        assert isinstance(tile["change"], (int, float, str))
        assert tile["trend"] in ("up", "down", "neutral")
