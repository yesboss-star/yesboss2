import os
import logging
from dotenv import load_dotenv

load_dotenv(override=True)

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

    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

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
