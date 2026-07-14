import os
import logging
from pathlib import Path
from dotenv import load_dotenv

env_name = os.getenv("ENVIRONMENT", "development")
env_file = ".env.live" if env_name == "production" else ".env.dev"
env_path = Path(__file__).resolve().parent.parent.parent / env_file
load_dotenv(dotenv_path=env_path, override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger("yesboss.config")


class Settings:
    XAI_API_KEY: str = os.getenv("XAI_API_KEY", "")
    XAI_BASE_URL: str = os.getenv("XAI_BASE_URL", "https://api.x.ai/v1")
    XAI_MODEL: str = os.getenv("XAI_MODEL", "grok-3")

    DEFAULT_AI_PROVIDER: str = os.getenv("DEFAULT_AI_PROVIDER", "xai")

    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    QWEN_BASE_URL: str = os.getenv("QWEN_BASE_URL", "http://localhost:11434/v1")
    QWEN_API_KEY: str = os.getenv("QWEN_API_KEY", "ollama")
    QWEN_MODEL: str = os.getenv("QWEN_MODEL", "qwen2.5:14b")

    FIRECRAWL_API_KEY: str = os.getenv("FIRECRAWL_API_KEY", "")

    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    MONGODB_URI: str = os.getenv("MONGODB_URI", "")

    QDRANT_URL: str = os.getenv("QDRANT_URL", "")
    QDRANT_API_KEY: str = os.getenv("QDRANT_API_KEY", "")

    REDIS_URL: str = os.getenv("REDIS_URL", "")

    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "")

    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASS: str = os.getenv("SMTP_PASS", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@yesboss.app")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

    ZOHO_CLIENT_ID: str = os.getenv("ZOHO_CLIENT_ID", "")
    ZOHO_CLIENT_SECRET: str = os.getenv("ZOHO_CLIENT_SECRET", "")
    ZOHO_REDIRECT_URI: str = os.getenv("ZOHO_REDIRECT_URI", "http://localhost:8000/api/v1/zoho/callback")
    ZOHO_ACCOUNTS_URL: str = os.getenv("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.com")
    ZOHO_MAIL_API_URL: str = os.getenv("ZOHO_MAIL_API_URL", "https://mail.zoho.com/api")
    ZOHO_CALENDAR_API_URL: str = os.getenv("ZOHO_CALENDAR_API_URL", "https://calendar.zoho.com/api/v1")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    API_URL: str = os.getenv("API_URL", "http://localhost:8000/api/v1")

    VAPID_PUBLIC_KEY: str = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")
    VAPID_CLAIMS_EMAIL: str = os.getenv("VAPID_CLAIMS_EMAIL", "admin@yesboss.app")

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

    FIREBASE_CREDENTIALS_PATH: str = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
    FIREBASE_CREDENTIALS_JSON: str = os.getenv("FIREBASE_CREDENTIALS_JSON", "")

    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").lower()
    ADMIN_API_KEY: str = os.getenv("ADMIN_API_KEY", "")

    def validate(self):
        required = {
            "MONGODB_URI": self.MONGODB_URI,
            "SUPABASE_URL": self.SUPABASE_URL,
            "SUPABASE_KEY": self.SUPABASE_KEY,
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            logger.warning(f"Missing required env vars: {', '.join(missing)}")

        optional = {
            "OPENAI_API_KEY": self.OPENAI_API_KEY,
            "ANTHROPIC_API_KEY": self.ANTHROPIC_API_KEY,
            "GROQ_API_KEY": self.GROQ_API_KEY,
            "QDRANT_URL": self.QDRANT_URL,
            "FIRECRAWL_API_KEY": self.FIRECRAWL_API_KEY,
        }
        for k, v in optional.items():
            if not v:
                logger.info(f"Optional env var not set: {k}")


settings = Settings()
settings.validate()
