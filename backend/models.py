"""
Data models and schemas for COS Theta Business Operating System.
Covers Zero7 Consultancy, FILTR Coffee, Team (The Guys), Tasks, Transactions, Documents, and AI.
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
from datetime import datetime


# --- Enums / Literal Types ---
BusinessType = Literal["all", "filtr_coffee", "zero7_consultancy"]
UserRole = Literal["founder", "operations_manager", "lead_consultant", "barista_staff", "viewer"]
LeadStatus = Literal[
    "not_contacted",
    "called_no_answer",
    "followup_scheduled",
    "pitch_completed",
    "proposal_sent",
    "won",
    "lost"
]
PriorityLevel = Literal["low", "medium", "high", "urgent"]
TaskStatus = Literal["todo", "in_progress", "in_review", "done"]
OrderType = Literal["dine_in", "takeaway", "delivery"]
PaymentMethod = Literal["upi_qr", "cash", "card", "bank_transfer"]
TransactionType = Literal["income", "expense"]
StockUnit = Literal["kg", "liters", "units", "packs", "bottles", "boxes"]


# --- User & Team ("The Guys") Models ---
class UserBase(BaseModel):
    name: str
    username: str
    email: str
    role: UserRole = "lead_consultant"
    assigned_business: BusinessType = "all"
    phone: Optional[str] = None
    avatar_initials: Optional[str] = None
    status: str = "active"  # active, on_leave, inactive


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[UserRole] = None
    assigned_business: Optional[BusinessType] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    status: Optional[str] = None


class UserOut(UserBase):
    id: str
    created_at: str


class LoginRequest(BaseModel):
    username: str
    password: str


# --- Call Log & Lead Models (Zero7 Consultancy) ---
class CallLog(BaseModel):
    id: str
    lead_id: str
    caller_id: str
    caller_name: str
    called_at: str
    outcome: str
    notes: str
    next_followup_date: Optional[str] = None


class CallLogCreate(BaseModel):
    outcome: str
    notes: str
    next_followup_date: Optional[str] = None


class LeadBase(BaseModel):
    company_name: str
    contact_person: str
    email: Optional[str] = None
    phone: str
    status: LeadStatus = "not_contacted"
    source: str = "Outreach"
    estimated_value: float = 0.0
    sector: str = "Technology"
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    last_contacted_at: Optional[str] = None
    next_followup_date: Optional[str] = None
    google_sheet_row_id: Optional[str] = None


class LeadCreate(LeadBase):
    pass


class LeadUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[LeadStatus] = None
    source: Optional[str] = None
    estimated_value: Optional[float] = None
    sector: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    next_followup_date: Optional[str] = None


class LeadOut(LeadBase):
    id: str
    created_at: str
    updated_at: str
    call_logs: List[CallLog] = []


# --- Client & Project Deliverables Models (Zero7 Consultancy) ---
class Deliverable(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    due_date: str
    status: Literal["pending", "in_progress", "completed", "delayed"] = "pending"
    assigned_to: Optional[str] = None


class ClientBase(BaseModel):
    company_name: str
    contact_person: str
    email: str
    phone: str
    tier: str = "Standard Retainer"
    monthly_value: float = 0.0
    contract_start_date: str
    contract_end_date: Optional[str] = None
    status: str = "active"  # active, paused, churned
    lead_id: Optional[str] = None
    notes: Optional[str] = None


class ClientCreate(ClientBase):
    initial_deliverables: Optional[List[Dict[str, Any]]] = []


class ClientOut(ClientBase):
    id: str
    created_at: str
    deliverables: List[Deliverable] = []


# --- Orders & Menu POS (FILTR Coffee) ---
class MenuItem(BaseModel):
    id: str
    name: str
    category: str  # Espresso, Brew, Cold, Pastry, Sandwich
    price: float
    description: Optional[str] = None
    stock_ingredient_map: Dict[str, float] = {}  # {inventory_item_id: quantity_deducted}
    is_available: bool = True


class OrderItem(BaseModel):
    menu_item_id: str
    name: str
    price: float
    quantity: int
    customization: Optional[str] = None


class OrderBase(BaseModel):
    customer_name: Optional[str] = "Walk-in Guest"
    order_type: OrderType = "dine_in"
    items: List[OrderItem]
    subtotal: float
    discount: float = 0.0
    total: float
    payment_method: PaymentMethod = "upi_qr"
    status: Literal["completed", "pending", "cancelled"] = "completed"
    notes: Optional[str] = None


class OrderCreate(OrderBase):
    pass


class OrderOut(OrderBase):
    id: str
    order_number: str
    cashier_id: str
    cashier_name: str
    created_at: str


# --- Inventory & Stock (FILTR Coffee) ---
class InventoryItemBase(BaseModel):
    name: str
    category: str  # Beans, Dairy, Syrups, Packaging, Snacks
    current_stock: float
    minimum_threshold: float
    unit: StockUnit
    cost_per_unit: float
    supplier_name: Optional[str] = None
    supplier_phone: Optional[str] = None
    reorder_quantity: float = 10.0


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    current_stock: Optional[float] = None
    minimum_threshold: Optional[float] = None
    unit: Optional[StockUnit] = None
    cost_per_unit: Optional[float] = None
    supplier_name: Optional[str] = None
    supplier_phone: Optional[str] = None
    reorder_quantity: Optional[float] = None


class InventoryItemOut(InventoryItemBase):
    id: str
    is_low_stock: bool = False
    last_restocked_at: Optional[str] = None
    updated_at: str


class StockAdjustment(BaseModel):
    id: str
    inventory_item_id: str
    item_name: str
    adjustment_type: Literal["restock", "usage", "spoilage", "manual_correction"]
    quantity_changed: float
    reason: str
    adjusted_by: str
    created_at: str


# --- Transactions & Ledger ---
class TransactionBase(BaseModel):
    business: BusinessType
    type: TransactionType
    category: str  # Sales, Client Retainer, Raw Materials, Utilities, Software, Wages
    amount: float
    description: str
    payment_method: PaymentMethod
    reference_id: Optional[str] = None  # order_id or client_id


class TransactionCreate(TransactionBase):
    pass


class TransactionOut(TransactionBase):
    id: str
    created_at: str


# --- Tasks & To-Do Hub ---
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    business: BusinessType = "all"
    priority: PriorityLevel = "medium"
    status: TaskStatus = "todo"
    due_date: Optional[str] = None
    assigned_to_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    google_task_id: Optional[str] = None
    tags: List[str] = []


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    business: Optional[BusinessType] = None
    priority: Optional[PriorityLevel] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[str] = None
    assigned_to_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    tags: Optional[List[str]] = None


class TaskOut(TaskBase):
    id: str
    created_by: str
    created_at: str
    updated_at: str


# --- Documents & Drive Vault ---
class DocumentItem(BaseModel):
    id: str
    title: str
    category: str  # Contracts, Invoices, SOPs, Pitch Decks, Compliance
    business: BusinessType
    file_type: str  # pdf, sheet, doc, folder, link
    drive_file_id: Optional[str] = None
    drive_url: Optional[str] = None
    size_label: Optional[str] = "1.2 MB"
    uploaded_by: str
    created_at: str


# --- AI Command Center ---
class AIQueryRequest(BaseModel):
    query: str
    business_context: BusinessType = "all"
    session_id: Optional[str] = "default"


class AIQueryResponse(BaseModel):
    answer: str
    suggested_actions: List[Dict[str, str]] = []
    insights: Optional[Dict[str, Any]] = None
    model_used: str = "COS-Theta-Intelligence"


# --- Settings ---
class GoogleSettings(BaseModel):
    service_account_configured: bool = False
    service_account_email: Optional[str] = None
    sheets_id_zero7_leads: Optional[str] = None
    tasks_sync_enabled: bool = True
    drive_root_folder_id: Optional[str] = None
    last_sync_timestamp: Optional[str] = None


class SystemSettingsUpdate(BaseModel):
    google_service_account_json: Optional[str] = None
    sheets_id_zero7_leads: Optional[str] = None
    drive_root_folder_id: Optional[str] = None
    custom_ai_endpoint: Optional[str] = None
    custom_ai_api_key: Optional[str] = None
