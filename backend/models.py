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

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None

class LeadCreate(BaseModel):
    name: str
    business_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    temperature: Optional[str] = 'warm'
    call_stage: Optional[str] = 'first_call'
    source: str = 'manual'
    priority: str = 'medium'
    deal_value: Optional[float] = None
    assigned_to: Optional[str] = None
    last_update_notes: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None
    channel_data: Optional[dict] = None

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    temperature: Optional[str] = None
    call_stage: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None
    deal_value: Optional[float] = None
    last_update_notes: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None
    channel_data: Optional[dict] = None

class DealCreate(BaseModel):
    lead_id: Optional[str] = None
    title: str
    value: Optional[float] = None
    stage: str = 'discovery'
    city: Optional[str] = None
    assigned_to: Optional[str] = None
    expected_close: Optional[str] = None
    notes: Optional[str] = None

class DealUpdate(BaseModel):
    title: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None
    city: Optional[str] = None
    assigned_to: Optional[str] = None
    expected_close: Optional[str] = None
    notes: Optional[str] = None

class CallLogCreate(BaseModel):
    outcome: str
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None

class NoteCreate(BaseModel):
    content: str
