from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class OrganizationCreate(BaseModel):
    name: str
    domain: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    micro_vertical: Optional[str] = None

class OrganizationResponse(BaseModel):
    id: str
    name: str
    domain: Optional[str]
    industry: Optional[str]
    size: Optional[str]
    micro_vertical: Optional[str] = None
    created_at: datetime

class EmployeeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str]
    role: str
    department: Optional[str]
    manager_id: Optional[str]
    organization_id: str
    created_at: datetime

class EmployeeCreate(BaseModel):
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None
    manager_id: Optional[str] = None

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    manager_id: Optional[str] = None