from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional
from ..core.file_processor import process_file, search_documents, ALLOWED_EXTENSIONS

router = APIRouter()


@router.post("/process")
async def process_uploaded_file(
    file: UploadFile = File(...),
    org_id: str = Form(...),
    user_id: str = Form(...),
    provider: str = Form("openai")
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    ext = "." + file.filename.lower().split(".")[-1]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    try:
        contents = await file.read()
        
        if len(contents) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 25MB)")
        
        result = await process_file(
            file_bytes=contents,
            filename=file.filename,
            org_id=org_id,
            user_id=user_id,
            provider=provider
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
    provider: str = Form("openai")
):
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files at once")
    
    results = []
    for file in files:
        try:
            ext = "." + file.filename.lower().split(".")[-1]
            if ext not in ALLOWED_EXTENSIONS:
                results.append({"filename": file.filename, "status": "failed", "error": "Unsupported file type"})
                continue
            
            contents = await file.read()
            result = await process_file(contents, file.filename, org_id, user_id, provider)
            results.append(result)
        except Exception as e:
            results.append({"filename": file.filename, "status": "failed", "error": str(e)})
    
    return {"results": results, "total": len(files), "completed": sum(1 for r in results if r.get("status") == "completed")}


@router.get("/search")
async def search_org_documents(
    org_id: str,
    query: str,
    limit: int = 5,
    provider: str = "openai"
):
    if not org_id or not query:
        raise HTTPException(status_code=400, detail="org_id and query are required")
    
    results = await search_documents(org_id, query, limit, provider)
    return {"results": results, "count": len(results)}


@router.get("/document-types")
async def get_document_types(org_id: str):
    from ..core.qdrant import get_qdrant_client
    
    try:
        client = get_qdrant_client()
        
        from qdrant_client.models import Filter, FieldCondition, Match
        results = client.scroll(
            collection_name="documents",
            scroll_filter=Filter(
                must=[FieldCondition(key="org_id", match=Match(value=org_id))]
            ),
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