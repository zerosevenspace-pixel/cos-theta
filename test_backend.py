"""
Backend automated test suite for COS Theta Business Operating System.
"""

import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)


def test_system():
    print("Testing Backend Systems...")

    # 1. Test Login
    login_resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    user = login_resp.json()["user"]
    print(f"[PASS] Auth verified: Logged in as {user['name']} ({user['role']})")

    # 2. Test Stats
    stats_all = client.get("/api/stats?business=all").json()
    assert "total_revenue" in stats_all
    print(f"[PASS] Multi-Tenant Stats verified (All): Total Revenue = INR {stats_all['total_revenue']:,.2f}")

    stats_filtr = client.get("/api/stats?business=filtr_coffee").json()
    assert stats_filtr["total_orders"] >= 3
    print(f"[PASS] FILTR Coffee Stats verified: Orders = {stats_filtr['total_orders']}, Low stock = {stats_filtr['low_stock_count']}")

    stats_zero7 = client.get("/api/stats?business=zero7_consultancy").json()
    assert stats_zero7["total_leads"] >= 5
    print(f"[PASS] Zero7 Stats verified: Total Leads = {stats_zero7['total_leads']}, Active Pipeline = {stats_zero7['active_pipeline_leads']}")

    # 3. Test Leads & Calling Flow
    leads_resp = client.get("/api/leads")
    assert leads_resp.status_code == 200
    leads = leads_resp.json()
    assert len(leads) > 0
    target_lead = leads[0]

    call_resp = client.post(f"/api/leads/{target_lead['id']}/call", json={
        "outcome": "Followup Confirmed",
        "notes": "Client requested updated technical deliverable timeline.",
        "next_followup_date": "2026-08-25"
    })
    assert call_resp.status_code == 200
    print(f"[PASS] Calling log verified for {target_lead['company_name']}")

    # 4. Test FILTR Coffee Order & Stock Depletion
    # Check current stock of Arabica Beans
    inv_before = client.get("/api/inventory").json()
    arabica_before = next(i for i in inv_before if i["id"] == "inv_beans_arabica")["current_stock"]

    # Place order for 2 Hot Cappuccinos (each uses 0.018kg arabica beans = 0.036kg total)
    order_resp = client.post("/api/orders", json={
        "customer_name": "Test Customer",
        "order_type": "dine_in",
        "items": [{
            "menu_item_id": "menu_cappuccino",
            "name": "Artisan Hot Cappuccino",
            "price": 160.0,
            "quantity": 2
        }],
        "subtotal": 320.0,
        "discount": 0.0,
        "total": 320.0,
        "payment_method": "upi_qr"
    })
    assert order_resp.status_code == 200
    order_data = order_resp.json()
    print(f"[PASS] Coffee POS Order created: #{order_data['order_number']}, Total: INR {order_data['total']}")

    inv_after = client.get("/api/inventory").json()
    arabica_after = next(i for i in inv_after if i["id"] == "inv_beans_arabica")["current_stock"]
    assert arabica_after < arabica_before, f"Stock was not depleted: before={arabica_before}, after={arabica_after}"
    print(f"[PASS] Automatic inventory depletion verified: Arabica stock went from {arabica_before}kg to {arabica_after}kg")

    # 5. Test Tasks
    task_resp = client.post("/api/tasks", json={
        "title": "Automated verification task",
        "description": "Ensure all modules operate smoothly.",
        "business": "all",
        "priority": "high",
        "status": "todo",
        "due_date": "2026-08-25",
        "tags": ["Testing", "Verification"]
    })
    assert task_resp.status_code == 200
    task_id = task_resp.json()["id"]
    print(f"[PASS] Task created with ID: {task_id}")

    # 6. Test AI Assistant Query
    ai_resp = client.post("/api/ai/query", json={
        "query": "Which items are low in stock at FILTR coffee?",
        "business_context": "filtr_coffee"
    })
    assert ai_resp.status_code == 200
    ai_data = ai_resp.json()
    assert "Low Stock" in ai_data["answer"] or "FILTR Coffee" in ai_data["answer"]
    print("[PASS] AI Assistant Intelligence engine verified")

    # 7. Test Google Integrations
    sheets_sync = client.post("/api/integrations/sheets/sync").json()
    assert sheets_sync["success"] is True
    print("[PASS] Google Sheets Two-Way Sync connector verified")

    # 8. Test Frontend Static Assets & Routes
    root_resp = client.get("/")
    assert root_resp.status_code == 200
    assert "COS Theta" in root_resp.text

    css_resp = client.get("/static/css/app.css")
    assert css_resp.status_code == 200
    assert "--color-canvas" in css_resp.text

    js_resp = client.get("/static/js/app.js")
    assert js_resp.status_code == 200
    assert "COS Theta" in js_resp.text

    print("[PASS] Frontend Static Assets & Web Interface routes verified")

    print("\nALL BACKEND SYSTEMS & INTEGRATIONS VERIFIED SUCCESSFULLY!")


if __name__ == "__main__":
    test_system()
