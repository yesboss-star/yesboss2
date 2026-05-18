from fastapi import APIRouter, HTTPException
from ..core.database import connect_mongodb, get_database
from ..core.qdrant import connect_qdrant, create_collection
from ..core.supabase_client import connect_supabase

router = APIRouter()

@router.get("/health")
async def health_check():
    status = {
        "status": "ok",
        "services": {}
    }
    
    try:
        db = connect_mongodb()
        if db is not None:
            db.command("ping")
            status["services"]["mongodb"] = "connected"
        else:
            status["services"]["mongodb"] = "not configured"
    except Exception as e:
        status["services"]["mongodb"] = f"error: {str(e)}"
    
    try:
        qdrant = connect_qdrant()
        if qdrant is not None:
            status["services"]["qdrant"] = "connected"
        else:
            status["services"]["qdrant"] = "not configured"
    except Exception as e:
        status["services"]["qdrant"] = f"error: {str(e)}"
    
    try:
        supabase = connect_supabase()
        if supabase is not None:
            status["services"]["supabase"] = "connected"
        else:
            status["services"]["supabase"] = "not configured"
    except Exception as e:
        status["services"]["supabase"] = f"error: {str(e)}"
    
    return status

@router.post("/init-collections")
async def init_collections():
    collections = [
        "company_intelligence",
        "employee_profiles",
        "conversations",
        "workflows",
        "goals",
        "tasks"
    ]
    
    results = []
    for collection in collections:
        try:
            create_collection(collection)
            results.append({"collection": collection, "status": "ready"})
        except Exception as e:
            results.append({"collection": collection, "status": f"error: {str(e)}"})
    
    return {"collections": results}