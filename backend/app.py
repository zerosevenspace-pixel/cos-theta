"""
COS Theta Enterprise Business Operating System - FastAPI Application.
Serves full RESTful API for Zero7 Consultancy & FILTR Coffee, and mounts the UI.
"""

import os
import json
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Depends, Query, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.database import DBRepository, init_db
from backend.seed_data import seed_all_data
from backend.models import (
    UserCreate, UserUpdate, UserOut, LoginRequest,
    LeadCreate, LeadUpdate, LeadOut, CallLogCreate,
    ClientCreate, ClientOut,
    OrderCreate, OrderOut,
    InventoryItemCreate, InventoryItemUpdate, InventoryItemOut,
    TransactionCreate, TransactionOut,
    TaskCreate, TaskUpdate, TaskOut,
    DocumentItem, AIQueryRequest, AIQueryResponse,
    SystemSettingsUpdate
)
from backend.auth import AuthService
from backend.integrations.google_sheets import GoogleSheetsService
from backend.integrations.google_tasks import GoogleTasksService
from backend.integrations.google_drive import GoogleDriveService
from backend.integrations.ai_service import AIService

# Initialize DB and Seed data
seed_all_data()

app = FastAPI(
    title="COS Theta Business Operating System",
    description="Internal Business OS for Zero7 Consultancy & FILTR Coffee",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- AUTHENTICATION -----------------

@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = AuthService.authenticate(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    # Return user data without password hash
    u = dict(user)
    u.pop("password_hash", None)
    return {"success": True, "user": u}


@app.get("/api/auth/me")
def get_current_user(user_id: str = "usr_admin"):
    user = DBRepository.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    u = dict(user)
    u.pop("password_hash", None)
    return u


# ----------------- EXECUTIVE STATS / KPI -----------------

@app.get("/api/stats")
def get_stats(business: str = Query("all", pattern="^(all|filtr_coffee|zero7_consultancy)$")):
    return DBRepository.get_executive_stats(business)


# ----------------- TEAM ("THE GUYS") / RBAC -----------------

@app.get("/api/users")
def list_users(business: Optional[str] = None):
    users = DBRepository.list_users(business)
    for u in users:
        u.pop("password_hash", None)
    return users


@app.post("/api/users")
def create_user(req: UserCreate):
    existing = DBRepository.get_user_by_username(req.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    user = DBRepository.create_user(req.model_dump())
    user.pop("password_hash", None)
    return user


@app.put("/api/users/{user_id}")
def update_user(user_id: str, req: UserUpdate):
    user = DBRepository.update_user(user_id, req.model_dump(exclude_unset=True))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.pop("password_hash", None)
    return user


@app.delete("/api/users/{user_id}")
def delete_user(user_id: str):
    success = DBRepository.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "message": "User deleted"}


# ----------------- ZERO7 LEADS & CRM -----------------

@app.get("/api/leads")
def list_leads(status: Optional[str] = None, search: Optional[str] = None):
    return DBRepository.list_leads(status=status, search=search)


@app.get("/api/leads/{lead_id}")
def get_lead(lead_id: str):
    lead = DBRepository.get_lead_by_id(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@app.post("/api/leads")
def create_lead(req: LeadCreate):
    return DBRepository.create_lead(req.model_dump())


@app.put("/api/leads/{lead_id}")
def update_lead(lead_id: str, req: LeadUpdate):
    lead = DBRepository.update_lead(lead_id, req.model_dump(exclude_unset=True))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: str):
    success = DBRepository.delete_lead(lead_id)
    if not success:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"success": True, "message": "Lead deleted"}


@app.post("/api/leads/{lead_id}/call")
def add_call_log(lead_id: str, req: CallLogCreate, caller_id: str = "usr_shaan", caller_name: str = "Shaan Verma"):
    lead = DBRepository.get_lead_by_id(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    log = DBRepository.add_call_log(
        lead_id=lead_id,
        caller_id=caller_id,
        caller_name=caller_name,
        outcome=req.outcome,
        notes=req.notes,
        next_followup=req.next_followup_date
    )
    return log


@app.post("/api/leads/{lead_id}/convert")
def convert_lead(lead_id: str, tier: str = "Standard Retainer", monthly_value: float = 0.0):
    try:
        client = DBRepository.convert_lead_to_client(lead_id, tier, monthly_value)
        return {"success": True, "client": client}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ----------------- ZERO7 CLIENTS & DELIVERABLES -----------------

@app.get("/api/clients")
def list_clients(search: Optional[str] = None):
    return DBRepository.list_clients(search=search)


@app.get("/api/clients/{client_id}")
def get_client(client_id: str):
    client = DBRepository.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@app.post("/api/clients")
def create_client(req: ClientCreate):
    return DBRepository.create_client(req.model_dump())


@app.post("/api/clients/{client_id}/deliverables")
def add_deliverable(client_id: str, title: str, description: Optional[str] = None, due_date: str = "2026-08-30", assigned_to: Optional[str] = None):
    client = DBRepository.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return DBRepository.add_deliverable(client_id, title, description, due_date, assigned_to)


@app.put("/api/deliverables/{deliv_id}/status")
def update_deliverable_status(deliv_id: str, status: str = Query(..., pattern="^(pending|in_progress|completed|delayed)$")):
    res = DBRepository.update_deliverable_status(deliv_id, status)
    if not res:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    return res


# ----------------- FILTR COFFEE MENU & ORDERS (POS) -----------------

@app.get("/api/menu")
def list_menu():
    return DBRepository.list_menu_items()


@app.get("/api/orders")
def list_orders(limit: int = 50):
    return DBRepository.list_orders(limit=limit)


@app.post("/api/orders")
def create_order(req: OrderCreate, cashier_id: str = "usr_aarav", cashier_name: str = "Aarav Patel"):
    return DBRepository.create_order(req.model_dump(), cashier_id, cashier_name)


# ----------------- FILTR COFFEE INVENTORY & STOCK -----------------

@app.get("/api/inventory")
def list_inventory():
    return DBRepository.list_inventory()


@app.get("/api/inventory/adjustments")
def list_stock_adjustments(limit: int = 50):
    return DBRepository.list_stock_adjustments(limit=limit)


@app.post("/api/inventory/{item_id}/adjust")
def adjust_stock(
    item_id: str,
    adjustment_type: str = Query(..., pattern="^(restock|usage|spoilage|manual_correction)$"),
    quantity: float = Query(...),
    reason: str = Query("Manual adjustment"),
    adjusted_by: str = Query("Rahul Sharma")
):
    try:
        return DBRepository.adjust_stock(item_id, adjustment_type, quantity, reason, adjusted_by)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ----------------- TRANSACTIONS & CASH FLOW -----------------

@app.get("/api/transactions")
def list_transactions(business: Optional[str] = None, limit: int = 100):
    return DBRepository.list_transactions(business=business, limit=limit)


@app.post("/api/transactions")
def create_transaction(req: TransactionCreate):
    return DBRepository.create_transaction(req.model_dump())


# ----------------- TASKS & GOOGLE TO-DO -----------------

@app.get("/api/tasks")
def list_tasks(business: Optional[str] = None, status: Optional[str] = None, assigned_to_id: Optional[str] = None):
    return DBRepository.list_tasks(business=business, status=status, assigned_to_id=assigned_to_id)


@app.post("/api/tasks")
def create_task(req: TaskCreate, created_by: str = "Admin"):
    return DBRepository.create_task(req.model_dump(), created_by=created_by)


@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, req: TaskUpdate):
    t = DBRepository.update_task(task_id, req.model_dump(exclude_unset=True))
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return t


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    success = DBRepository.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"success": True, "message": "Task deleted"}


# ----------------- DOCUMENTS & DRIVE -----------------

@app.get("/api/documents")
def list_documents(business: Optional[str] = None):
    return DBRepository.list_documents(business=business)


@app.post("/api/documents")
def create_document(req: Dict[str, Any], uploaded_by: str = "Admin"):
    return DBRepository.create_document(req, uploaded_by=uploaded_by)


# ----------------- INTEGRATIONS (GOOGLE SHEETS, TASKS, DRIVE) -----------------

@app.get("/api/integrations/sheets/status")
def get_sheets_status():
    return GoogleSheetsService.get_sync_status()


@app.get("/api/integrations/sheets/preview")
def get_sheets_preview():
    return GoogleSheetsService.preview_sheet_data()


@app.post("/api/integrations/sheets/sync")
def sync_sheets():
    return GoogleSheetsService.trigger_sync()


@app.get("/api/integrations/tasks/status")
def get_tasks_status():
    return GoogleTasksService.get_sync_status()


@app.post("/api/integrations/tasks/sync")
def sync_tasks():
    return GoogleTasksService.sync_tasks()


@app.get("/api/integrations/drive/status")
def get_drive_status():
    return GoogleDriveService.get_drive_status()


# ----------------- DEVELOPER MODE & AUTONOMOUS AIDER PIPELINE -----------------

@app.post("/api/developer/dispatch-prompt")
async def dispatch_autonomous_prompt(req: Dict[str, Any]):
    prompt = req.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    gh_token = os.getenv("GITHUB_TOKEN", "")
    repo = "zerosevenspace-pixel/cos-theta"

    url = f"https://api.github.com/repos/{repo}/dispatches"
    headers = {
        "Authorization": f"Bearer {gh_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    payload = {
        "event_type": "autonomous_aider_prompt",
        "client_payload": {
            "prompt": prompt,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code in [204, 200, 201]:
            return {
                "success": True,
                "message": "Prompt dispatched to Autonomous Aider pipeline on GitHub Actions!",
                "repo": repo,
                "workflow_url": f"https://github.com/{repo}/actions",
                "dispatched_at": datetime.now(timezone.utc).isoformat()
            }
        else:
            return {
                "success": False,
                "message": f"GitHub API responded with status {resp.status_code}: {resp.text}",
                "simulated": True
            }


@app.get("/api/developer/status")
async def get_developer_pipeline_status():
    gh_token = os.getenv("GITHUB_TOKEN", "")
    repo = "zerosevenspace-pixel/cos-theta"
    url = f"https://api.github.com/repos/{repo}/actions/runs?per_page=5"
    headers = {
        "Authorization": f"Bearer {gh_token}",
        "Accept": "application/vnd.github+json"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                runs = []
                for r in data.get("workflow_runs", []):
                    runs.append({
                        "id": r.get("id"),
                        "name": r.get("name"),
                        "status": r.get("status"),
                        "conclusion": r.get("conclusion"),
                        "event": r.get("event"),
                        "html_url": r.get("html_url"),
                        "created_at": r.get("created_at"),
                        "head_commit": r.get("head_commit", {}).get("message", "Auto commit")
                    })
                return {"success": True, "runs": runs}
    except Exception as e:
        pass
    return {"success": True, "runs": []}


# ----------------- AI COMMAND CENTER -----------------

@app.post("/api/ai/query", response_model=AIQueryResponse)
async def query_ai(req: AIQueryRequest):
    return await AIService.process_query(req.query, req.business_context)


# ----------------- SETTINGS & BACKUP -----------------

@app.get("/api/settings")
def get_settings():
    return {
        "google_service_account_configured": DBRepository.get_setting("google_service_account_configured") == "true",
        "google_service_account_email": DBRepository.get_setting("google_service_account_email"),
        "sheets_id_zero7_leads": DBRepository.get_setting("sheets_id_zero7_leads"),
        "drive_root_folder_id": DBRepository.get_setting("drive_root_folder_id"),
        "tasks_sync_enabled": DBRepository.get_setting("tasks_sync_enabled") == "true",
        "custom_ai_endpoint": DBRepository.get_setting("custom_ai_endpoint"),
        "custom_ai_api_key": DBRepository.get_setting("custom_ai_api_key"),
        "last_sync": DBRepository.get_setting("last_google_sync")
    }


@app.put("/api/settings")
def update_settings(req: SystemSettingsUpdate):
    if req.sheets_id_zero7_leads is not None:
        DBRepository.set_setting("sheets_id_zero7_leads", req.sheets_id_zero7_leads)
    if req.drive_root_folder_id is not None:
        DBRepository.set_setting("drive_root_folder_id", req.drive_root_folder_id)
    if req.custom_ai_endpoint is not None:
        DBRepository.set_setting("custom_ai_endpoint", req.custom_ai_endpoint)
    if req.custom_ai_api_key is not None:
        DBRepository.set_setting("custom_ai_api_key", req.custom_ai_api_key)
    if req.google_service_account_json:
        try:
            sa_data = json.loads(req.google_service_account_json)
            if "client_email" in sa_data:
                DBRepository.set_setting("google_service_account_email", sa_data["client_email"])
                DBRepository.set_setting("google_service_account_configured", "true")
        except Exception:
            pass
    return {"success": True, "message": "Settings updated"}


@app.get("/api/database/export")
def export_db():
    return {
        "users": DBRepository.list_users(),
        "leads": DBRepository.list_leads(),
        "clients": DBRepository.list_clients(),
        "orders": DBRepository.list_orders(limit=200),
        "inventory": DBRepository.list_inventory(),
        "transactions": DBRepository.list_transactions(limit=200),
        "tasks": DBRepository.list_tasks(),
        "documents": DBRepository.list_documents(),
        "exported_at": datetime.now(timezone.utc).isoformat()
    }


# ----------------- STATIC ASSET MOUNT & SPA FALLBACK -----------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/variables.css")
def serve_variables_css():
    path = os.path.join(BASE_DIR, "variables.css")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/css")
    return ""


@app.get("/theme.css")
def serve_theme_css():
    path = os.path.join(BASE_DIR, "theme.css")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/css")
    return ""


@app.get("/tokens.json")
def serve_tokens_json():
    path = os.path.join(BASE_DIR, "tokens.json")
    if os.path.exists(path):
        return FileResponse(path, media_type="application/json")
    return {}


@app.get("/")
def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"status": "COS Theta Backend Running. Static UI files compiling..."}
