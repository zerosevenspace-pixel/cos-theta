"""
Seed realistic data for COS Theta Business Operating System:
- Zero7 Consultancy (Leads, Calling Logs, Converted Clients, Deliverables)
- FILTR Coffee (Menu items with recipe mapping, Inventory items with thresholds, Orders, Transactions)
- Team / "The Guys" (Admin, Managers, Sales Consultants, Baristas)
- Tasks with Google To-Do tags
- Central Drive Documents
"""

import json
from datetime import datetime, timezone, timedelta
from backend.database import get_connection, hash_password, DBRepository, init_db


def seed_all_data():
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # Check if already seeded
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    yesterday_iso = (now - timedelta(days=1)).isoformat()
    two_days_ago_iso = (now - timedelta(days=2)).isoformat()
    tomorrow_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    next_week_date = (now + timedelta(days=7)).strftime("%Y-%m-%d")

    # 1. THE GUYS / TEAM MEMBERS
    users = [
        ("usr_admin", "Admin Founder", "admin", "founder@costheta.internal", hash_password("admin123"), "founder", "all", "+91 98765 43210", "AF", "active", now_iso),
        ("usr_shaan", "Shaan Verma", "shaan", "shaan@zero7.internal", hash_password("zero7pass"), "lead_consultant", "zero7_consultancy", "+91 98234 56789", "SV", "active", now_iso),
        ("usr_tanvi", "Tanvi Rao", "tanvi", "tanvi@zero7.internal", hash_password("zero7pass"), "lead_consultant", "zero7_consultancy", "+91 98345 67890", "TR", "active", now_iso),
        ("usr_rahul", "Rahul Sharma", "rahul", "rahul@filtr.internal", hash_password("filtrpass"), "operations_manager", "filtr_coffee", "+91 98456 78901", "RS", "active", now_iso),
        ("usr_aarav", "Aarav Patel", "aarav", "aarav@filtr.internal", hash_password("barista123"), "barista_staff", "filtr_coffee", "+91 98567 89012", "AP", "active", now_iso),
    ]
    cursor.executemany("""
    INSERT INTO users (id, name, username, email, password_hash, role, assigned_business, phone, avatar_initials, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, users)

    # 2. FILTR COFFEE INVENTORY ITEMS
    inventory = [
        ("inv_beans_arabica", "Single Origin Arabica Beans", "Beans", 18.5, 5.0, "kg", 850.0, "Chikmagalur Plantation Co.", "+91 94481 12345", 20.0, now_iso, now_iso),
        ("inv_beans_robusta", "Dark Roast Robusta Blend", "Beans", 4.2, 5.0, "kg", 550.0, "Coorg Roasters", "+91 94482 23456", 15.0, yesterday_iso, now_iso),  # Low stock!
        ("inv_milk_whole", "Fresh Whole Dairy Milk", "Dairy", 8.0, 10.0, "liters", 65.0, "Nandini Dairy Supplies", "+91 94483 34567", 25.0, now_iso, now_iso),   # Low stock!
        ("inv_milk_oat", "Barista Oat Milk", "Dairy", 12.0, 4.0, "liters", 240.0, "AltDairy Solutions", "+91 94484 45678", 10.0, now_iso, now_iso),
        ("inv_syrup_vanilla", "Madagascar Vanilla Syrup", "Syrups", 5.0, 2.0, "bottles", 480.0, "Monin Beverage Dist.", "+91 94485 56789", 6.0, two_days_ago_iso, now_iso),
        ("inv_syrup_caramel", "Salted Caramel Syrup", "Syrups", 1.0, 2.0, "bottles", 480.0, "Monin Beverage Dist.", "+91 94485 56789", 6.0, two_days_ago_iso, now_iso),  # Low stock!
        ("inv_cups_8oz", "Kraft Paper Cups 8oz (Small)", "Packaging", 320.0, 100.0, "units", 4.5, "EcoPack Packaging", "+91 94486 67890", 500.0, now_iso, now_iso),
        ("inv_cups_12oz", "Kraft Paper Cups 12oz (Regular)", "Packaging", 85.0, 100.0, "units", 6.0, "EcoPack Packaging", "+91 94486 67890", 500.0, yesterday_iso, now_iso), # Low stock!
        ("inv_croissant_frozen", "Butter Croissant Pre-Bake", "Snacks", 24.0, 10.0, "units", 65.0, "Artisan Bakery Hub", "+91 94487 78901", 30.0, now_iso, now_iso),
    ]
    cursor.executemany("""
    INSERT INTO inventory_items (id, name, category, current_stock, minimum_threshold, unit, cost_per_unit, supplier_name, supplier_phone, reorder_quantity, last_restocked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, inventory)

    # 3. FILTR COFFEE MENU ITEMS (WITH INGREDIENT MAPS)
    menu = [
        ("menu_filter_coffee", "Classic South Indian Filter Coffee", "Brew", 90.0, "Traditional decoction with whole milk & organic jaggery", json.dumps({"inv_beans_robusta": 0.02, "inv_milk_whole": 0.12, "inv_cups_8oz": 1.0}), 1),
        ("menu_cappuccino", "Artisan Hot Cappuccino", "Espresso", 160.0, "Double shot Arabica espresso with velvety micro-foam", json.dumps({"inv_beans_arabica": 0.018, "inv_milk_whole": 0.18, "inv_cups_8oz": 1.0}), 1),
        ("menu_cold_brew", "24-Hour Steeped Cold Brew", "Cold", 180.0, "Smooth, chocolatey steeped cold brew served over clear ice", json.dumps({"inv_beans_arabica": 0.035, "inv_cups_12oz": 1.0}), 1),
        ("menu_vanilla_latte", "Vanilla Oat Latte", "Espresso", 220.0, "Espresso with steamed barista oat milk and pure vanilla", json.dumps({"inv_beans_arabica": 0.018, "inv_milk_oat": 0.22, "inv_syrup_vanilla": 0.03, "inv_cups_12oz": 1.0}), 1),
        ("menu_croissant", "Fresh Warm Butter Croissant", "Pastry", 140.0, "Flaky French pastry baked golden brown", json.dumps({"inv_croissant_frozen": 1.0}), 1),
    ]
    cursor.executemany("""
    INSERT INTO menu_items (id, name, category, price, description, stock_ingredient_map, is_available)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, menu)

    # 4. FILTR COFFEE SAMPLE ORDERS & REVENUE
    orders = [
        (
            "ord_001", "FLTR-20260820-001", "Vikram Malhotra", "dine_in",
            json.dumps([{"menu_item_id": "menu_filter_coffee", "name": "Classic South Indian Filter Coffee", "price": 90.0, "quantity": 2, "customization": "Medium sweet"}, {"menu_item_id": "menu_croissant", "name": "Fresh Warm Butter Croissant", "price": 140.0, "quantity": 1, "customization": "Extra warm"}]),
            320.0, 0.0, 320.0, "upi_qr", "completed", "Table 4", "usr_aarav", "Aarav Patel", two_days_ago_iso
        ),
        (
            "ord_002", "FLTR-20260820-002", "Priya Sharma", "takeaway",
            json.dumps([{"menu_item_id": "menu_vanilla_latte", "name": "Vanilla Oat Latte", "price": 220.0, "quantity": 1, "customization": "Less ice"}]),
            220.0, 0.0, 220.0, "upi_qr", "completed", "Pickup counter", "usr_aarav", "Aarav Patel", yesterday_iso
        ),
        (
            "ord_003", "FLTR-20260820-003", "Deepak Nambiar", "dine_in",
            json.dumps([{"menu_item_id": "menu_cold_brew", "name": "24-Hour Steeped Cold Brew", "price": 180.0, "quantity": 2, "customization": "Black"}, {"menu_item_id": "menu_cappuccino", "name": "Artisan Hot Cappuccino", "price": 160.0, "quantity": 1, "customization": "Extra foam"}]),
            520.0, 20.0, 500.0, "cash", "completed", "Table 2", "usr_aarav", "Aarav Patel", now_iso
        ),
    ]
    cursor.executemany("""
    INSERT INTO orders (id, order_number, customer_name, order_type, items_json, subtotal, discount, total, payment_method, status, notes, cashier_id, cashier_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, orders)

    # 5. ZERO7 CONSULTANCY LEADS & CRM PIPELINE
    leads = [
        (
            "lead_nexgen", "NexGen FinTech Corp", "Rohan Mehta", "rohan@nexgenfin.com", "+91 98111 22334",
            "proposal_sent", "Inbound Website", 250000.0, "FinTech & Banking",
            "Wants end-to-end AI operational automation for customer credit scoring.",
            "usr_shaan", yesterday_iso, tomorrow_date, "GSHEET_ROW_102", two_days_ago_iso, yesterday_iso
        ),
        (
            "lead_apex", "Apex Logistics Ltd", "Kavita Nair", "kavita.nair@apexlogistics.in", "+91 98222 33445",
            "pitch_completed", "Cold Calling Campaign", 180000.0, "Supply Chain",
            "Pitch call went very well. Requested a tailored proposal with milestone timelines.",
            "usr_shaan", now_iso, next_week_date, "GSHEET_ROW_103", two_days_ago_iso, now_iso
        ),
        (
            "lead_zenith", "Zenith HealthTech", "Dr. Sameer Joshi", "s.joshi@zenithhealth.io", "+91 98333 44556",
            "followup_scheduled", "LinkedIn Outreach", 120000.0, "Healthcare",
            "Interested in cloud migration and HIPAA compliant backend architecture.",
            "usr_tanvi", yesterday_iso, tomorrow_date, "GSHEET_ROW_104", two_days_ago_iso, yesterday_iso
        ),
        (
            "lead_bluecloud", "BlueCloud Retailers", "Ananya Deshmukh", "ananya@bluecloud.shop", "+91 98444 55667",
            "not_contacted", "Google Sheets Ingest", 95000.0, "E-Commerce",
            "Fresh lead imported from Google Sheet marketing database.",
            "usr_tanvi", None, tomorrow_date, "GSHEET_ROW_105", now_iso, now_iso
        ),
        (
            "lead_hyperia", "Hyperia Studios", "Karan Singhal", "karan@hyperiastudios.com", "+91 98555 66778",
            "called_no_answer", "Referral", 150000.0, "Media & Design",
            "Called twice today at 11:30 AM and 4:00 PM. No answer. Left voice note.",
            "usr_shaan", now_iso, tomorrow_date, "GSHEET_ROW_106", yesterday_iso, now_iso
        ),
        (
            "lead_kore", "Kore Mobility", "Aditya Sen", "aditya@koremobility.com", "+91 98666 77889",
            "won", "Direct Founder Network", 350000.0, "Automotive Tech",
            "Converted to active client! Retainer contract signed.",
            "usr_admin", two_days_ago_iso, None, "GSHEET_ROW_101", two_days_ago_iso, two_days_ago_iso
        ),
    ]
    cursor.executemany("""
    INSERT INTO leads (id, company_name, contact_person, email, phone, status, source, estimated_value, sector, notes, assigned_to, last_contacted_at, next_followup_date, google_sheet_row_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, leads)

    # 6. CALL LOGS (ZERO7)
    call_logs = [
        ("call_001", "lead_nexgen", "usr_shaan", "Shaan Verma", two_days_ago_iso, "Call Completed - High Interest", "Discussed scope and tech architecture. Proposal drafting approved.", yesterday_iso),
        ("call_002", "lead_apex", "usr_shaan", "Shaan Verma", yesterday_iso, "Pitch Deck Presented", "Covered automated fleet tracking and ROI matrix. Client scheduled partner review.", next_week_date),
        ("call_003", "lead_hyperia", "usr_shaan", "Shaan Verma", now_iso, "Ringing - No Response", "Will re-attempt tomorrow 10:00 AM.", tomorrow_date),
        ("call_004", "lead_zenith", "usr_tanvi", "Tanvi Rao", yesterday_iso, "Discovery Call", "Dr. Joshi explained their electronic health records bottleneck. Setting up technical scope call.", tomorrow_date),
    ]
    cursor.executemany("""
    INSERT INTO call_logs (id, lead_id, caller_id, caller_name, called_at, outcome, notes, next_followup_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, call_logs)

    # 7. CONVERTED CLIENTS & DELIVERABLES (ZERO7)
    clients = [
        (
            "cli_kore", "Kore Mobility", "Aditya Sen", "aditya@koremobility.com", "+91 98666 77889",
            "Growth Strategic Retainer", 350000.0, (now - timedelta(days=30)).strftime("%Y-%m-%d"),
            (now + timedelta(days=335)).strftime("%Y-%m-%d"), "active", "lead_kore",
            "12-Month enterprise transformation contract.", (now - timedelta(days=30)).isoformat()
        ),
        (
            "cli_velox", "Velox Cloud Infra", "Arun Varma", "arun@veloxinfra.io", "+91 98777 88990",
            "Custom Architecture Retainer", 200000.0, (now - timedelta(days=60)).strftime("%Y-%m-%d"),
            (now + timedelta(days=120)).strftime("%Y-%m-%d"), "active", None,
            "Kubernetes optimization and microservices migration retainer.", (now - timedelta(days=60)).isoformat()
        ),
    ]
    cursor.executemany("""
    INSERT INTO clients (id, company_name, contact_person, email, phone, tier, monthly_value, contract_start_date, contract_end_date, status, lead_id, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, clients)

    deliverables = [
        ("del_001", "cli_kore", "Cloud Architecture Blueprint V2", "Deliver complete microservices architecture blueprint and AWS terraform scripts.", tomorrow_date, "in_progress", "Shaan Verma"),
        ("del_002", "cli_kore", "API Gateway Performance Benchmarking", "Stress test telemetry ingress endpoints up to 50k req/sec.", next_week_date, "pending", "Tanvi Rao"),
        ("del_003", "cli_velox", "CI/CD Pipeline Security Audit", "Comprehensive security hardening for GitHub Actions and Docker registries.", yesterday_iso, "completed", "Shaan Verma"),
        ("del_004", "cli_velox", "Database Sharding Implementation", "PostgreSQL read-replica setup and partition strategy rollout.", next_week_date, "in_progress", "Shaan Verma"),
    ]
    cursor.executemany("""
    INSERT INTO deliverables (id, client_id, title, description, due_date, status, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, deliverables)

    # 8. FINANCIAL TRANSACTIONS
    transactions = [
        ("txn_001", "filtr_coffee", "income", "Cafe Sales", 320.0, "Order #FLTR-20260820-001 (dine_in)", "upi_qr", "ord_001", two_days_ago_iso),
        ("txn_002", "filtr_coffee", "income", "Cafe Sales", 220.0, "Order #FLTR-20260820-002 (takeaway)", "upi_qr", "ord_002", yesterday_iso),
        ("txn_003", "filtr_coffee", "income", "Cafe Sales", 500.0, "Order #FLTR-20260820-003 (dine_in)", "cash", "ord_003", now_iso),
        ("txn_004", "filtr_coffee", "expense", "Raw Materials / Stock Restock", 8500.0, "Restocked 10kg Arabica Coffee Beans from Chikmagalur", "bank_transfer", "inv_beans_arabica", yesterday_iso),
        ("txn_005", "zero7_consultancy", "income", "Client Retainer", 350000.0, "August Retainer Fee - Kore Mobility", "bank_transfer", "cli_kore", (now - timedelta(days=5)).isoformat()),
        ("txn_006", "zero7_consultancy", "income", "Client Retainer", 200000.0, "August Retainer Fee - Velox Cloud Infra", "bank_transfer", "cli_velox", (now - timedelta(days=10)).isoformat()),
        ("txn_007", "zero7_consultancy", "expense", "Software & Cloud Tools", 14500.0, "AWS & Claude Cloud Infrastructure Licenses", "card", None, yesterday_iso),
    ]
    cursor.executemany("""
    INSERT INTO transactions (id, business, type, category, amount, description, payment_method, reference_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, transactions)

    # 9. TASKS (WITH GOOGLE TO-DO INTEGRATION MAPPINGS)
    tasks = [
        (
            "tsk_001", "Send customized proposal to NexGen FinTech",
            "Include architecture breakdown and milestone fee structure.",
            "zero7_consultancy", "urgent", "todo", tomorrow_date,
            "usr_shaan", "Shaan Verma", "GTASK_90123", json.dumps(["Zero7", "Proposal", "Client"]),
            "usr_admin", yesterday_iso, now_iso
        ),
        (
            "tsk_002", "Place emergency restock order for Oat Milk & Robusta beans",
            "Robusta blend has dropped to 4.2kg and Oat milk is running low ahead of weekend rush.",
            "filtr_coffee", "high", "in_progress", tomorrow_date,
            "usr_rahul", "Rahul Sharma", "GTASK_90124", json.dumps(["FILTR", "Inventory", "Suppliers"]),
            "usr_admin", now_iso, now_iso
        ),
        (
            "tsk_003", "Calibrate Victoria Arduino espresso machine grinder",
            "Morning extraction times drifted to 34s; recalibrate for 26-28s double shot espresso.",
            "filtr_coffee", "medium", "todo", tomorrow_date,
            "usr_aarav", "Aarav Patel", "GTASK_90125", json.dumps(["FILTR", "Maintenance"]),
            "usr_rahul", now_iso, now_iso
        ),
        (
            "tsk_004", "Follow up with Dr. Sameer at Zenith HealthTech",
            "Schedule technical feasibility sync with healthcare security lead.",
            "zero7_consultancy", "medium", "todo", tomorrow_date,
            "usr_tanvi", "Tanvi Rao", "GTASK_90126", json.dumps(["Zero7", "Leads", "CRM"]),
            "usr_admin", yesterday_iso, now_iso
        ),
        (
            "tsk_005", "Monthly GST and TDS reconciliation for Zero7 & FILTR",
            "Consolidate invoice spreadsheets and supplier tax credits.",
            "all", "high", "todo", next_week_date,
            "usr_admin", "Admin Founder", "GTASK_90127", json.dumps(["Finance", "Compliance", "Tax"]),
            "usr_admin", two_days_ago_iso, now_iso
        ),
    ]
    cursor.executemany("""
    INSERT INTO tasks (id, title, description, business, priority, status, due_date, assigned_to_id, assigned_to_name, google_task_id, tags_json, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, tasks)

    # 10. CENTRAL GOOGLE DRIVE DOCUMENTS
    docs = [
        ("doc_001", "Zero7 - Master Services Agreement (MSA) Standard.pdf", "Contracts", "zero7_consultancy", "pdf", "GDRIVE_FILE_881", "https://drive.google.com/file/d/sample_msa", "1.8 MB", "Admin Founder", two_days_ago_iso),
        ("doc_002", "Zero7 - AI Enterprise Architecture Pitch Deck 2026.pdf", "Pitch Decks", "zero7_consultancy", "pdf", "GDRIVE_FILE_882", "https://drive.google.com/file/d/sample_pitch", "8.4 MB", "Shaan Verma", yesterday_iso),
        ("doc_003", "FILTR - Barista Standard Operating Procedures & Brewing Guide.pdf", "SOPs", "filtr_coffee", "pdf", "GDRIVE_FILE_883", "https://drive.google.com/file/d/sample_sop", "3.2 MB", "Rahul Sharma", (now - timedelta(days=15)).isoformat()),
        ("doc_004", "FILTR - FSSAI Food Safety License & Municipal Clearance.pdf", "Compliance", "filtr_coffee", "pdf", "GDRIVE_FILE_884", "https://drive.google.com/file/d/sample_license", "950 KB", "Rahul Sharma", (now - timedelta(days=60)).isoformat()),
        ("doc_005", "Kore Mobility - August Deliverable Sign-Off Sheet.pdf", "Contracts", "zero7_consultancy", "pdf", "GDRIVE_FILE_885", "https://drive.google.com/file/d/sample_signoff", "640 KB", "Shaan Verma", yesterday_iso),
        ("doc_006", "COS Theta Group - Consolidated Financial Forecast FY26-27.sheet", "Finance", "all", "sheet", "GDRIVE_FILE_886", "https://drive.google.com/file/d/sample_finance", "4.1 MB", "Admin Founder", (now - timedelta(days=5)).isoformat()),
    ]
    cursor.executemany("""
    INSERT INTO documents (id, title, category, business, file_type, drive_file_id, drive_url, size_label, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, docs)

    # 11. DEFAULT SYSTEM SETTINGS
    settings = [
        ("google_service_account_configured", "true"),
        ("google_service_account_email", "service-cos-theta@internal-enterprise-os.iam.gserviceaccount.com"),
        ("sheets_id_zero7_leads", "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"),
        ("drive_root_folder_id", "1aBcDeFgHiJkLmNoPqRsTuVwXyZ012345"),
        ("tasks_sync_enabled", "true"),
        ("last_google_sync", now_iso),
        ("custom_ai_endpoint", ""),
        ("custom_ai_api_key", ""),
    ]
    cursor.executemany("""
    INSERT INTO system_settings (key, value)
    VALUES (?, ?)
    """, settings)

    conn.commit()
    conn.close()
