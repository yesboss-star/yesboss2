import logging
import urllib.parse
import os
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user, get_current_user_optional
from ..core.ai_client import get_chat_response, get_ai_response
from ..core.file_processor import ALLOWED_EXTENSIONS
from bson import ObjectId

router = APIRouter()
logger = logging.getLogger("yesboss.executive_chat")


def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


class Message(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None
    history: Optional[List[Message]] = None
    organization_id: Optional[str] = None


class ExpertResponse(BaseModel):
    expert: str
    response: str
    confidence: float
    sources: Optional[List[str]] = None


class ExecutiveResponse(BaseModel):
    message: str
    expert_responses: List[ExpertResponse]
    action_items: Optional[List[str]] = None
    timestamp: str


async def scrape_website_text(url: str) -> str:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, follow_redirects=True)
            if resp.status_code == 200:
                import re
                text = resp.text
                text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)
                text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
                text = re.sub(r'<[^>]+>', ' ', text)
                text = re.sub(r'\s+', ' ', text).strip()
                return text[:3000]
    except Exception as e:
        logger.warning(f"Website scrape failed for {url}: {e}")
    return ""


@router.post("/chat")
async def executive_chat(request: ChatRequest, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = request.organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) if current_user else None

    from ..core.prompt_engine import MasterPromptEngine
    engine = MasterPromptEngine(db)
    context_block = await engine.build_prompt(
        org_id=org_id,
        user_id=user_id,
        agent_type="business_analyst",
    )

    conversation_history = []
    if request.history:
        for msg in request.history[-6:]:
            conversation_history.append({"role": msg.role, "content": msg.content})

    system_prompt = (
        "You are an AI Business Analyst on the user's executive dashboard. You behave like ChatGPT: "
        "concise, direct, conversational, and useful.\n\n"
        "PRIME DIRECTIVE — DATA HONESTY:\n"
        "- First, read the CONTEXT block. Use ONLY the data actually present there (goals, tasks, team, documents, organization, etc.).\n"
        "- Never invent numbers, percentages, names, dates, or facts that are not in the context.\n"
        "- If the user asks something the context cannot answer, say plainly which ONE specific piece of data is missing and ask the user to add it (e.g. 'Upload your latest sales report (PDF or CSV) and I'll break it down by month.'). Be specific — name the exact file or field you need.\n"
        "- If the user asks something that is NOT about their business data (general business question, strategy, definitions, frameworks, etc.), answer from your own knowledge.\n\n"
        "RESPONSE STYLE:\n"
        "- Be concise. Short paragraphs, tight bullet lists, no filler. No hype, no exaggeration.\n"
        "- Lead with the answer. Skip preambles like 'Great question!' or 'Certainly!'.\n"
        "- Use **bold** for key numbers, names, and the single most important takeaway.\n"
        "- Default to 1–4 short bullets or 2–4 sentences. Expand only when the user asks for detail.\n"
        "- Reference real context items by name (e.g. goal title, document name) when relevant.\n\n"
        "WHEN THE QUESTION IS UNCLEAR:\n"
        "- If the question is vague or could mean several things, ask ONE short clarifying question instead of guessing. Offer 2–3 quick options if helpful.\n"
        "- Prefer counter-questions that move the conversation forward (e.g. 'Are you asking about revenue this month, or quarter-to-date?').\n"
        "- If the user says something like 'help me with my business', acknowledge briefly and ask the single most useful next question.\n\n"
        "WHEN DATA IS MISSING:\n"
        "- Say in one sentence what you can see, and one sentence what specific data you need.\n"
        "- Be specific: name the exact document, field, or value you need (e.g. 'I need your customer count and churn % for the last quarter — upload a CSV or PDF and I'll analyze it.').\n"
        "- Do not list every possible missing field — pick the highest-leverage one.\n\n"
        "PROACTIVE KPI SUGGESTION:\n"
        "- When you mention a specific metric, KPI, or measurable number in your answer, end the reply with a single short line: "
        "'💡 Want to track this as a KPI on your dashboard? Just say *add this as a KPI* or click the **+ Add as KPI** button below.'\n"
        "- Do NOT add this line if the answer is purely conceptual (definitions, frameworks, general advice) with no specific metric.\n\n"
        "TONE:\n"
        "- Friendly, sharp, on point. Like a sharp analyst in a chat, not a consultant in a deck."
    )

    user_prompt = f"{context_block}\n\nQuestion: {request.message}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": user_prompt})

    ai_response = ""
    try:
        ai_response = await get_chat_response(
            messages=messages,
            provider="xai",
            temperature=0.7,
            max_tokens=2000,
        )
    except Exception as e:
        logger.error(f"AI chat failed: {e}")
        org = db.organizations.find_one({"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id})
        org_name = org.get("name", "Your Organization") if org else "Your Organization"
        quote_count = context_block.count('"')
        ai_response = (
            f"I'm having trouble connecting to my AI engine. Here's what I know about {org_name}:\n\n"
            f"I found {quote_count} data points in your organization. "
            f"Please try your question again in a moment."
        )

    action_items = []
    lines = ai_response.split("\n")
    gathering = False
    for line in lines:
        stripped = line.strip()
        if stripped.lower().startswith(("action item", "recommend", "next step", "suggest")):
            gathering = True
            continue
        if gathering and stripped.startswith("- ") and len(stripped) > 3:
            action_items.append(stripped[2:].strip())
        elif gathering and stripped == "":
            gathering = False
    if not action_items:
        action_items = [
            "Review the insights above",
            "Ask follow-up questions for deeper analysis",
            "Upload documents for richer business analysis"
        ]

    expert_responses = [ExpertResponse(
        expert="Business Analyst",
        response=ai_response[:400] + ("..." if len(ai_response) > 400 else ""),
        confidence=0.92,
        sources=["Organization Data", "AI Analysis"]
    )]

    return ExecutiveResponse(
        message=ai_response,
        expert_responses=expert_responses,
        action_items=action_items,
        timestamp=datetime.utcnow().isoformat()
    )


@router.post("/upload-and-analyze")
async def upload_and_analyze(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    ext = "." + file.filename.lower().split(".")[-1]
    allowed = {".pdf", ".docx", ".txt", ".csv", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed")

    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")

    from ..core.file_processor import extract_text, chunk_text, generate_embeddings, store_embeddings_in_qdrant
    import uuid

    text = extract_text(contents, file.filename)
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract text from file")

    file_id = str(uuid.uuid4())
    file_type = ext[1:]

    upload_dir = f"uploads/chat/{organization_id}"
    os.makedirs(upload_dir, exist_ok=True)
    unique_name = f"{file_id}_{file.filename}"
    file_path = os.path.join(upload_dir, unique_name)
    with open(file_path, "wb") as f:
        f.write(contents)

    doc = {
        "file_id": file_id,
        "filename": file.filename,
        "file_path": file_path,
        "file_type": file_type,
        "org_id": organization_id,
        "user_id": getattr(current_user, 'id', None) or "",
        "text": text[:10000],
        "text_length": len(text),
        "chunks": chunk_text(text),
        "chunk_count": 0,
        "created_at": datetime.utcnow(),
        "metadata": {
            "file_id": file_id,
            "filename": file.filename,
            "org_id": organization_id,
            "text_length": len(text),
        }
    }
    doc["chunk_count"] = len(doc["chunks"])
    db.documents.insert_one(doc)

    try:
        embeddings = await generate_embeddings(doc["chunks"])
        payloads = []
        for i, chunk in enumerate(doc["chunks"]):
            payloads.append({
                "file_id": file_id,
                "filename": file.filename,
                "org_id": organization_id,
                "chunk_index": i,
                "chunk_text": chunk[:500],
                "document_type": file_type,
                "processed_at": datetime.utcnow().isoformat()
            })
        await store_embeddings_in_qdrant("documents", embeddings, payloads)
    except Exception as e:
        logger.warning(f"Embedding failed for chat upload: {e}")

    return {
        "file_id": file_id,
        "filename": file.filename,
        "file_type": file_type,
        "status": "completed",
        "text_preview": text[:500],
        "text_length": len(text),
        "message": f"File '{file.filename}' uploaded and analyzed. You can now ask questions about it."
    }


@router.post("/upload-url")
async def upload_from_url(
    url: str = Form(...),
    organization_id: str = Form(...),
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    import httpx
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Failed to fetch URL (status {resp.status_code})")
            contents = resp.content
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail="URL fetch timed out")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {str(e)}")

    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")

    import re, uuid
    from urllib.parse import unquote
    from ..core.file_processor import extract_text, chunk_text, generate_embeddings, store_embeddings_in_qdrant
    import mimetypes

    content_type = resp.headers.get("content-type", "")

    ext_map = {
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.ms-excel": ".xls",
        "text/csv": ".csv",
        "text/plain": ".txt",
        "image/png": ".png",
        "image/jpeg": ".jpg",
    }

    is_html = "html" in content_type

    if is_html:
        html_raw = contents.decode("utf-8", errors="ignore")
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html_raw, re.DOTALL)
        page_title = title_match.group(1).strip() if title_match else "Untitled Page"
        text = re.sub(r'<script[^>]*>.*?</script>', '', html_raw, flags=re.DOTALL)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        text = text[:100000]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract readable content from that web page.")
        filename = f"{page_title[:50].replace('/', '_').replace(':', '_')}.txt"
        ext = ".txt"
        file_type = "text"
        file_id = str(uuid.uuid4())
        upload_dir = f"uploads/chat/{organization_id}"
        os.makedirs(upload_dir, exist_ok=True)
        unique_name = f"{file_id}_{filename}"
        file_path = os.path.join(upload_dir, unique_name)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(text)
        doc = {
            "file_id": file_id, "filename": filename, "file_path": file_path,
            "file_type": file_type, "org_id": organization_id,
            "user_id": getattr(current_user, 'id', None) or "",
            "text": text[:10000], "text_length": len(text),
            "chunks": chunk_text(text), "chunk_count": 0,
            "created_at": datetime.utcnow(),
            "metadata": {"file_id": file_id, "filename": filename, "org_id": organization_id,
                         "text_length": len(text), "source_url": url, "source_type": "webpage"}
        }
        doc["chunk_count"] = len(doc["chunks"])
        db.documents.insert_one(doc)
        try:
            embeddings = await generate_embeddings(doc["chunks"])
            payloads = []
            for i, chunk in enumerate(doc["chunks"]):
                payloads.append({
                    "file_id": file_id, "filename": filename, "org_id": organization_id,
                    "chunk_index": i, "chunk_text": chunk[:500],
                    "document_type": "webpage", "processed_at": datetime.utcnow().isoformat()
                })
            await store_embeddings_in_qdrant("documents", embeddings, payloads)
        except Exception as e:
            logger.warning(f"Embedding failed for webpage: {e}")
        return {
            "file_id": file_id, "filename": filename, "file_type": file_type,
            "status": "completed", "text_preview": text[:500],
            "text_length": len(text),
            "message": f"Web page '{page_title}' scraped and analyzed ({len(text)} chars). You can now ask questions about it."
        }

    ext = ".txt"
    for ct, e in ext_map.items():
        if ct in content_type:
            ext = e
            break

    filename = f"url-import{ext}"
    guessed = mimetypes.guess_type(url)[0]
    if guessed:
        for ct, e in ext_map.items():
            if ct == guessed:
                ext = e
                break

    url_path = unquote(url.split("?")[0].split("/")[-1])
    if "." in url_path:
        orig_ext = "." + url_path.rsplit(".", 1)[1].lower()
        if orig_ext in ALLOWED_EXTENSIONS:
            ext = orig_ext
            filename = url_path

    text = extract_text(contents, filename)
    if not text:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from the file at this URL. "
                   "The file may be password-protected, scanned (image-only PDF), or in an unsupported format. "
                   "Try uploading the file directly using the paperclip button instead."
        )

    file_id = str(uuid.uuid4())
    file_type = ext[1:]

    upload_dir = f"uploads/chat/{organization_id}"
    os.makedirs(upload_dir, exist_ok=True)
    unique_name = f"{file_id}_{filename}"
    file_path = os.path.join(upload_dir, unique_name)
    with open(file_path, "wb") as f:
        f.write(contents)

    doc = {
        "file_id": file_id,
        "filename": filename,
        "file_path": file_path,
        "file_type": file_type,
        "org_id": organization_id,
        "user_id": getattr(current_user, 'id', None) or "",
        "text": text[:10000],
        "text_length": len(text),
        "chunks": chunk_text(text),
        "chunk_count": 0,
        "created_at": datetime.utcnow(),
        "metadata": {
            "file_id": file_id,
            "filename": filename,
            "org_id": organization_id,
            "text_length": len(text),
            "source_url": url,
        }
    }
    doc["chunk_count"] = len(doc["chunks"])
    db.documents.insert_one(doc)

    try:
        embeddings = await generate_embeddings(doc["chunks"])
        payloads = []
        for i, chunk in enumerate(doc["chunks"]):
            payloads.append({
                "file_id": file_id,
                "filename": filename,
                "org_id": organization_id,
                "chunk_index": i,
                "chunk_text": chunk[:500],
                "document_type": file_type,
                "processed_at": datetime.utcnow().isoformat()
            })
        await store_embeddings_in_qdrant("documents", embeddings, payloads)
    except Exception as e:
        logger.warning(f"Embedding failed for URL upload: {e}")

    return {
        "file_id": file_id,
        "filename": filename,
        "file_type": file_type,
        "status": "completed",
        "text_preview": text[:500],
        "text_length": len(text),
        "message": f"File from URL '{url}' uploaded and analyzed ({filename}). You can now ask questions about it."
    }


@router.get("/experts")
async def get_experts():
    return {
        "experts": [
            {
                "id": "analyst",
                "name": "Business Analyst",
                "description": "Analyzes business data including goals, tasks, team metrics, documents, and provides strategic insights based on your industry, micro-vertical, and organization data",
                "example_questions": [
                    "What's our overall progress this week?",
                    "Which goals need attention?",
                    "How is team productivity looking?",
                    "What should we prioritize?",
                    "Are we on track for our targets?",
                    "What does my uploaded data tell about my business?",
                    "What KPIs should I focus on for my industry?"
                ]
            }
        ]
    }


@router.get("/files")
async def list_org_files(
    organization_id: Optional[str] = None,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    uploaded_files = list(db.files.find({"organization_id": org_id}).sort("created_at", -1).limit(50))
    processed_docs = list(db.documents.find({"org_id": org_id}).sort("created_at", -1).limit(50))

    seen = set()
    all_files = []

    for f in uploaded_files:
        fid = str(f.get("_id", ""))
        seen.add(fid)
        all_files.append({
            "id": fid,
            "filename": f.get("filename", "unknown"),
            "file_type": f.get("file_type", "unknown"),
            "source": "upload",
            "created_at": f.get("created_at", "").isoformat() if hasattr(f.get("created_at"), "isoformat") else str(f.get("created_at", "")),
        })

    for d in processed_docs:
        fid = d.get("file_id", "")
        if fid not in seen:
            seen.add(fid)
            all_files.append({
                "id": fid,
                "filename": d.get("filename", "unknown"),
                "file_type": d.get("file_type", "unknown"),
                "source": "chat-upload",
                "text_length": d.get("text_length", 0),
                "created_at": d.get("created_at", "").isoformat() if hasattr(d.get("created_at"), "isoformat") else str(d.get("created_at", "")),
            })

    return {"files": all_files, "total": len(all_files)}


@router.get("/files/{file_id}")
async def get_file_detail(
    file_id: str,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    doc = db.documents.find_one({"file_id": file_id})
    if not doc:
        from bson import ObjectId
        f = db.files.find_one({"_id": ObjectId(file_id) if ObjectId.is_valid(file_id) else file_id})
        if f:
            return {"file": {"id": file_id, "filename": f.get("filename"), "file_type": f.get("file_type"), "source": "upload"}}
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "file": {
            "id": doc.get("file_id"),
            "filename": doc.get("filename"),
            "file_type": doc.get("file_type"),
            "source": "chat-upload" if doc.get("user_id") else "processed",
            "text_length": doc.get("text_length"),
            "text_preview": doc.get("text", "")[:2000],
            "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at"), "isoformat") else str(doc.get("created_at", "")),
        }
    }


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    organization_id: Optional[str] = None,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    doc = db.documents.find_one({"file_id": file_id})
    if doc:
        file_path = doc.get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        db.documents.delete_one({"file_id": file_id})
        return {"success": True, "message": f"File '{doc.get('filename', 'unknown')}' deleted"}

    from bson import ObjectId
    f = db.files.find_one({"_id": ObjectId(file_id) if ObjectId.is_valid(file_id) else file_id})
    if f:
        file_path = f.get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        db.files.delete_one({"_id": f["_id"]})
        return {"success": True, "message": f"File '{f.get('filename', 'unknown')}' deleted"}

    raise HTTPException(status_code=404, detail="File not found")


class RenameFileRequest(BaseModel):
    filename: str


@router.patch("/files/{file_id}")
async def rename_file(
    file_id: str,
    payload: RenameFileRequest,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    new_name = (payload.filename or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Filename is required")
    if len(new_name) > 255:
        raise HTTPException(status_code=400, detail="Filename too long (max 255 chars)")

    if "/" in new_name or "\\" in new_name or "\x00" in new_name:
        raise HTTPException(status_code=400, detail="Filename contains invalid characters")

    doc = db.documents.find_one({"file_id": file_id})
    if doc:
        db.documents.update_one(
            {"file_id": file_id},
            {"$set": {"filename": new_name, "metadata.filename": new_name}}
        )
        return {"success": True, "file_id": file_id, "filename": new_name}

    from bson import ObjectId
    f = db.files.find_one({"_id": ObjectId(file_id) if ObjectId.is_valid(file_id) else file_id})
    if f:
        db.files.update_one(
            {"_id": f["_id"]},
            {"$set": {"filename": new_name}}
        )
        return {"success": True, "file_id": file_id, "filename": new_name}

    raise HTTPException(status_code=404, detail="File not found")


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: str,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    doc = db.documents.find_one({"file_id": file_id})
    if doc and doc.get("file_path") and os.path.exists(doc["file_path"]):
        return FileResponse(
            doc["file_path"],
            filename=doc["filename"],
            media_type="application/octet-stream"
        )

    from bson import ObjectId
    f = db.files.find_one({"_id": ObjectId(file_id) if ObjectId.is_valid(file_id) else file_id})
    if f and f.get("file_path") and os.path.exists(f["file_path"]):
        return FileResponse(
            f["file_path"],
            filename=f["filename"],
            media_type="application/octet-stream"
        )

    if doc and doc.get("text"):
        content = doc.get("text", "")[:100000]
        filename = doc.get("filename", "download.txt")
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={filename}.txt"}
        )

    raise HTTPException(status_code=404, detail="File not found or not downloadable")


@router.get("/history")
async def get_chat_history(
    organization_id: Optional[str] = None,
    limit: int = 20,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    history = list(db.executive_chat_history.find(
        {"organization_id": org_id}
    ).sort("created_at", -1).limit(limit))

    for item in history:
        item["_id"] = str(item["_id"])

    return {"history": history}


@router.post("/history")
async def save_chat_message(
    message: Message,
    organization_id: Optional[str] = None,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    message_doc = {
        "organization_id": org_id,
        "user_id": user_id,
        "role": message.role,
        "content": message.content,
        "created_at": datetime.utcnow()
    }

    result = db.executive_chat_history.insert_one(message_doc)
    message_doc["_id"] = str(result.inserted_id)

    return {"message": message_doc}
