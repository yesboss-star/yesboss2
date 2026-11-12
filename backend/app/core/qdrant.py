import logging
import re
from typing import Optional

import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from .config import settings

logger = logging.getLogger("yesboss.qdrant")

client: Optional[QdrantClient] = None


def get_embedding(text: str) -> list[float]:
    """Embed a single text using the configured EMBEDDINGS_PROVIDER.

    Gemini is preferred (real embeddings); falls back to OpenAI, then xAI, then a
    deterministic hash vector. DeepSeek/Grok cannot do embeddings, so this is
    independent of DEFAULT_AI_PROVIDER.
    """
    try:
        if settings.EMBEDDINGS_PROVIDER == "gemini" and settings.GEMINI_API_KEY:
            return _gemini_embed_sync(text)

        api_key = settings.OPENAI_API_KEY or settings.XAI_API_KEY
        base_url = None
        if api_key and settings.OPENAI_API_KEY:
            pass  # default OpenAI base
        elif api_key and settings.XAI_API_KEY:
            base_url = settings.XAI_BASE_URL
        if api_key:
            from openai import OpenAI
            client = OpenAI(api_key=api_key, base_url=base_url)
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
    except Exception as e:
        logger.warning(f"Embedding failed, using fallback: {redact_secrets(e)}")
    return generate_fallback_embedding(text)


def _gemini_embed_sync(text: str, model: str = "gemini-embedding-2", dim: int = 1536) -> list[float]:
    """Single-text Gemini embedding via the embedContent endpoint."""
    import httpx

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent"
    payload = {
        "model": f"models/{model}",
        "content": {"parts": [{"text": text[:8000]}]},
        "outputDimensionality": dim,
    }
    resp = httpx.post(
        url,
        params={"key": settings.GEMINI_API_KEY},
        json=payload,
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]["values"]


def redact_secrets(message: object) -> str:
    """An error text with API keys hidden: the embedding services put the key in the request address, and
    an HTTP error message repeats that address."""
    return re.sub(r"(?i)\b(key|api_key|token)=[^&\s'\")]+", lambda m: m.group(1) + "=***", str(message))


class EmbeddingUnavailable(Exception):
    """No real embedding could be produced (no key, service down, rate limited)."""


def get_embedding_strict(text: str) -> list[float]:
    """A real embedding, or EmbeddingUnavailable. Unlike get_embedding this never invents a vector:
    a made-up vector stored in the index looks like a real memory but matches nothing meaningful."""
    try:
        if settings.EMBEDDINGS_PROVIDER == "gemini" and settings.GEMINI_API_KEY:
            return _gemini_embed_sync(text)
        api_key = settings.OPENAI_API_KEY or settings.XAI_API_KEY
        if api_key:
            from openai import OpenAI

            base_url = None if settings.OPENAI_API_KEY else settings.XAI_BASE_URL
            client = OpenAI(api_key=api_key, base_url=base_url)
            return client.embeddings.create(model="text-embedding-3-small", input=text).data[0].embedding
    except Exception as e:
        raise EmbeddingUnavailable(redact_secrets(e)) from None  # not 'from e': the original error text carries the key
    raise EmbeddingUnavailable("no embedding provider is configured")


def vector_search(client, collection_name: str, query_vector: list[float], limit: int, query_filter=None):
    """Nearest points to a vector. The client library renamed search() to query_points(); this works with both."""
    if hasattr(client, "query_points"):
        return client.query_points(
            collection_name=collection_name, query=query_vector, limit=limit, query_filter=query_filter, with_payload=True,
        ).points
    return client.search(collection_name=collection_name, query_vector=query_vector, limit=limit, query_filter=query_filter, with_payload=True)


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
            timeout=20,
            check_compatibility=False,  # the cloud server is newer than the client library; the calls we use are stable
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


_indexed: set[tuple[str, str]] = set()  # indexes already created in this process


def ensure_payload_indexes(collection_name: str, keyword: tuple[str, ...] = (), number: tuple[str, ...] = ()) -> None:
    """Qdrant Cloud refuses a filtered query or delete on a field that has no index. Creating one again is harmless."""
    qdrant = get_qdrant_client()
    if qdrant is None:
        return
    for fields, schema in ((keyword, "keyword"), (number, "float")):
        for field in fields:
            if (collection_name, field) in _indexed:
                continue
            try:
                qdrant.create_payload_index(collection_name, field_name=field, field_schema=schema)
                _indexed.add((collection_name, field))
            except Exception as e:
                logger.warning("payload index %s.%s not created: %s", collection_name, field, e)


def close_qdrant():
    global client
    client = None
    logger.info("Qdrant disconnected")
