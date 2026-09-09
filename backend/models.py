from pydantic import BaseModel
from typing import Optional

class UserLogin(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = 'member'

class LeadCreate(BaseModel):
    name: str
    business_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: str = 'manual'
    priority: str = 'medium'
    deal_value: Optional[float] = None
    assigned_to: Optional[str] = None

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None
    deal_value: Optional[float] = None
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None

class DealCreate(BaseModel):
    lead_id: Optional[str] = None
    title: str
    value: Optional[float] = None
    stage: str = 'discovery'
    assigned_to: Optional[str] = None
    expected_close: Optional[str] = None
    notes: Optional[str] = None

class DealUpdate(BaseModel):
    title: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None
    assigned_to: Optional[str] = None
    expected_close: Optional[str] = None
    notes: Optional[str] = None

class CallLogCreate(BaseModel):
    outcome: str
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None

class NoteCreate(BaseModel):
    content: str
