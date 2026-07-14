from datetime import datetime

from pydantic import BaseModel


class OrganizationCreate(BaseModel):
    name: str
    domain: str | None = None
    industry: str | None = None
    size: str | None = None
    micro_vertical: str | None = None

class OrganizationResponse(BaseModel):
    id: str
    name: str
    domain: str | None
    industry: str | None
    size: str | None
    micro_vertical: str | None = None
    created_at: datetime

class EmployeeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None
    role: str
    department: str | None
    manager_id: str | None
    organization_id: str
    created_at: datetime

class EmployeeCreate(BaseModel):
    email: str
    full_name: str
    phone: str | None = None
    role: str
    department: str | None = None
    manager_id: str | None = None

class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    department: str | None = None
    manager_id: str | None = None
