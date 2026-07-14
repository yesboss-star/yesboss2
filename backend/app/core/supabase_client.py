import logging

from supabase import create_client

from .config import settings

logger = logging.getLogger("yesboss.supabase")

_client = None


def connect_supabase():
    global _client
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        logger.warning("Supabase credentials not configured")
        return None

    try:
        _client = create_client(
            supabase_url=settings.SUPABASE_URL,
            supabase_key=settings.SUPABASE_KEY,
        )
        logger.info("Supabase connected at %s", settings.SUPABASE_URL)
        return _client
    except Exception as e:
        logger.error("Supabase connection failed: %s", str(e))
        return None


def get_supabase():
    if _client is None:
        return connect_supabase()
    return _client
