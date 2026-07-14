import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..core.database import get_database
from ..core.file_processor import (
    ALLOWED_EXTENSIONS,
    get_org_document_context,
    process_file,
    search_documents,
)

logger = logging.getLogger("yesboss.file_processing_api")
router = APIRouter()


def _fetch_org_context(org_id: str) -> dict:
    if not org_id or org_id == "temp":
        return {}
    try:
        from bson import ObjectId
        db = get_database()
        if db is None:
            return {}
        try:
            org = db.organizations.find_one({"_id": ObjectId(org_id)})
        except Exception:
            org = db.organizations.find_one({"_id": org_id})
        if not org:
            return {}
        return {
            "company_name": org.get("name", ""),
            "industry": org.get("industry", ""),
            "micro_vertical": org.get("micro_vertical", ""),
        }
    except Exception:
        return {}


@router.post("/process")
async def process_uploaded_file(
    file: UploadFile = File(...),
    org_id: str = Form(...),
    user_id: str = Form(...),
    provider: str | None = Form(None),
    company_name: str | None = Form(None),
    industry: str | None = Form(None),
    micro_vertical: str | None = Form(None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    ext = "." + file.filename.lower().split(".")[-1]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    try:
        contents = await file.read()

        if len(contents) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 25MB)")

        ctx = _fetch_org_context(org_id) if org_id and org_id != "temp" else {}
        cn = company_name or ctx.get("company_name") or ""
        ind = industry or ctx.get("industry") or ""
        mv = micro_vertical or ctx.get("micro_vertical") or ""

        result = await process_file(
            file_bytes=contents,
            filename=file.filename,
            org_id=org_id,
            user_id=user_id,
            provider=provider,
            company_name=cn,
            industry=ind,
            micro_vertical=mv,
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-process")
async def batch_process_files(
    files: list[UploadFile] = File(...),
    org_id: str = Form(...),
    user_id: str = Form(...),
    provider: str | None = Form(None),
    company_name: str | None = Form(None),
    industry: str | None = Form(None),
    micro_vertical: str | None = Form(None),
):
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files at once")

    ctx = _fetch_org_context(org_id) if org_id and org_id != "temp" else {}
    cn = company_name or ctx.get("company_name") or ""
    ind = industry or ctx.get("industry") or ""
    mv = micro_vertical or ctx.get("micro_vertical") or ""

    results = []
    for file in files:
        try:
            ext = "." + file.filename.lower().split(".")[-1]
            if ext not in ALLOWED_EXTENSIONS:
                results.append({"filename": file.filename, "status": "failed", "error": "Unsupported file type"})
                continue

            contents = await file.read()
            result = await process_file(
                contents,
                file.filename,
                org_id,
                user_id,
                provider,
                company_name=cn,
                industry=ind,
                micro_vertical=mv,
            )
            results.append(result)
        except Exception as e:
            results.append({"filename": file.filename, "status": "failed", "error": str(e)})

    return {
        "results": results,
        "total": len(files),
        "completed": sum(1 for r in results if r.get("status") == "completed"),
    }


@router.get("/search")
async def search_org_documents(
    org_id: str,
    query: str,
    limit: int = 5,
    provider: str | None = None,
    user_id: str | None = None,
):
    if not org_id or not query:
        raise HTTPException(status_code=400, detail="org_id and query are required")

    results = await search_documents(org_id, query, limit, provider, user_id=user_id)
    return {"results": results, "count": len(results)}


@router.get("/document-types")
async def get_document_types(
    org_id: str,
    user_id: str | None = None,
):
    from ..core.qdrant import get_qdrant_client

    try:
        client = get_qdrant_client()

        from qdrant_client.models import FieldCondition, Filter, Match
        filter_conditions = [FieldCondition(key="org_id", match=Match(value=org_id))]
        if user_id:
            filter_conditions.append(FieldCondition(key="user_id", match=Match(value=user_id)))
        results = client.scroll(
            collection_name="documents",
            scroll_filter=Filter(must=filter_conditions),
            limit=100,
            with_payload=True
        )

        types = set()
        for point in results[0]:
            if point.payload.get("document_type"):
                types.add(point.payload["document_type"])

        return {"document_types": list(types)}
    except Exception as e:
        return {"document_types": [], "error": str(e)}


@router.get("/context")
async def get_organization_document_context(
    org_id: str,
    max_docs: int = 20,
    user_id: str | None = None,
):
    """Return the structured context (summaries, metrics, decisions) of all
    analyzed documents for an organization. Powers dashboard widgets."""
    if not org_id:
        raise HTTPException(status_code=400, detail="org_id is required")
    return await get_org_document_context(org_id, max_docs=max_docs, user_id=user_id)


from pydantic import BaseModel as _BaseModel


class AskDocumentsRequest(_BaseModel):
    org_id: str
    question: str
    top_k: int = 5
    provider: str | None = None
    user_id: str | None = None


@router.post("/ask")
async def ask_documents(request: AskDocumentsRequest):
    """Ask a question and get an AI answer based on the org's uploaded documents.

    1. Semantic search the org's document chunks in Qdrant (deep search).
    2. Also pull the structured summary + metrics from MongoDB (overview).
    3. Ask Grok to answer using both.
    """
    if not request.org_id or not request.question:
        raise HTTPException(status_code=400, detail="org_id and question are required")

    from ..core.ai_client import get_ai_response
    from ..core.database import get_database
    from ..core.file_processor import get_org_document_context
    from ..core.intelligence import extract_document_insights as _unused  # noqa: F401

    overview = await get_org_document_context(request.org_id, max_docs=15, user_id=request.user_id)

    search_results = await search_documents(
        request.org_id,
        request.question,
        top_k=request.top_k,
        provider=request.provider,
        user_id=request.user_id,
    )

    chunk_block_parts = []
    for i, r in enumerate(search_results[:request.top_k], 1):
        chunk_block_parts.append(
            f"[{i}] From {r.get('filename', 'unknown')}: {r.get('text', '')}"
        )
    chunks_text = "\n\n".join(chunk_block_parts) if chunk_block_parts else ""

    if not overview.get("summary") and not chunks_text:
        return {
            "answer": "I couldn't find any analyzed documents for your organization yet. Upload some documents (financial reports, sales data, customer lists, etc.) and I'll be able to answer questions about them.",
            "sources": [],
            "has_context": False,
        }

    org_doc = None
    try:
        from bson import ObjectId
        db = get_database()
        if db is not None:
            try:
                org_doc = db.organizations.find_one({"_id": ObjectId(request.org_id)})
            except Exception:
                org_doc = db.organizations.find_one({"_id": request.org_id})
    except Exception:
        org_doc = None

    org_name = (org_doc or {}).get("name", "")
    org_industry = (org_doc or {}).get("industry", "")

    system_prompt = (
        "You are a sharp business analyst assistant. Answer the owner's question using the document context below. "
        "Be specific, cite the source filename inline like (from: filename.pdf), and quote actual numbers when available. "
        "If the context does not contain the answer, say so clearly. Do not invent numbers."
    )
    user_prompt = f"""Question: {request.question}

Company: {org_name or 'Unknown'}
Industry: {org_industry or 'Unknown'}

=== Overview from analyzed documents ===
{overview.get('summary', 'No analyzed documents yet.')}

=== Relevant excerpts (semantic search) ===
{chunks_text or 'No relevant excerpts found.'}

Provide a concise, useful answer. If you cite a number, cite the source filename."""

    try:
        answer = await get_ai_response(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=900,
        )
    except Exception as e:
        logger.error(f"Ask-documents AI call failed: {e}")
        answer = "I ran into an issue answering that. Please try again."

    sources = [
        {
            "filename": r.get("filename"),
            "file_id": r.get("file_id"),
            "score": r.get("score"),
            "excerpt": (r.get("text") or "")[:300],
        }
        for r in search_results
    ]

    return {
        "answer": answer.strip(),
        "sources": sources,
        "has_context": True,
        "documents_analyzed": overview.get("analyzed_documents", 0),
    }
