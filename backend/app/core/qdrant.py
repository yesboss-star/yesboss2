import logging
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from .config import settings

logger = logging.getLogger("yesboss.qdrant")

client: QdrantClient = None


def get_embedding(text: str) -> list[float]:
    try:
        from openai import AsyncOpenAI
        if not settings.OPENAI_API_KEY:
            return generate_fallback_embedding(text)
        
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        logger.warning(f"OpenAI embedding failed, using fallback: {e}")
        return generate_fallback_embedding(text)


def generate_fallback_embedding(text: str, dim: int = 1536) -> list[float]:
    text_hash = hash(text)
    np.random.seed(text_hash % (2**32))
    embedding = np.random.randn(dim).astype(np.float32)
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()


def connect_qdrant():
    global client
    if not settings.QDRANT_URL or not settings.QDRANT_API_KEY:
        logger.warning("Qdrant credentials not configured")
        return None

    try:
        client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
        )
        client.get_collections()
        logger.info("Qdrant connected at %s", settings.QDRANT_URL)
        return client
    except Exception as e:
        logger.error("Qdrant connection failed: %s", str(e))
        return None


def get_qdrant_client() -> QdrantClient:
    if client is None:
        return connect_qdrant()
    return client


def create_collection(collection_name: str, vector_size: int = 1536):
    qdrant = get_qdrant_client()
    if qdrant is None:
        logger.error("Cannot create collection: Qdrant not connected")
        return False

    try:
        collections = qdrant.get_collections().collections
        collection_names = [c.name for c in collections]

        if collection_name not in collection_names:
            qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )
            logger.info("Collection '%s' created", collection_name)
        else:
            logger.info("Collection '%s' already exists", collection_name)
        return True
    except Exception as e:
        logger.error("Failed to create collection '%s': %s", collection_name, str(e))
        return False


def close_qdrant():
    global client
    client = None
    logger.info("Qdrant disconnected")
