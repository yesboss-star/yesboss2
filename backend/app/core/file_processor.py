import io
import re
import logging
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime

logger = logging.getLogger("yesboss.file_processor")

ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".png", ".jpg", ".jpeg", ".docx", ".txt", ".csv"}

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


def get_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    type_map = {
        "pdf": "pdf",
        "xlsx": "excel",
        "xls": "excel",
        "png": "image",
        "jpg": "image",
        "jpeg": "image",
        "docx": "word",
        "txt": "text",
        "csv": "csv",
    }
    return type_map.get(ext, "unknown")


def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        import fitz
        doc = fitz.open(stream=file_bytes, doc_type="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text.strip()
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        try:
            import PyPDF2
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() or ""
            return text.strip()
        except Exception as e2:
            logger.error(f"PDF fallback also failed: {e2}")
            return ""


def extract_text_from_excel(file_bytes: bytes) -> str:
    try:
        import pandas as pd
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None)
        text = ""
        for sheet_name, sheet_df in df.items():
            text += f"\n## Sheet: {sheet_name}\n"
            text += sheet_df.to_string() + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"Excel extraction failed: {e}")
        return ""


def extract_text_from_image(file_bytes: bytes, file_type: str) -> str:
    try:
        from PIL import Image
        import pytesseract
        
        image = Image.open(io.BytesIO(file_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")
        
        text = pytesseract.image_to_string(image)
        return text.strip()
    except Exception as e:
        logger.error(f"OCR extraction failed: {e}")
        try:
            from transformers import pipeline
            import torch
            
            if torch.cuda.is_available():
                ocr_pipeline = pipeline("ocr", model="microsoft/trocr-base-handwritten", device=0)
            else:
                ocr_pipeline = pipeline("ocr", model="microsoft/trocr-base-handwritten")
            
            image = Image.open(io.BytesIO(file_bytes))
            result = ocr_pipeline(image)
            return result[0]["generated_text"] if result else ""
        except Exception as e2:
            logger.error(f"OCR fallback also failed: {e2}")
            return ""


def extract_text_from_word(file_bytes: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    text += cell.text + " "
                text += "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"Word extraction failed: {e}")
        return ""


def extract_text_from_csv(file_bytes: bytes) -> str:
    try:
        import pandas as pd
        df = pd.read_csv(io.BytesIO(file_bytes))
        return df.to_string()
    except Exception as e:
        logger.error(f"CSV extraction failed: {e}")
        return ""


def extract_text_from_txt(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode("utf-8", errors="ignore").strip()
    except Exception as e:
        logger.error(f"Text extraction failed: {e}")
        return ""


def extract_text(file_bytes: bytes, filename: str) -> str:
    file_type = get_file_type(filename)
    logger.info(f"Extracting text from {filename} (type: {file_type})")
    
    extractors = {
        "pdf": extract_text_from_pdf,
        "excel": extract_text_from_excel,
        "image": lambda b: extract_text_from_image(b, "image"),
        "word": extract_text_from_word,
        "csv": extract_text_from_csv,
        "text": extract_text_from_txt,
    }
    
    extractor = extractors.get(file_type)
    if extractor:
        return extractor(file_bytes)
    
    return ""


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    if not text:
        return []
    
    chunks = []
    for i in range(0, len(text), chunk_size - overlap):
        chunk = text[i:i + chunk_size]
        if chunk.strip():
            chunks.append(chunk)
    return chunks


async def generate_embeddings(texts: List[str], provider: Optional[str] = None) -> List[List[float]]:
    from .config import settings
    resolved_provider = provider or settings.DEFAULT_AI_PROVIDER
    
    embeddings = []
    
    try:
        from openai import AsyncOpenAI
        
        if resolved_provider == "xai":
            api_key = settings.XAI_API_KEY
            base_url = settings.XAI_BASE_URL
        elif resolved_provider == "openai":
            api_key = settings.OPENAI_API_KEY
            base_url = None
        elif resolved_provider == "qwen":
            api_key = settings.QWEN_API_KEY
            base_url = settings.QWEN_BASE_URL
        else:
            api_key = None
            base_url = None
        
        if api_key:
            client = AsyncOpenAI(api_key=api_key, base_url=base_url)
            for text in texts:
                response = await client.embeddings.create(
                    model="text-embedding-3-small",
                    input=text[:8000]
                )
                embeddings.append(response.data[0].embedding)
        else:
            for text in texts:
                embeddings.append([0.0] * 1536)
    except Exception as e:
        logger.error(f"Embedding failed with {resolved_provider}: {e}")
        for text in texts:
            embeddings.append([0.0] * 1536)
    
    return embeddings


async def store_embeddings_in_qdrant(
    collection_name: str,
    vectors: List[List[float]],
    payloads: List[Dict]
):
    from .qdrant import get_qdrant_client
    
    try:
        client = get_qdrant_client()
        
        points = []
        for i, (vector, payload) in enumerate(zip(vectors, payloads)):
            points.append({
                "id": str(uuid.uuid4()),
                "vector": vector,
                "payload": payload
            })
        
        if points:
            client.upsert(
                collection_name=collection_name,
                points=points
            )
        
        return True
    except Exception as e:
        logger.error(f"Failed to store in Qdrant: {e}")
        return False


async def process_file(
    file_bytes: bytes,
    filename: str,
    org_id: str,
    user_id: str,
    provider: Optional[str] = None
) -> Dict[str, Any]:
    logger.info(f"Processing file: {filename} for org: {org_id}")
    
    file_id = str(uuid.uuid4())
    file_type = get_file_type(filename)
    
    text = extract_text(file_bytes, filename)
    
    if not text:
        return {
            "file_id": file_id,
            "filename": filename,
            "status": "failed",
            "error": "Could not extract text from file"
        }
    
    chunks = chunk_text(text)
    
    metadata = {
        "file_id": file_id,
        "filename": filename,
        "file_type": file_type,
        "org_id": org_id,
        "user_id": user_id,
        "text_length": len(text),
        "chunk_count": len(chunks),
        "processed_at": datetime.utcnow().isoformat(),
        "document_type": file_type
    }
    
    from .database import get_database
    db = get_database()
    
    doc = {
        "file_id": file_id,
        "filename": filename,
        "file_type": file_type,
        "org_id": org_id,
        "user_id": user_id,
        "text": text[:10000],
        "text_length": len(text),
        "chunks": chunks,
        "chunk_count": len(chunks),
        "created_at": datetime.utcnow(),
        "metadata": metadata
    }
    
    try:
        db.documents.insert_one(doc)
    except Exception as e:
        logger.error(f"Failed to save document to MongoDB: {e}")
    
    if chunks:
        try:
            embeddings = await generate_embeddings(chunks, provider)
            
            payloads = []
            for i, chunk in enumerate(chunks):
                payloads.append({
                    "file_id": file_id,
                    "filename": filename,
                    "org_id": org_id,
                    "chunk_index": i,
                    "chunk_text": chunk[:500],
                    "document_type": file_type,
                    "processed_at": datetime.utcnow().isoformat()
                })
            
            await store_embeddings_in_qdrant("documents", embeddings, payloads)
        except Exception as e:
            logger.error(f"Failed to create embeddings: {e}")
    
    return {
        "file_id": file_id,
        "filename": filename,
        "file_type": file_type,
        "status": "completed",
        "text_length": len(text),
        "chunks": len(chunks),
        "message": "File processed successfully"
    }


async def search_documents(
    org_id: str,
    query: str,
    top_k: int = 5,
    provider: Optional[str] = None
) -> List[Dict[str, Any]]:
    logger.info(f"Searching documents for org: {org_id}, query: {query}")
    
    from .ai_client import get_ai_response
    
    try:
        query_embedding = await generate_embeddings([query], provider)
        query_vector = query_embedding[0]
    except Exception as e:
        logger.error(f"Failed to generate query embedding: {e}")
        return []
    
    try:
        from .qdrant import get_qdrant_client
        from qdrant_client.models import Filter, FieldCondition, Match, MatchExcept, HasId
        
        client = get_qdrant_client()
        
        results = client.search(
            collection_name="documents",
            query_vector=query_vector,
            limit=top_k,
            query_filter=Filter(
                must=[FieldCondition(key="org_id", match=Match(value=org_id))]
            ),
            with_payload=True
        )
        
        search_results = []
        for result in results:
            search_results.append({
                "filename": result.payload.get("filename"),
                "text": result.payload.get("chunk_text", ""),
                "score": result.score,
                "file_id": result.payload.get("file_id")
            })
        
        return search_results
    except Exception as e:
        logger.error(f"Search failed: {e}")
        
        db = get_database()
        try:
            docs = list(db.documents.find(
                {"org_id": org_id},
                {"filename": 1, "text": 1, "text_length": 1}
            ).limit(top_k))
            
            return [{"filename": d.get("filename"), "text": d.get("text", "")[:500], "score": 0.5} for d in docs]
        except:
            return []