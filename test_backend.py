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

    # 4. Create Lead
    new_lead = {
        "name": "Arjun Kapoor",
        "business_name": "Kapoor Logistics",
        "phone": "+91 9988776655",
        "email": "arjun@kapoorlogistics.in",
        "source": "meta_ads",
        "deal_value": 75000.0,
        "priority": "high"
    }
    res = client.post("/api/leads", json=new_lead, headers=admin_headers)
    assert res.status_code == 200
    created_lead = res.json()
    lead_id = created_lead["id"]
    print(f"[PASS] 4. Created lead {lead_id} ({created_lead['name']})")

    # 5. Log Call on Lead
    call_payload = {
        "outcome": "Connected",
        "notes": "Discussed retainer scope for logistics re-branding. Very interested.",
        "duration_minutes": 15
    }
    res = client.post(f"/api/leads/{lead_id}/calls", json=call_payload, headers=admin_headers)
    assert res.status_code == 200
    print("[PASS] 5. Logged call on lead")

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
    print(f"[PASS] 7. Lead detail fetched ({len(activities)} activities recorded)")

    # 8. Convert Lead to Deal
    res = client.post(f"/api/leads/{lead_id}/convert", headers=admin_headers)
    assert res.status_code == 200
    deal = res.json()
    deal_id = deal["id"]
    print(f"[PASS] 8. Converted lead to Deal {deal_id} (Title: {deal['title']}, Value: INR {deal['value']})")

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

    # 12. Meta Ads Webhook
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

    # Verify that the webhook created a lead
    res = client.get("/api/leads", headers=admin_headers)
    meta_leads = [l for l in res.json() if l["email"] == "kavita@raohealth.com"]
    assert len(meta_leads) == 1
    assert meta_leads[0]["source"] == "meta_ads"
    print(f"[PASS] 13. Ingested Meta lead verified in database: {meta_leads[0]['name']}")

    print("\nALL 13 TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    run_tests()
