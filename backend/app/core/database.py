import logging
from pymongo import MongoClient
from pymongo.database import Database
from .config import settings

logger = logging.getLogger("yesboss.database")

client: MongoClient = None
db: Database = None


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
        
        client = MongoClient(
            mongo_uri,
            serverSelectionTimeoutMS=15000,
            connectTimeoutMS=15000,
            tls=True,
            tlsAllowInvalidCertificates=True,
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
    required = ["users", "organizations", "employees", "goals", "tasks", "workflows", "task_outcomes", "bottlenecks", "learning_patterns", "documents", "conversations", "uploads", "org_chart_members", "reports", "user_patterns"]
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
        
        db.goals.create_index("organization_id")
        db.goals.create_index("department")
        
        db.workflows.create_index("organization_id")
        db.workflows.create_index([("organization_id", 1), ("created_at", -1)])
        
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
