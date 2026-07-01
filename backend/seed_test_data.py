"""Seed test data for alpha testing.

Usage:
    python seed_test_data.py

Idempotent: skips if org domain already exists.
"""

import logging
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.core.config import settings
from app.core.database import get_database

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
logger = logging.getLogger("seed")


def seed():
    db = get_database()
    if db is None:
        logger.error("MongoDB not configured")
        return

    # Skip if already seeded
    existing = db.organizations.find_one({"domain": "alphacorp.test"})
    if existing:
        logger.info("Test org already exists, skipping")
        return

    # Create org
    org_result = db.organizations.insert_one({
        "name": "Alpha Corp",
        "domain": "alphacorp.test",
        "industry": "technology",
        "micro_vertical": "saas",
        "created_at": __import__("datetime").datetime.utcnow(),
    })
    org_id = str(org_result.inserted_id)
    logger.info(f"Created org: {org_id}")

    # Create owner
    owner_result = db.org_chart_members.insert_one({
        "organization_id": org_id,
        "name": "Alice Founder",
        "email": "alice@alphacorp.test",
        "role": "owner",
        "department": "Executive",
    })
    owner_id = str(owner_result.inserted_id)

    # Create employees
    employees = [
        ("Bob Dev", "bob@alphacorp.test", "Developer", "Engineering"),
        ("Carol PM", "carol@alphacorp.test", "Product Manager", "Product"),
        ("Dave DS", "dave@alphacorp.test", "Data Scientist", "Data"),
        ("Eve Ops", "eve@alphacorp.test", "DevOps", "Engineering"),
    ]
    employee_ids = []
    for name, email, role, dept in employees:
        result = db.org_chart_members.insert_one({
            "organization_id": org_id,
            "name": name,
            "email": email,
            "role": role,
            "department": dept,
        })
        employee_ids.append(str(result.inserted_id))

    logger.info(f"Created {len(employee_ids) + 1} members")

    # Create goals
    goals = [
        {"title": "Launch MVP", "description": "Ship v1.0 by end of quarter", "status": "active", "priority": "high"},
        {"title": "Improve Test Coverage", "description": "Achieve 80% test coverage", "status": "active", "priority": "medium"},
        {"title": "Reduce Bug Count", "description": "Close 50 open bugs", "status": "completed", "priority": "high"},
    ]
    goal_ids = []
    for g in goals:
        g["organization_id"] = org_id
        g["created_at"] = g["updated_at"] = __import__("datetime").datetime.utcnow()
        result = db.goals.insert_one(g)
        goal_ids.append(str(result.inserted_id))

    logger.info(f"Created {len(goal_ids)} goals")

    # Create tasks
    tasks = [
        {"title": "Set up CI/CD", "status": "completed", "goal_index": 0},
        {"title": "Build auth system", "status": "completed", "goal_index": 0},
        {"title": "Create API docs", "status": "in_progress", "goal_index": 0},
        {"title": "Write unit tests", "status": "in_progress", "goal_index": 1},
        {"title": "Integration tests", "status": "pending", "goal_index": 1},
        {"title": "Fix login bug", "status": "completed", "goal_index": 2},
        {"title": "Fix data race", "status": "completed", "goal_index": 2},
        {"title": "Fix UI crash", "status": "completed", "goal_index": 2},
        {"title": "Performance optimization", "status": "pending", "goal_index": 0},
        {"title": "Code review backlog", "status": "pending", "goal_index": 1},
    ]
    for t in tasks:
        t["organization_id"] = org_id
        t["goal_id"] = goal_ids[t.pop("goal_index")]
        t["created_at"] = t["updated_at"] = __import__("datetime").datetime.utcnow()
    db.tasks.insert_many(tasks)
    logger.info(f"Created {len(tasks)} tasks")

    # Create a test meeting
    db.meetings.insert_one({
        "organization_id": org_id,
        "title": "Sprint Planning",
        "description": "Plan next sprint deliverables",
        "date": __import__("datetime").datetime.utcnow(),
        "duration_minutes": 60,
        "created_by": owner_id,
    })
    logger.info("Created 1 meeting")

    # Create assistant session
    db.assistant_sessions.insert_one({
        "organization_id": org_id,
        "user_id": owner_id,
        "title": "Onboarding session",
        "messages": [{"role": "user", "content": "Help me set up goals", "timestamp": __import__("datetime").datetime.utcnow().isoformat()}],
        "created_at": __import__("datetime").datetime.utcnow(),
    })
    logger.info("Created 1 assistant session")

    logger.info("Seed complete!")


if __name__ == "__main__":
    seed()
