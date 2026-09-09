from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Optional
import os

from backend.database import Repository, init_db
from backend.models import UserLogin, UserCreate, LeadCreate, LeadUpdate, DealCreate, DealUpdate, CallLogCreate, NoteCreate
from backend.auth import hash_password, verify_password, create_token, get_current_user
from backend.seed_data import seed_if_empty

app = FastAPI(title="Zero7 CRM Backend")

init_db()
seed_if_empty()

def require_auth(user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user

def require_admin(user: dict = Depends(require_auth)):
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user

@app.post("/api/auth/login")
def login(data: UserLogin):
    user = Repository.get_user_by_email(data.email)
    if not user or not verify_password(data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user['id'], user['role'])
    user_copy = dict(user)
    del user_copy['password_hash']
    return {"token": token, "access_token": token, "user": user_copy}

@app.post("/api/auth/token")
def login_token(data: UserLogin):
    return login(data)

@app.get("/api/auth/me")
def me(user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    full_user = Repository.get_user(user['user_id'])
    if not full_user:
        raise HTTPException(status_code=404, detail="User not found")
    user_copy = dict(full_user)
    del user_copy['password_hash']
    return user_copy

@app.get("/api/leads")
def list_leads(status: Optional[str] = None, source: Optional[str] = None, assigned_to: Optional[str] = None, user: dict = Depends(require_auth)):
    filters = {}
    if status: filters['status'] = status
    if source: filters['source'] = source
    
    if user.get('role') == 'member':
        filters['assigned_to'] = user.get('user_id')
    else:
        if assigned_to: filters['assigned_to'] = assigned_to

    return Repository.list_leads(filters)

@app.post("/api/leads")
def create_lead(data: LeadCreate, user: dict = Depends(require_auth)):
    return Repository.create_lead(data.dict(exclude_unset=True))

@app.get("/api/leads/{id}")
def get_lead(id: str, user: dict = Depends(require_auth)):
    lead = Repository.get_lead(id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get('role') == 'member' and lead['assigned_to'] != user.get('user_id'):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    lead_dict = dict(lead)
    lead_dict['activity'] = Repository.get_lead_activity(id)
    return lead_dict

@app.put("/api/leads/{id}")
def update_lead(id: str, data: LeadUpdate, user: dict = Depends(require_auth)):
    lead = Repository.get_lead(id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get('role') == 'member' and lead['assigned_to'] != user.get('user_id'):
        raise HTTPException(status_code=403, detail="Forbidden")
    return Repository.update_lead(id, data.dict(exclude_unset=True))

@app.delete("/api/leads/{id}")
def delete_lead(id: str, user: dict = Depends(require_admin)):
    Repository.delete_lead(id)
    return {"status": "success"}

@app.get("/api/deals")
def list_deals(stage: Optional[str] = None, assigned_to: Optional[str] = None, user: dict = Depends(require_auth)):
    filters = {}
    if stage: filters['stage'] = stage
    if assigned_to: filters['assigned_to'] = assigned_to
    return Repository.list_deals(filters)

@app.post("/api/deals")
def create_deal(data: DealCreate, user: dict = Depends(require_auth)):
    d = data.dict(exclude_unset=True)
    if not d.get('assigned_to'):
        d['assigned_to'] = user.get('user_id')
    return Repository.create_deal(d)

@app.put("/api/deals/{id}")
def update_deal(id: str, data: DealUpdate, user: dict = Depends(require_auth)):
    return Repository.update_deal(id, data.dict(exclude_unset=True))

@app.post("/api/leads/{id}/convert")
def convert_lead(id: str, user: dict = Depends(require_auth)):
    lead = Repository.get_lead(id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    deal_title = f"Deal - {lead.get('business_name') or lead.get('name')}"
    deal = Repository.create_deal({
        "lead_id": id,
        "title": deal_title,
        "value": lead.get('deal_value') or 0.0,
        "stage": "proposal",
        "city": lead.get('city') or "",
        "assigned_to": lead.get('assigned_to') or user.get('user_id'),
        "notes": f"Converted from lead: {lead.get('name')} ({lead.get('email') or 'No email'}) - {lead.get('city') or 'No city'}"
    })
    Repository.update_lead(id, {"status": "proposal"})
    return deal

@app.post("/api/leads/{id}/calls")
def log_call(id: str, data: CallLogCreate, user: dict = Depends(require_auth)):
    d = data.dict(exclude_unset=True)
    d['lead_id'] = id
    d['user_id'] = user.get('user_id')
    return Repository.log_call(d)

@app.post("/api/leads/{id}/notes")
def add_note(id: str, data: NoteCreate, user: dict = Depends(require_auth)):
    d = data.dict(exclude_unset=True)
    d['lead_id'] = id
    d['user_id'] = user.get('user_id')
    return Repository.add_note(d)

@app.post("/api/leads/{id}/activities")
async def add_generic_activity(id: str, request: Request, user: dict = Depends(require_auth)):
    body = await request.json()
    act_type = body.get('activity_type', '').upper()
    notes = body.get('notes', '')
    outcome = body.get('outcome', 'Connected')
    if act_type == 'CALL':
        return Repository.log_call({
            'lead_id': id,
            'user_id': user.get('user_id'),
            'outcome': outcome,
            'notes': notes,
            'duration_minutes': body.get('duration_minutes', 5)
        })
    else:
        return Repository.add_note({
            'lead_id': id,
            'user_id': user.get('user_id'),
            'content': notes
        })

@app.get("/api/leads/{id}/activity")
def get_activity(id: str, user: dict = Depends(require_auth)):
    return Repository.get_lead_activity(id)

@app.get("/api/webhooks/meta-leads")
def verify_meta_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    expected_token = os.getenv("META_VERIFY_TOKEN", "zero7_meta_verify_2026")
    if mode == "subscribe" and token == expected_token:
        return int(challenge) if challenge and challenge.isdigit() else challenge
    return "OK"

@app.post("/api/webhooks/meta-leads")
async def receive_meta_webhook(request: Request):
    payload = await request.json()
    try:
        if "name" in payload:
            lead = Repository.create_lead({
                "name": payload.get("name"),
                "business_name": payload.get("business_name", ""),
                "phone": payload.get("phone", ""),
                "email": payload.get("email", ""),
                "source": "meta_ads",
                "meta_ad_name": payload.get("ad_name", "Meta Lead Ads Campaign"),
                "status": "new",
                "next_action": "Follow-up speed to lead call"
            })
            return {"status": "success", "lead_id": lead["id"]}

        entries = payload.get("entry", [])
        created_count = 0
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                val = change.get("value", {})
                leadgen_id = val.get("leadgen_id")
                form_id = val.get("form_id")
                ad_id = val.get("ad_id")
                if leadgen_id:
                    lead = Repository.create_lead({
                        "name": f"Meta Lead {leadgen_id}",
                        "source": "meta_ads",
                        "meta_form_id": form_id or leadgen_id,
                        "meta_ad_name": f"Ad {ad_id}" if ad_id else "Meta Ad Form",
                        "status": "new",
                        "next_action": "Speed to lead call"
                    })
                    created_count += 1
        return {"status": "success", "created": created_count}
    except Exception as e:
        print("Error processing webhook:", e)
        return {"status": "error", "message": str(e)}

@app.get("/api/integrations/status")
def get_integrations_status(user: dict = Depends(require_auth)):
    webhook_url = "http://68.183.92.215/api/webhooks/meta-leads"
    verify_token = os.getenv("META_VERIFY_TOKEN", "zero7_meta_verify_2026")
    leads = Repository.list_leads()
    meta_count = sum(1 for l in leads if l.get('source') == 'meta_ads')
    scraping_count = sum(1 for l in leads if l.get('source') == 'scraping')
    return {
        "meta_ads": {
            "name": "Meta Ads Lead Webhook",
            "status": "connected",
            "webhook_url": webhook_url,
            "verify_token": verify_token,
            "leads_received": meta_count,
            "event_type": "leadgen"
        },
        "whatsapp": {
            "name": "WhatsApp Direct Connect",
            "status": "connected",
            "protocol": "Click-to-Chat (wa.me)",
            "default_country_code": "+91",
            "message_templates_enabled": True
        },
        "scraping": {
            "name": "B2B Lead Scraping Ingestion",
            "status": "connected",
            "endpoint": "/api/leads/import-csv",
            "leads_ingested": scraping_count,
            "supported_formats": ["CSV", "JSON"]
        },
        "google_drive": {
            "name": "Google Drive Call Recordings",
            "status": "staged",
            "note": "Ready for Google Service Account integration"
        }
    }

@app.post("/api/leads/import-csv")
async def import_csv_leads(request: Request, user: dict = Depends(require_auth)):
    try:
        body = await request.json()
        leads_data = body.get("leads", [])
        if not leads_data:
            raise HTTPException(status_code=400, detail="No leads provided in payload")
        created = []
        for item in leads_data:
            lead_dict = {
                "name": item.get("name") or "Scraped Lead",
                "business_name": item.get("business_name") or item.get("company", ""),
                "phone": item.get("phone", ""),
                "email": item.get("email", ""),
                "city": item.get("city", ""),
                "temperature": item.get("temperature", "warm"),
                "call_stage": item.get("call_stage", "first_call"),
                "source": "scraping",
                "status": "new",
                "priority": item.get("priority", "medium"),
                "deal_value": float(item.get("deal_value", 0)) if item.get("deal_value") else None,
                "assigned_to": item.get("assigned_to") or user.get("user_id"),
                "last_update_notes": item.get("notes") or "Imported from B2B scraping list"
            }
            created.append(Repository.create_lead(lead_dict))
        return {"status": "success", "imported": len(created), "leads": created}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")

@app.get("/api/users")
def list_users(user: dict = Depends(require_auth)):
    users = Repository.list_users()
    for u in users:
        if 'password_hash' in u:
            del u['password_hash']
    return users

@app.post("/api/users")
def create_user(data: UserCreate, user: dict = Depends(require_admin)):
    return Repository.create_user(data.name, data.email, hash_password(data.password), data.role)

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
static_dir = os.path.join(base_dir, 'static')

@app.get("/variables.css")
def serve_variables():
    p = os.path.join(base_dir, "variables.css")
    if os.path.exists(p):
        return FileResponse(p, media_type="text/css")
    return ""

@app.get("/theme.css")
def serve_theme():
    p = os.path.join(base_dir, "theme.css")
    if os.path.exists(p):
        return FileResponse(p, media_type="text/css")
    return ""

@app.get("/tokens.json")
def serve_tokens():
    p = os.path.join(base_dir, "tokens.json")
    if os.path.exists(p):
        return FileResponse(p, media_type="application/json")
    return {}

app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(static_dir, "index.html"))
