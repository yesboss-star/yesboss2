"""Purge all Zoho OAuth tokens.

Run this after rotating ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET so users
reconnect with the new Zoho client. Old tokens were issued by the old
client and cannot be refreshed.

Usage:
    python clear_zoho_tokens.py

Loads backend/.env (or .env.live when ENVIRONMENT=production) via app.core.config.
"""

import logging
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import get_database

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
logger = logging.getLogger("clear_zoho_tokens")


def main():
    db = get_database()
    if db is None:
        logger.error("MongoDB not configured — cannot purge zoho_tokens")
        sys.exit(1)

    try:
        existing = db.zoho_tokens.count_documents({})
    except Exception as e:
        logger.error("Failed to count zoho_tokens: %s", e)
        sys.exit(1)

    logger.info("Found %d zoho_tokens document(s) in '%s'", existing, db.name)
    result = db.zoho_tokens.delete_many({})
    logger.info("Deleted %d zoho_tokens document(s)", result.deleted_count)


if __name__ == "__main__":
    main()
