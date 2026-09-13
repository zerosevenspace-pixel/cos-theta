from fastapi import FastAPI, HTTPException, Request, Depends, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from typing import Optional
import os
import io

from backend.database import Repository, init_db
from backend.models import UserLogin, UserCreate, UserUpdate, LeadCreate, LeadUpdate, DealCreate, DealUpdate, CallLogCreate, NoteCreate
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

@app.get("/api/health")
def health_check():
    domain = os.getenv("APP_DOMAIN", "cos.zero7.space")
    return {"status": "ok", "service": "Zero7 CRM", "domain": domain}

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
async def log_call(id: str, request: Request, user: dict = Depends(require_auth)):
    content_type = request.headers.get('content-type', '')
    
    if 'multipart/form-data' in content_type:
        form = await request.form()
        outcome = form.get('outcome', 'Connected')
        notes = form.get('notes', '')
        duration_minutes = int(form.get('duration_minutes', 5))
        
        recording_data = {}
        upload_file = form.get('recording')
        if upload_file and hasattr(upload_file, 'filename') and upload_file.filename:
            file_bytes = await upload_file.read()
            if len(file_bytes) > 0:
                call_id_preview = 'call_' + __import__('uuid').uuid4().hex[:8]
                recordings_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'recordings')
                os.makedirs(recordings_dir, exist_ok=True)
                
                safe_name = upload_file.filename.replace('..', '').replace('/', '_').replace('\\', '_')
                save_path = os.path.join(recordings_dir, f"{call_id_preview}_{safe_name}")
                with open(save_path, 'wb') as f:
                    f.write(file_bytes)
                
                recording_data['recording_file_name'] = f"{call_id_preview}_{safe_name}"
                recording_data['recording_mime_type'] = upload_file.content_type or 'audio/mpeg'
                recording_data['recording_size_bytes'] = len(file_bytes)
                
                # Try to extract duration using mutagen
                try:
                    import mutagen
                    audio = mutagen.File(save_path)
                    if audio and audio.info:
                        recording_data['recording_duration_secs'] = int(audio.info.length)
                except Exception:
                    pass
        
        d = {
            'lead_id': id,
            'user_id': user.get('user_id'),
            'outcome': outcome,
            'notes': notes,
            'duration_minutes': duration_minutes,
            **recording_data
        }
    else:
        body = await request.json()
        d = {
            'lead_id': id,
            'user_id': user.get('user_id'),
            'outcome': body.get('outcome', 'Connected'),
            'notes': body.get('notes', ''),
            'duration_minutes': body.get('duration_minutes', 5)
        }
    
    return Repository.log_call(d)

@app.get("/api/recordings/{filename}")
def stream_recording(filename: str):
    recordings_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'recordings')
    file_path = os.path.join(recordings_dir, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Recording not found")
    
    # Determine media type
    ext = os.path.splitext(filename)[1].lower()
    media_types = {
        '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
        '.ogg': 'audio/ogg', '.webm': 'audio/webm',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo'
    }
    media_type = media_types.get(ext, 'application/octet-stream')
    return FileResponse(file_path, media_type=media_type, filename=filename)

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
        return PlainTextResponse(content=str(challenge))
    return PlainTextResponse(content="OK")

@app.post("/api/webhooks/meta-leads")
async def receive_meta_webhook(request: Request):
    payload = await request.json()
    try:
        if "name" in payload:
            channel_data = payload.get("channel_data") or {}
            for key in ["campaign_name", "adset_name", "ad_name", "ad_id", "platform", "form_name", "form_id"]:
                if key in payload and key not in channel_data:
                    channel_data[key] = payload[key]
            
            if "creative" in payload:
                channel_data["creative"] = payload["creative"]
            elif "creative_thumbnail_url" in payload or "thumbnail_url" in payload:
                channel_data["creative"] = {
                    "thumbnail_url": payload.get("creative_thumbnail_url") or payload.get("thumbnail_url"),
                    "image_url": payload.get("image_url"),
                    "title": payload.get("ad_title") or payload.get("ad_name"),
                    "body": payload.get("ad_body") or payload.get("ad_copy")
                }
            
            form_answers = payload.get("form_answers") or payload.get("custom_fields")
            if form_answers:
                if isinstance(form_answers, dict):
                    channel_data["form_answers"] = [{"question": k, "answer": str(v)} for k, v in form_answers.items()]
                elif isinstance(form_answers, list):
                    channel_data["form_answers"] = form_answers

            lead = Repository.create_lead({
                "name": payload.get("name"),
                "business_name": payload.get("business_name", ""),
                "phone": payload.get("phone", ""),
                "email": payload.get("email", ""),
                "city": payload.get("city", ""),
                "temperature": payload.get("temperature", "hot"),
                "call_stage": payload.get("call_stage", "first_call"),
                "source": "meta_ads",
                "meta_form_id": payload.get("form_id") or channel_data.get("form_id") or payload.get("meta_form_id", ""),
                "meta_ad_name": payload.get("ad_name") or channel_data.get("ad_name") or payload.get("meta_ad_name", "Meta Lead Ads Campaign"),
                "status": "new",
                "priority": payload.get("priority", "high"),
                "deal_value": float(payload.get("deal_value")) if payload.get("deal_value") else None,
                "next_action": payload.get("next_action", "Speed to lead call (< 5 mins)"),
                "channel_data": channel_data if channel_data else None
            })
            return {"status": "success", "lead_id": lead["id"]}

        entries = payload.get("entry", [])
        created_count = 0
        token = os.getenv("META_PAGE_ACCESS_TOKEN")
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                val = change.get("value", {})
                leadgen_id = val.get("leadgen_id")
                form_id = val.get("form_id")
                ad_id = val.get("ad_id")
                page_id = val.get("page_id")
                
                channel_data = {
                    "leadgen_id": leadgen_id,
                    "form_id": form_id,
                    "ad_id": ad_id,
                    "page_id": page_id,
                    "platform": "instagram" if "instagram" in str(val).lower() else "facebook"
                }
                lead_name = f"Meta Lead {leadgen_id}"
                lead_phone = ""
                lead_email = ""
                lead_city = ""
                lead_business = ""
                ad_name = f"Ad {ad_id}" if ad_id else "Meta Instant Form"

                if token and leadgen_id:
                    try:
                        import httpx
                        async with httpx.AsyncClient(timeout=8.0) as client:
                            res = await client.get(f"https://graph.facebook.com/v20.0/{leadgen_id}?access_token={token}")
                            if res.status_code == 200:
                                ldata = res.json()
                                field_map = {f.get("name"): (f.get("values", [""])[0] if f.get("values") else "") for f in ldata.get("field_data", [])}
                                lead_name = field_map.get("full_name") or field_map.get("name") or lead_name
                                lead_phone = field_map.get("phone_number") or field_map.get("phone") or ""
                                lead_email = field_map.get("email") or ""
                                lead_city = field_map.get("city") or ""
                                lead_business = field_map.get("company_name") or field_map.get("business_name") or ""
                                
                                standard_keys = {"full_name", "name", "phone_number", "phone", "email", "city", "company_name", "business_name"}
                                custom_qas = [{"question": k, "answer": str(v)} for k, v in field_map.items() if k not in standard_keys and v]
                                if custom_qas:
                                    channel_data["form_answers"] = custom_qas
                                
                                if ad_id:
                                    ad_res = await client.get(f"https://graph.facebook.com/v20.0/{ad_id}?fields=name,campaign{{name}},adset{{name}},creative{{name,title,body,image_url,thumbnail_url}}&access_token={token}")
                                    if ad_res.status_code == 200:
                                        ad_info = ad_res.json()
                                        ad_name = ad_info.get("name", ad_name)
                                        channel_data["ad_name"] = ad_name
                                        if "campaign" in ad_info:
                                            channel_data["campaign_name"] = ad_info["campaign"].get("name")
                                        if "adset" in ad_info:
                                            channel_data["adset_name"] = ad_info["adset"].get("name")
                                        if "creative" in ad_info:
                                            cr = ad_info["creative"]
                                            channel_data["creative"] = {
                                                "thumbnail_url": cr.get("thumbnail_url") or cr.get("image_url"),
                                                "image_url": cr.get("image_url"),
                                                "title": cr.get("title") or cr.get("name"),
                                                "body": cr.get("body")
                                            }
                    except Exception as ex:
                        print("Error fetching Meta Graph API details:", ex)

                if leadgen_id:
                    lead = Repository.create_lead({
                        "name": lead_name,
                        "business_name": lead_business,
                        "phone": lead_phone,
                        "email": lead_email,
                        "city": lead_city,
                        "temperature": "hot",
                        "call_stage": "first_call",
                        "source": "meta_ads",
                        "meta_form_id": form_id or leadgen_id,
                        "meta_ad_name": ad_name,
                        "status": "new",
                        "priority": "high",
                        "next_action": "Speed to lead call (< 5 mins)",
                        "channel_data": channel_data
                    })
                    created_count += 1
        return {"status": "success", "created": created_count}
    except Exception as e:
        print("Error processing webhook:", e)
        return {"status": "error", "message": str(e)}

@app.get("/api/integrations/status")
def get_integrations_status(user: dict = Depends(require_auth)):
    domain = os.getenv("APP_DOMAIN", "cos.zero7.space")
    proto = "https" if not domain.startswith("localhost") and not domain.startswith("127.0.0.1") else "http"
    base_url = domain if domain.startswith("http") else f"{proto}://{domain}"
    webhook_url = f"{base_url}/api/webhooks/meta-leads"
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
            scraping_data = item.get("channel_data") or {}
            for k in ["website", "linkedin_url", "linkedin", "industry", "employee_count", "employees", "rating", "reviews", "query", "scraped_query", "batch"]:
                if k in item and item[k]:
                    clean_k = "linkedin_url" if k == "linkedin" else ("employee_count" if k == "employees" else ("scraped_query" if k == "query" else k))
                    scraping_data[clean_k] = item[k]

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
                "last_update_notes": item.get("notes") or "Imported from B2B scraping list",
                "channel_data": scraping_data if scraping_data else None
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
    created = Repository.create_user(data.name, data.email, hash_password(data.password), data.role)
    if created and 'password_hash' in created:
        del created['password_hash']
    return created

@app.put("/api/users/{id}")
def update_user(id: str, data: UserUpdate, user: dict = Depends(require_auth)):
    is_admin = user.get("role") == "admin"
    is_self = user.get("user_id") == id
    if not is_admin and not is_self:
        raise HTTPException(status_code=403, detail="Not authorized to edit this user")

    target = Repository.get_user(id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {}
    if data.name: update_data['name'] = data.name
    if data.email: update_data['email'] = data.email
    if data.role:
        if not is_admin and data.role != target['role']:
            raise HTTPException(status_code=403, detail="Only administrators can modify system roles")
        update_data['role'] = data.role
    if data.password: update_data['password_hash'] = hash_password(data.password)
    
    updated = Repository.update_user(id, update_data)
    if updated and 'password_hash' in updated:
        del updated['password_hash']
    return updated

@app.delete("/api/users/{id}")
def delete_user(id: str, user: dict = Depends(require_admin)):
    if id == user.get('user_id'):
        raise HTTPException(status_code=400, detail="Cannot delete your own active administrator account")
    target = Repository.get_user(id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    Repository.delete_user(id)
    return {"status": "success", "message": f"User {target['name']} deleted successfully"}

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
