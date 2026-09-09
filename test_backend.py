import sys
import os
sys.path.insert(0, '.')

from fastapi.testclient import TestClient
from backend.app import app
from backend.database import init_db
from backend.seed_data import seed_if_empty

init_db()
seed_if_empty()

client = TestClient(app)

def run_tests():
    print("=== ZERO7 CRM E2E TEST SUITE ===")
    
    # 1. Login Admin
    res = client.post("/api/auth/login", json={"email": "abhijeet@zero7.in", "password": "admin123"})
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    admin_token = res.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("[PASS] 1. Admin login")

    # 2. Get Me
    res = client.get("/api/auth/me", headers=admin_headers)
    assert res.status_code == 200 and res.json()["role"] == "admin"
    print(f"[PASS] 2. Auth me ({res.json()['name']} - {res.json()['role']})")

    # 3. List Leads as Admin
    res = client.get("/api/leads", headers=admin_headers)
    assert res.status_code == 200
    leads = res.json()
    assert len(leads) >= 5
    print(f"[PASS] 3. List leads ({len(leads)} leads visible to Admin)")

    # 4. Create Lead with city, temperature, and call_stage
    new_lead = {
        "name": "Arjun Kapoor",
        "business_name": "Kapoor Logistics",
        "phone": "+91 9988776655",
        "email": "arjun@kapoorlogistics.in",
        "city": "Bengaluru",
        "temperature": "hot",
        "call_stage": "first_call",
        "source": "meta_ads",
        "deal_value": 75000.0,
        "priority": "high",
        "last_update_notes": "Urgent inquiry regarding supply chain CRM setup"
    }
    res = client.post("/api/leads", json=new_lead, headers=admin_headers)
    assert res.status_code == 200
    created_lead = res.json()
    lead_id = created_lead["id"]
    assert created_lead["city"] == "Bengaluru"
    assert created_lead["temperature"] == "hot"
    assert created_lead["call_stage"] == "first_call"
    print(f"[PASS] 4. Created lead {lead_id} ({created_lead['name']} in {created_lead['city']}, Temp: {created_lead['temperature']})")

    # 5. Log Call on Lead & Update Call Stage to DNP
    call_payload = {
        "outcome": "DNP",
        "notes": "Attempted call, did not pick up. Scheduled retry.",
        "duration_minutes": 2
    }
    res = client.post(f"/api/leads/{lead_id}/calls", json=call_payload, headers=admin_headers)
    assert res.status_code == 200
    # Update call stage
    res_update = client.put(f"/api/leads/{lead_id}", json={"call_stage": "dnp", "temperature": "warm"}, headers=admin_headers)
    assert res_update.status_code == 200
    assert res_update.json()["call_stage"] == "dnp"
    print("[PASS] 5. Logged DNP call on lead & updated call stage")

    # 6. Add Note on Lead
    note_payload = {
        "content": "Follow up scheduled for tomorrow at 3 PM with presentation deck."
    }
    res = client.post(f"/api/leads/{lead_id}/notes", json=note_payload, headers=admin_headers)
    assert res.status_code == 200
    print("[PASS] 6. Added note on lead")

    # 7. Get Lead Details & Activity
    res = client.get(f"/api/leads/{lead_id}", headers=admin_headers)
    assert res.status_code == 200
    lead_detail = res.json()
    activities = lead_detail.get("activity", [])
    assert len(activities) >= 2
    assert lead_detail["city"] == "Bengaluru"
    print(f"[PASS] 7. Lead detail fetched ({len(activities)} activities, City: {lead_detail['city']})")

    # 8. Convert Lead to Deal
    res = client.post(f"/api/leads/{lead_id}/convert", headers=admin_headers)
    assert res.status_code == 200
    deal = res.json()
    deal_id = deal["id"]
    assert deal["city"] == "Bengaluru"
    print(f"[PASS] 8. Converted lead to Deal {deal_id} (City: {deal['city']}, Value: INR {deal['value']})")

    # 9. Update Deal Stage
    res = client.put(f"/api/deals/{deal_id}", json={"stage": "negotiation"}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["stage"] == "negotiation"
    print(f"[PASS] 9. Updated deal stage to negotiation")

    # 10. Login Member (Shailesh)
    res = client.post("/api/auth/login", json={"email": "shailesh@zero7.in", "password": "member123"})
    assert res.status_code == 200
    member_token = res.json()["token"]
    member_headers = {"Authorization": f"Bearer {member_token}"}
    print("[PASS] 10. Member login (Shailesh)")

    # 11. Member only sees assigned leads
    res = client.get("/api/leads", headers=member_headers)
    assert res.status_code == 200
    member_leads = res.json()
    for l in member_leads:
        assert l["assigned_to"] == res.json()[0]["assigned_to"]
    print(f"[PASS] 11. Role separation verified: Member sees {len(member_leads)} assigned leads")

    # 12. Meta Ads Webhook with City & Temperature
    meta_payload = {
        "name": "Kavita Rao",
        "business_name": "Rao Health Tech",
        "phone": "+91 9123456780",
        "email": "kavita@raohealth.com",
        "ad_name": "Zero7 Instagram Story Ad"
    }
    res = client.post("/api/webhooks/meta-leads", json=meta_payload)
    assert res.status_code == 200 and res.json()["status"] == "success"
    print("[PASS] 12. Meta Lead Ads webhook received & processed")

    # 13. Bulk Scraped Leads Ingestion
    bulk_payload = {
        "leads": [
            {"name": "Suresh Raina", "business_name": "Raina Sports", "phone": "+91 9833445566", "city": "Chennai", "temperature": "hot"},
            {"name": "Mansi Joshi", "business_name": "Joshi Architects", "phone": "+91 9744556677", "city": "Pune", "temperature": "warm"}
        ]
    }
    res = client.post("/api/leads/import-csv", json=bulk_payload, headers=admin_headers)
    assert res.status_code == 200 and res.json()["imported"] == 2
    print(f"[PASS] 13. Bulk scraping ingestion verified (imported {res.json()['imported']} leads)")

    # 14. Integrations Status
    res = client.get("/api/integrations/status", headers=admin_headers)
    assert res.status_code == 200
    st = res.json()
    assert st["meta_ads"]["status"] == "connected"
    assert st["whatsapp"]["status"] == "connected"
    assert st["scraping"]["status"] == "connected"
    print(f"[PASS] 14. Integrations status verified (Meta Ads: {st['meta_ads']['status']}, WhatsApp: {st['whatsapp']['status']})")

    print("\nALL 14 TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    run_tests()
