import os
from datetime import datetime

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..core.database import get_database
from ..dependencies.auth import get_current_user
from ..dependencies.scope import is_org_member, is_org_owner, resolve_user_org_ids

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


def _self_ids(current_user) -> list[str]:
    uid = getattr(current_user, "id", None) or getattr(current_user, "uid", None)
    email = (getattr(current_user, "email", "") or "").strip().lower()
    return [x for x in (uid, email) if x]


async def _files_can_access(db, current_user, file_doc) -> bool:
    """Owner of the file's org, or the file's creator, may access it."""
    org_id = file_doc.get("organization_id") or ""
    if org_id and await is_org_owner(db, org_id, current_user):
        return True
    ids = _self_ids(current_user)
    owner = file_doc.get("created_by") or file_doc.get("user_id") or ""
    owner_str = owner.strip().lower() if isinstance(owner, str) else str(owner or "")
    return bool(owner_str) and owner_str in [i.lower() if isinstance(i, str) else i for i in ids]


@router.post("/process")
async def process_upload(
    organization_id: str,
    file_type: str,
    file: UploadFile = File(...),
    user_id: str | None = None,
    current_user = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    if not await is_org_member(db, organization_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

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
        "created_by": getattr(current_user, "id", None) or user_id or "",
        "status": "uploaded",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = db.files.insert_one(file_doc)
    file_doc["_id"] = str(result.inserted_id)
    file_doc.pop("file_path", None)

    return {"file": file_doc, "message": "File uploaded successfully"}

@router.get("")
async def list_files(
    organization_id: str | None = None,
    created_by: str | None = None,
    current_user = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_ids = [str(o) for o in await resolve_user_org_ids(db, current_user)]
    if not org_ids:
        return {"files": []}

    if organization_id:
        if str(organization_id) not in org_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        org_scope = [str(organization_id)]
    else:
        org_scope = org_ids

    query: dict = {"organization_id": {"$in": org_scope}}

    owner_orgs = set()
    for oid in org_scope:
        if await is_org_owner(db, oid, current_user):
            owner_orgs.add(oid)
    if owner_orgs != set(org_scope):
        ids = _self_ids(current_user)
        query["$or"] = [{"created_by": {"$in": ids}}, {"user_id": {"$in": ids}}]

    if created_by:
        query["created_by"] = created_by

    files = list(db.files.find(query))

    for f in files:
        f["_id"] = str(f["_id"])
        f.pop("file_path", None)

    return {"files": files}

@router.get("/{file_id}")
async def get_file(
    file_id: str,
    created_by: str | None = None,
    current_user = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    query: dict = {"_id": ObjectId(file_id)}
    if created_by:
        query["created_by"] = created_by
    file_doc = db.files.find_one(query)

    if not file_doc or not await _files_can_access(db, current_user, file_doc):
        raise HTTPException(status_code=404, detail="File not found")

    file_doc["_id"] = str(file_doc["_id"])
    file_doc.pop("file_path", None)
    return {"file": file_doc}

@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    created_by: str | None = None,
    current_user = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    query: dict = {"_id": ObjectId(file_id)}
    if created_by:
        query["created_by"] = created_by
    file_doc = db.files.find_one(query)

    if not file_doc or not await _files_can_access(db, current_user, file_doc):
        raise HTTPException(status_code=404, detail="File not found")

    if file_doc and os.path.exists(file_doc.get("file_path", "")):
        os.remove(file_doc["file_path"])

    db.files.delete_one({"_id": ObjectId(file_id)})

    return {"success": True, "message": "File deleted"}
