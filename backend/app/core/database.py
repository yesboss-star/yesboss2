import logging
import os
from typing import Optional

from pymongo import MongoClient
from pymongo.database import Database

from .config import settings

logger = logging.getLogger("yesboss.database")

client: Optional[MongoClient] = None
db: Optional[Database] = None


def _patch_dns_resolver():
    """Configure dnspython to use Google DNS instead of the system resolver.
    Many home routers (JioFiber etc.) don't handle SRV records needed by mongodb+srv://."""
    try:
        import dns.resolver
        new_resolver = dns.resolver.Resolver()
        new_resolver.nameservers = ["8.8.8.8", "8.8.4.4"]
        new_resolver.timeout = 5.0
        new_resolver.lifetime = 5.0
        dns.resolver.default_resolver = new_resolver
        logger.info("DNS resolver set to 8.8.8.8 / 8.8.4.4 for SRV lookups")
    except ImportError:
        logger.warning("dnspython not available — SRV resolution may fail on some networks")
    except Exception as e:
        logger.warning("Could not override DNS resolver: %s", e)


def connect_mongodb():
    global client, db
    if not settings.MONGODB_URI:
        logger.warning("MongoDB URI not configured")
        return None

    try:
        # Patch the DNS resolver before any SRV lookups (many home routers
        # don't handle SRV records that mongodb+srv:// requires)
        _patch_dns_resolver()

        mongo_uri = settings.MONGODB_URI

        try:
            from certifi import where as certifi_where
            tls_ca = certifi_where()
        except ImportError:
            tls_ca = None

        # Certificate + hostname verification is ON by default. Only networks that
        # intercept TLS need the escape hatch (MONGODB_TLS_INSECURE=true); never in prod.
        tls_insecure = os.getenv("MONGODB_TLS_INSECURE", "").lower() == "true"
        if tls_insecure:
            logger.warning("MONGODB_TLS_INSECURE=true: MongoDB TLS certificate verification is DISABLED")
        # Hosted clusters (Atlas) need TLS; a Mongo running on this machine / in docker doesn't
        # speak it, and forcing it made every local connection fail with "SSL handshake failed".
        local_host = any(h in mongo_uri for h in ("//localhost", "//127.0.0.1", "//[::1]", "//host.docker.internal", "//mongo:", "//mongo/"))
        tls_options: dict = {"tls": False} if local_host else {
            "tls": True,
            "tlsAllowInvalidCertificates": tls_insecure,
            "tlsAllowInvalidHostnames": tls_insecure,
            "tlsCAFile": tls_ca,
        }
        client = MongoClient(
            mongo_uri,
            serverSelectionTimeoutMS=15000,
            connectTimeoutMS=15000,
            **tls_options,
        )

        client.admin.command("ping")

        if "kf8ash8.mongodb.net" in mongo_uri:
            db = client["yesboss_db"]
        else:
            db = client.get_default_database()

        _ensure_collections(db)
        logger.info("MongoDB connected to %s", db.name)
        return db
    except Exception as e:
        logger.error("MongoDB connection failed: %s", str(e))
        return None


def _ensure_collections(db: Database):
    collections = db.list_collection_names()
    required = ["users", "organizations", "employees", "goals", "tasks", "workflows", "task_outcomes", "bottlenecks", "learning_patterns", "documents", "conversations", "uploads", "org_chart_members", "reports", "user_patterns", "notifications", "notification_preferences", "push_subscriptions", "team_updates", "meetings", "zoho_tokens", "google_tokens", "calendar_events", "check_ins", "employee_frequencies", "goal_outcomes", "industry_intelligence", "assistant_sessions", "strategy_chat_sessions", "market_trends", "market_impacts", "files", "approval_requests", "password_reset_codes", "signup_otps", "role_registry", "journal_entries", "journal_checkins", "journal_decisions", "journal_ideas", "journal_recaps", "journal_patterns", "journal_reminders", "financial_metrics", "task_followups", "captures", "commitments", "report_metrics", "weekly_review_sent", "business_profiles"]
    for col in required:
        if col not in collections:
            db.create_collection(col)
            logger.info("Created collection: %s", col)

    _ensure_indexes(db)


def _ensure_indexes(db: Database):
    try:
        db.organizations.create_index("domain")
        db.organizations.create_index("industry")

        db.employees.create_index("email")
        db.employees.create_index("organization_id")
        db.employees.create_index("department")
        db.employees.create_index([("organization_id", 1), ("department", 1)])

        db.tasks.create_index("organization_id")
        db.tasks.create_index("assignee_email")
        db.tasks.create_index("status")
        db.tasks.create_index([("organization_id", 1), ("status", 1)])
        db.tasks.create_index("due_date")
        db.tasks.create_index([("organization_id", 1), ("due_date", 1)])
        db.tasks.create_index("escalation_level")
        db.tasks.create_index([("organization_id", 1), ("escalation_level", 1)])

        db.goals.create_index("organization_id")
        db.goals.create_index("department")
        db.goals.create_index("parent_goal_id")
        db.goals.create_index([("organization_id", 1), ("created_by", 1)])
        db.goals.create_index([("organization_id", 1), ("goal_type", 1)])
        db.goals.create_index([("organization_id", 1), ("is_default", 1)])

        db.workflows.create_index("organization_id")
        db.workflows.create_index([("organization_id", 1), ("created_at", -1)])

        db.notifications.create_index("user_id")
        db.notifications.create_index([("user_id", 1), ("read", 1)])
        db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        db.notifications.create_index([("organization_id", 1), ("created_at", -1)])

        db.org_chart_members.create_index("organization_id")
        db.org_chart_members.create_index([("organization_id", 1), ("department", 1)])

        db.meetings.create_index("organization_id")
        db.meetings.create_index([("organization_id", 1), ("created_at", -1)])

        db.market_trends.create_index("organization_id")
        db.market_trends.create_index([("organization_id", 1), ("published_at", -1)])

        db.market_impacts.create_index("organization_id")

        db.task_outcomes.create_index("organization_id")
        db.task_outcomes.create_index([("organization_id", 1), ("created_at", -1)])

        db.bottlenecks.create_index("organization_id")
        db.bottlenecks.create_index("resolution_status")

        db.files.create_index("organization_id")

        db.zoho_tokens.create_index("user_id", unique=True)
        db.zoho_tokens.create_index("org_id")

        db.mail_digests.create_index("user_id", unique=True)

        db.google_tokens.create_index("user_id", unique=True)
        db.google_tokens.create_index("org_id")

        db.calendar_events.create_index("zoho_event_id", unique=True, sparse=True)
        db.calendar_events.create_index("google_event_id", unique=True, sparse=True)
        db.calendar_events.create_index("organization_id")
        db.calendar_events.create_index([("organization_id", 1), ("start", 1)])

        db.check_ins.create_index("organization_id")
        db.check_ins.create_index([("organization_id", 1), ("check_in_date", -1)])
        db.check_ins.create_index("owner_id")

        db.employee_frequencies.create_index([("org_ref", 1), ("employee_role", 1), ("work_type", 1)])
        db.employee_frequencies.create_index("org_ref")

        db.goal_outcomes.create_index("org_ref")
        db.goal_outcomes.create_index([("industry", 1), ("micro_vertical", 1)])
        db.goal_outcomes.create_index("created_at")

        db.industry_intelligence.create_index([("industry", 1), ("micro_vertical", 1)], unique=True)
        db.industry_intelligence.create_index("last_updated")

        db.password_reset_codes.create_index("expires_at", expireAfterSeconds=0)
        db.signup_otps.create_index("expires_at", expireAfterSeconds=0)

        db.role_registry.create_index("role", unique=True)
        db.role_registry.create_index([("count", -1)])

        db.journal_entries.create_index([("user_id", 1), ("org_id", 1)])
        db.journal_entries.create_index([("org_id", 1), ("created_at", -1)])
        db.journal_entries.create_index([("user_id", 1), ("created_at", -1)])

        db.captures.create_index([("org_id", 1), ("user_id", 1), ("created_at", -1)])
        db.captures.create_index([("org_id", 1), ("kind", 1), ("created_at", -1)])
        db.captures.create_index([("org_id", 1), ("visibility", 1), ("created_at", -1)])
        db.captures.create_index([("org_id", 1), ("shared_with_emails", 1)])
        db.captures.create_index([("org_id", 1), ("user_id", 1), ("status", 1)])
        db.captures.create_index([("org_id", 1), ("series_key", 1), ("created_at", -1)])
        db.captures.create_index([("user_id", 1), ("external_id", 1)], sparse=True)
        db.captures.create_index([("status", 1), ("updated_at", 1)])
        db.users.create_index("capture_token", sparse=True)
        db.commitments.create_index([("capture_id", 1), ("suggestion_id", 1)])
        db.commitments.create_index([("org_id", 1), ("created_at", -1)])
        db.report_metrics.create_index([("capture_id", 1)])
        db.report_metrics.create_index([("org_id", 1), ("series_key", 1), ("metric", 1), ("period_date", 1)])
        db.weekly_review_sent.create_index([("org_id", 1), ("email", 1), ("week", 1)], unique=True)
        db.business_profiles.create_index("org_id", unique=True)
        db.journal_checkins.create_index([("user_id", 1), ("org_id", 1), ("date", -1)], unique=True)
        db.journal_decisions.create_index([("user_id", 1), ("org_id", 1), ("created_at", -1)])
        db.journal_ideas.create_index([("user_id", 1), ("org_id", 1), ("created_at", -1)])
        db.journal_ideas.create_index([("user_id", 1), ("entry_id", 1)])
        db.journal_recaps.create_index([("user_id", 1), ("period", 1), ("range_key", 1)], unique=True)
        db.journal_patterns.create_index([("user_id", 1), ("key", 1)], unique=True)
        db.journal_reminders.create_index([("status", 1), ("user_id", 1)])

        db.financial_metrics.create_index("organization_id")
        db.financial_metrics.create_index([("organization_id", 1), ("extracted_at", -1)])

        # Phase 0 (Communication Agent, additive): per-task 1-1 follow-up threads.
        db.task_followups.create_index([("task_id", 1), ("assignee_email", 1)], unique=True)
        db.task_followups.create_index([("next_followup_at", 1), ("status", 1)])
        db.task_followups.create_index([("org_id", 1), ("created_at", -1)])

        logger.info("Database indexes created")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


def get_database() -> Database:
    if db is None:
        return connect_mongodb()
    return db


def close_mongodb():
    global client
    if client:
        client.close()
        client = None
        logger.info("MongoDB disconnected")
