from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os
import aiofiles
from ..core.database import get_database

router = APIRouter()

class FileProcessRequest(BaseModel):
    organization_id: str
    file_type: str  # "pdf", "excel", "image"

class FileResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    organization_id: str
    status: str
    created_at: datetime

@router.post("/process")
async def process_upload(
    organization_id: str,
    file_type: str,
    file: UploadFile = File(...)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    if file_type not in ["pdf", "excel", "image"]:
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    upload_dir = f"uploads/{organization_id}"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = f"{upload_dir}/{file.filename}"
    
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    file_doc = {
        "filename": file.filename,
        "file_path": file_path,
        "file_type": file_type,
        "organization_id": organization_id,
        "status": "uploaded",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = db.files.insert_one(file_doc)
    file_doc["_id"] = str(result.inserted_id)
    
    return {"file": file_doc, "message": "File uploaded successfully"}

@router.get("")
async def list_files(organization_id: Optional[str] = None):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    query = {}
    if organization_id:
        query["organization_id"] = organization_id
    
    files = list(db.files.find(query))
    
    for f in files:
        f["_id"] = str(f["_id"])
    
    return {"files": files}

@router.get("/{file_id}")
async def get_file(file_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    file_doc = db.files.find_one({"_id": ObjectId(file_id)})
    
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_doc["_id"] = str(file_doc["_id"])
    return {"file": file_doc}

@router.delete("/{file_id}")
async def delete_file(file_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    file_doc = db.files.find_one({"_id": ObjectId(file_id)})
    
    if file_doc and os.path.exists(file_doc.get("file_path", "")):
        os.remove(file_doc["file_path"])
    
    db.files.delete_one({"_id": ObjectId(file_id)})
    
    return {"success": True, "message": "File deleted"}