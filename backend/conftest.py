import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def org_id():
    return "test-org-id"


@pytest.fixture
def sample_goal():
    return {
        "title": "Test goal",
        "description": "A test goal for alpha",
        "status": "active",
        "organization_id": "test-org-id",
    }


@pytest.fixture
def sample_task():
    return {
        "title": "Test task",
        "description": "A test task for alpha",
        "status": "pending",
        "organization_id": "test-org-id",
        "goal_id": None,
    }
