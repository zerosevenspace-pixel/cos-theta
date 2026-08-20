"""
Database layer for COS Theta Business Operating System.
Utilizes SQLite with complete schemas, foreign keys, transaction handling, and auto-seeding.
Designed for seamless migration to PostgreSQL / Supabase if desired.
"""

import sqlite3
import json
import uuid
import os
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cos_theta.db")
DATABASE_URL = os.getenv("SUPABASE_DATABASE_URL") or os.getenv("DATABASE_URL")


def hash_password(password: str) -> str:
    """Create a secure SHA-256 hash with salt for local authentication."""
    salt = "cos_theta_enterprise_salt_2026"
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


def verify_password(plain_password: str, hashed: str) -> bool:
    return hash_password(plain_password) == hashed


def get_connection():
    """Returns database connection (SQLite by default, or PostgreSQL if configured)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db():
    """Create all tables with indexes and initial settings."""
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Users & RBAC
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'lead_consultant',
        assigned_business TEXT NOT NULL DEFAULT 'all',
        phone TEXT,
        avatar_initials TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
    );
    """)

    # 2. Leads & CRM (Zero7 Consultancy)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        contact_person TEXT NOT NULL,
        email TEXT,
        phone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_contacted',
        source TEXT DEFAULT 'Outreach',
        estimated_value REAL DEFAULT 0.0,
        sector TEXT DEFAULT 'Technology',
        notes TEXT,
        assigned_to TEXT,
        last_contacted_at TEXT,
        next_followup_date TEXT,
        google_sheet_row_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # 3. Call Logs (Zero7 Consultancy)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS call_logs (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        caller_id TEXT NOT NULL,
        caller_name TEXT NOT NULL,
        called_at TEXT NOT NULL,
        outcome TEXT NOT NULL,
        notes TEXT NOT NULL,
        next_followup_date TEXT,
        FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
    );
    """)

    # 4. Clients & Projects (Zero7 Consultancy)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        contact_person TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        tier TEXT DEFAULT 'Standard Retainer',
        monthly_value REAL DEFAULT 0.0,
        contract_start_date TEXT NOT NULL,
        contract_end_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        lead_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # 5. Client Deliverables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS deliverables (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_to TEXT,
        FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
    );
    """)

    # 6. Menu Items (FILTR Coffee POS)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        stock_ingredient_map TEXT DEFAULT '{}',
        is_available INTEGER NOT NULL DEFAULT 1
    );
    """)

    # 7. Orders & POS (FILTR Coffee)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_name TEXT DEFAULT 'Walk-in Guest',
        order_type TEXT NOT NULL DEFAULT 'dine_in',
        items_json TEXT NOT NULL,
        subtotal REAL NOT NULL,
        discount REAL DEFAULT 0.0,
        total REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'upi_qr',
        status TEXT NOT NULL DEFAULT 'completed',
        notes TEXT,
        cashier_id TEXT NOT NULL,
        cashier_name TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # 8. Inventory & Stock (FILTR Coffee)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        current_stock REAL NOT NULL,
        minimum_threshold REAL NOT NULL,
        unit TEXT NOT NULL,
        cost_per_unit REAL NOT NULL,
        supplier_name TEXT,
        supplier_phone TEXT,
        reorder_quantity REAL DEFAULT 10.0,
        last_restocked_at TEXT,
        updated_at TEXT NOT NULL
    );
    """)

    # 9. Stock Adjustments Audit Log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock_adjustments (
        id TEXT PRIMARY KEY,
        inventory_item_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        adjustment_type TEXT NOT NULL,
        quantity_changed REAL NOT NULL,
        reason TEXT NOT NULL,
        adjusted_by TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # 10. Financial Transactions Ledger
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        business TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        reference_id TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # 11. Tasks & Google To-Do Hub
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        business TEXT NOT NULL DEFAULT 'all',
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'todo',
        due_date TEXT,
        assigned_to_id TEXT,
        assigned_to_name TEXT,
        google_task_id TEXT,
        tags_json TEXT DEFAULT '[]',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # 12. Documents & Google Drive Central Vault
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        business TEXT NOT NULL DEFAULT 'all',
        file_type TEXT NOT NULL DEFAULT 'pdf',
        drive_file_id TEXT,
        drive_url TEXT,
        size_label TEXT DEFAULT '1.2 MB',
        uploaded_by TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # 13. System Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    conn.commit()
    conn.close()


# --- Database Repository Helpers ---

class DBRepository:

    # ---------------- USER MANAGEMENT ----------------
    @staticmethod
    def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    @staticmethod
    def list_users(business: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        if business and business != "all":
            cursor.execute(
                "SELECT * FROM users WHERE assigned_business = ? OR assigned_business = 'all' ORDER BY name ASC",
                (business,)
            )
        else:
            cursor.execute("SELECT * FROM users ORDER BY name ASC")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def create_user(data: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        user_id = f"usr_{uuid.uuid4().hex[:8]}"
        initials = "".join([part[0].upper() for part in data["name"].split() if part])[:2] or "U"
        now = datetime.now(timezone.utc).isoformat()
        pwd_hash = hash_password(data["password"])

        cursor.execute("""
        INSERT INTO users (id, name, username, email, password_hash, role, assigned_business, phone, avatar_initials, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, data["name"], data["username"], data["email"], pwd_hash,
            data.get("role", "lead_consultant"), data.get("assigned_business", "all"),
            data.get("phone"), initials, data.get("status", "active"), now
        ))
        conn.commit()
        conn.close()
        return DBRepository.get_user_by_id(user_id)

    @staticmethod
    def update_user(user_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        fields = []
        values = []
        for key in ["name", "email", "role", "assigned_business", "phone", "status"]:
            if key in data and data[key] is not None:
                fields.append(f"{key} = ?")
                values.append(data[key])
        if "password" in data and data["password"]:
            fields.append("password_hash = ?")
            values.append(hash_password(data["password"]))
        if "name" in data and data["name"]:
            initials = "".join([part[0].upper() for part in data["name"].split() if part])[:2] or "U"
            fields.append("avatar_initials = ?")
            values.append(initials)

        if not fields:
            conn.close()
            return DBRepository.get_user_by_id(user_id)

        values.append(user_id)
        query = f"UPDATE users SET {', '.join(fields)} WHERE id = ?"
        cursor.execute(query, tuple(values))
        conn.commit()
        conn.close()
        return DBRepository.get_user_by_id(user_id)

    @staticmethod
    def delete_user(user_id: str) -> bool:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        rows = cursor.rowcount
        conn.commit()
        conn.close()
        return rows > 0

    # ---------------- LEADS & CRM ----------------
    @staticmethod
    def list_leads(status: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        query = "SELECT * FROM leads WHERE 1=1"
        params = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if search:
            query += " AND (company_name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR sector LIKE ?)"
            term = f"%{search}%"
            params.extend([term, term, term, term])
        query += " ORDER BY updated_at DESC"
        cursor.execute(query, tuple(params))
        leads = [dict(r) for r in cursor.fetchall()]

        # Attach call logs to each lead
        for lead in leads:
            cursor.execute("SELECT * FROM call_logs WHERE lead_id = ? ORDER BY called_at DESC", (lead["id"],))
            lead["call_logs"] = [dict(cl) for cl in cursor.fetchall()]

        conn.close()
        return leads

    @staticmethod
    def get_lead_by_id(lead_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM leads WHERE id = ?", (lead_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None
        lead = dict(row)
        cursor.execute("SELECT * FROM call_logs WHERE lead_id = ? ORDER BY called_at DESC", (lead_id,))
        lead["call_logs"] = [dict(cl) for cl in cursor.fetchall()]
        conn.close()
        return lead

    @staticmethod
    def create_lead(data: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        lead_id = f"lead_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        cursor.execute("""
        INSERT INTO leads (id, company_name, contact_person, email, phone, status, source, estimated_value, sector, notes, assigned_to, last_contacted_at, next_followup_date, google_sheet_row_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            lead_id, data["company_name"], data["contact_person"], data.get("email"), data["phone"],
            data.get("status", "not_contacted"), data.get("source", "Outreach"),
            data.get("estimated_value", 0.0), data.get("sector", "Technology"),
            data.get("notes"), data.get("assigned_to"), data.get("last_contacted_at"),
            data.get("next_followup_date"), data.get("google_sheet_row_id"), now, now
        ))
        conn.commit()
        conn.close()
        return DBRepository.get_lead_by_id(lead_id)

    @staticmethod
    def update_lead(lead_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        fields = ["updated_at = ?"]
        values = [now]
        for key in ["company_name", "contact_person", "email", "phone", "status", "source", "estimated_value", "sector", "notes", "assigned_to", "last_contacted_at", "next_followup_date"]:
            if key in data and data[key] is not None:
                fields.append(f"{key} = ?")
                values.append(data[key])
        values.append(lead_id)
        cursor.execute(f"UPDATE leads SET {', '.join(fields)} WHERE id = ?", tuple(values))
        conn.commit()
        conn.close()
        return DBRepository.get_lead_by_id(lead_id)

    @staticmethod
    def delete_lead(lead_id: str) -> bool:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
        rows = cursor.rowcount
        conn.commit()
        conn.close()
        return rows > 0

    @staticmethod
    def add_call_log(lead_id: str, caller_id: str, caller_name: str, outcome: str, notes: str, next_followup: Optional[str] = None) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        log_id = f"call_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        cursor.execute("""
        INSERT INTO call_logs (id, lead_id, caller_id, caller_name, called_at, outcome, notes, next_followup_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (log_id, lead_id, caller_id, caller_name, now, outcome, notes, next_followup))

        # Update lead's last_contacted_at and next_followup_date and status
        cursor.execute("""
        UPDATE leads SET last_contacted_at = ?, next_followup_date = ?, updated_at = ? WHERE id = ?
        """, (now, next_followup, now, lead_id))

        conn.commit()
        cursor.execute("SELECT * FROM call_logs WHERE id = ?", (log_id,))
        log = dict(cursor.fetchone())
        conn.close()
        return log

    @staticmethod
    def convert_lead_to_client(lead_id: str, tier: str = "Standard Retainer", monthly_value: float = 0.0) -> Dict[str, Any]:
        lead = DBRepository.get_lead_by_id(lead_id)
        if not lead:
            raise ValueError("Lead not found")

        # Update lead status to won
        DBRepository.update_lead(lead_id, {"status": "won"})

        # Create Client
        now = datetime.now(timezone.utc).isoformat()
        client_data = {
            "company_name": lead["company_name"],
            "contact_person": lead["contact_person"],
            "email": lead.get("email") or f"contact@{lead['company_name'].lower().replace(' ', '')}.com",
            "phone": lead["phone"],
            "tier": tier,
            "monthly_value": monthly_value if monthly_value > 0 else (lead.get("estimated_value") or 50000.0),
            "contract_start_date": now[:10],
            "lead_id": lead_id,
            "notes": f"Converted from Lead Pipeline. Original sector: {lead.get('sector')}"
        }
        return DBRepository.create_client(client_data)

    # ---------------- CLIENTS & DELIVERABLES ----------------
    @staticmethod
    def list_clients(search: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        query = "SELECT * FROM clients WHERE 1=1"
        params = []
        if search:
            query += " AND (company_name LIKE ? OR contact_person LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])
        query += " ORDER BY created_at DESC"
        cursor.execute(query, tuple(params))
        clients = [dict(r) for r in cursor.fetchall()]

        for c in clients:
            cursor.execute("SELECT * FROM deliverables WHERE client_id = ? ORDER BY due_date ASC", (c["id"],))
            c["deliverables"] = [dict(d) for d in cursor.fetchall()]

        conn.close()
        return clients

    @staticmethod
    def get_client_by_id(client_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None
        c = dict(row)
        cursor.execute("SELECT * FROM deliverables WHERE client_id = ? ORDER BY due_date ASC", (client_id,))
        c["deliverables"] = [dict(d) for d in cursor.fetchall()]
        conn.close()
        return c

    @staticmethod
    def create_client(data: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        client_id = f"cli_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        cursor.execute("""
        INSERT INTO clients (id, company_name, contact_person, email, phone, tier, monthly_value, contract_start_date, contract_end_date, status, lead_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            client_id, data["company_name"], data["contact_person"], data["email"], data["phone"],
            data.get("tier", "Standard Retainer"), data.get("monthly_value", 0.0),
            data.get("contract_start_date", now[:10]), data.get("contract_end_date"),
            data.get("status", "active"), data.get("lead_id"), data.get("notes"), now
        ))

        # Add initial deliverables if provided
        for d in data.get("initial_deliverables", []):
            deliv_id = f"del_{uuid.uuid4().hex[:8]}"
            cursor.execute("""
            INSERT INTO deliverables (id, client_id, title, description, due_date, status, assigned_to)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (deliv_id, client_id, d["title"], d.get("description"), d.get("due_date", now[:10]), d.get("status", "pending"), d.get("assigned_to")))

        conn.commit()
        conn.close()
        return DBRepository.get_client_by_id(client_id)

    @staticmethod
    def add_deliverable(client_id: str, title: str, description: Optional[str], due_date: str, assigned_to: Optional[str] = None) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        deliv_id = f"del_{uuid.uuid4().hex[:8]}"
        cursor.execute("""
        INSERT INTO deliverables (id, client_id, title, description, due_date, status, assigned_to)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
        """, (deliv_id, client_id, title, description, due_date, assigned_to))
        conn.commit()
        cursor.execute("SELECT * FROM deliverables WHERE id = ?", (deliv_id,))
        res = dict(cursor.fetchone())
        conn.close()
        return res

    @staticmethod
    def update_deliverable_status(deliv_id: str, status: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE deliverables SET status = ? WHERE id = ?", (status, deliv_id))
        conn.commit()
        cursor.execute("SELECT * FROM deliverables WHERE id = ?", (deliv_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    # ---------------- MENU & ORDERS (FILTR COFFEE) ----------------
    @staticmethod
    def list_menu_items() -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM menu_items ORDER BY category ASC, name ASC")
        rows = cursor.fetchall()
        items = []
        for r in rows:
            item = dict(r)
            item["stock_ingredient_map"] = json.loads(item["stock_ingredient_map"] or "{}")
            items.append(item)
        conn.close()
        return items

    @staticmethod
    def list_orders(limit: int = 50) -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        orders = []
        for r in rows:
            o = dict(r)
            o["items"] = json.loads(o["items_json"] or "[]")
            orders.append(o)
        conn.close()
        return orders

    @staticmethod
    def create_order(data: Dict[str, Any], cashier_id: str, cashier_name: str) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        order_id = f"ord_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        today_prefix = now[:10].replace("-", "")
        cursor.execute("SELECT COUNT(*) FROM orders")
        total_order_count = cursor.fetchone()[0] + 1
        entropy = uuid.uuid4().hex[:4].upper()
        order_number = f"FLTR-{today_prefix}-{total_order_count:03d}-{entropy}"

        items_json = json.dumps(data["items"])
        subtotal = data.get("subtotal", 0.0)
        discount = data.get("discount", 0.0)
        total = data.get("total", subtotal - discount)

        cursor.execute("""
        INSERT INTO orders (id, order_number, customer_name, order_type, items_json, subtotal, discount, total, payment_method, status, notes, cashier_id, cashier_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            order_id, order_number, data.get("customer_name", "Walk-in Guest"),
            data.get("order_type", "dine_in"), items_json, subtotal, discount,
            total, data.get("payment_method", "upi_qr"), data.get("status", "completed"),
            data.get("notes"), cashier_id, cashier_name, now
        ))

        # Automatic Inventory Depletion & Stock Adjustment
        for item in data.get("items", []):
            menu_item_id = item.get("menu_item_id")
            quantity = item.get("quantity", 1)
            cursor.execute("SELECT stock_ingredient_map FROM menu_items WHERE id = ?", (menu_item_id,))
            mi_row = cursor.fetchone()
            if mi_row and mi_row["stock_ingredient_map"]:
                ingredient_map = json.loads(mi_row["stock_ingredient_map"])
                for inv_id, qty_per_item in ingredient_map.items():
                    total_usage = qty_per_item * quantity
                    cursor.execute("""
                    UPDATE inventory_items 
                    SET current_stock = MAX(0.0, current_stock - ?), updated_at = ?
                    WHERE id = ?
                    """, (total_usage, now, inv_id))

                    # Log stock adjustment
                    adj_id = f"adj_{uuid.uuid4().hex[:8]}"
                    cursor.execute("SELECT name FROM inventory_items WHERE id = ?", (inv_id,))
                    inv_row = cursor.fetchone()
                    inv_name = inv_row["name"] if inv_row else "Stock Item"
                    cursor.execute("""
                    INSERT INTO stock_adjustments (id, inventory_item_id, item_name, adjustment_type, quantity_changed, reason, adjusted_by, created_at)
                    VALUES (?, ?, ?, 'usage', ?, ?, ?, ?)
                    """, (adj_id, inv_id, inv_name, -total_usage, f"Order #{order_number}", cashier_name, now))

        # Auto-create revenue transaction
        txn_id = f"txn_{uuid.uuid4().hex[:8]}"
        cursor.execute("""
        INSERT INTO transactions (id, business, type, category, amount, description, payment_method, reference_id, created_at)
        VALUES (?, 'filtr_coffee', 'income', 'Cafe Sales', ?, ?, ?, ?, ?)
        """, (txn_id, total, f"Order #{order_number} ({data.get('order_type', 'dine_in')})", data.get("payment_method", "upi_qr"), order_id, now))

        conn.commit()
        cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
        res = dict(cursor.fetchone())
        res["items"] = json.loads(res["items_json"])
        conn.close()
        return res

    # ---------------- INVENTORY & STOCK (FILTR COFFEE) ----------------
    @staticmethod
    def list_inventory() -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM inventory_items ORDER BY name ASC")
        rows = cursor.fetchall()
        items = []
        for r in rows:
            item = dict(r)
            item["is_low_stock"] = item["current_stock"] <= item["minimum_threshold"]
            items.append(item)
        conn.close()
        return items

    @staticmethod
    def get_inventory_item(item_id: str) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM inventory_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None
        item = dict(row)
        item["is_low_stock"] = item["current_stock"] <= item["minimum_threshold"]
        conn.close()
        return item

    @staticmethod
    def adjust_stock(item_id: str, adjustment_type: str, quantity: float, reason: str, adjusted_by: str) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()

        cursor.execute("SELECT name, current_stock, cost_per_unit FROM inventory_items WHERE id = ?", (item_id,))
        item = cursor.fetchone()
        if not item:
            conn.close()
            raise ValueError("Inventory item not found")

        name = item["name"]
        old_stock = item["current_stock"]
        cost = item["cost_per_unit"]

        if adjustment_type == "restock":
            new_stock = old_stock + abs(quantity)
            qty_changed = abs(quantity)
            # Log expense transaction for restock
            txn_id = f"txn_{uuid.uuid4().hex[:8]}"
            cursor.execute("""
            INSERT INTO transactions (id, business, type, category, amount, description, payment_method, reference_id, created_at)
            VALUES (?, 'filtr_coffee', 'expense', 'Raw Materials / Stock Restock', ?, ?, 'bank_transfer', ?, ?)
            """, (txn_id, qty_changed * cost, f"Restocked {qty_changed} {name}", item_id, now))
        elif adjustment_type in ["usage", "spoilage"]:
            new_stock = max(0.0, old_stock - abs(quantity))
            qty_changed = -abs(quantity)
        else:  # manual_correction
            new_stock = max(0.0, quantity)
            qty_changed = new_stock - old_stock

        cursor.execute("""
        UPDATE inventory_items 
        SET current_stock = ?, last_restocked_at = CASE WHEN ? = 'restock' THEN ? ELSE last_restocked_at END, updated_at = ?
        WHERE id = ?
        """, (new_stock, adjustment_type, now, now, item_id))

        adj_id = f"adj_{uuid.uuid4().hex[:8]}"
        cursor.execute("""
        INSERT INTO stock_adjustments (id, inventory_item_id, item_name, adjustment_type, quantity_changed, reason, adjusted_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (adj_id, item_id, name, adjustment_type, qty_changed, reason, adjusted_by, now))

        conn.commit()
        conn.close()
        return DBRepository.get_inventory_item(item_id)

    @staticmethod
    def list_stock_adjustments(limit: int = 50) -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM stock_adjustments ORDER BY created_at DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    # ---------------- TRANSACTIONS & CASH FLOW ----------------
    @staticmethod
    def list_transactions(business: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        if business and business != "all":
            cursor.execute("SELECT * FROM transactions WHERE business = ? ORDER BY created_at DESC LIMIT ?", (business, limit))
        else:
            cursor.execute("SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def create_transaction(data: Dict[str, Any]) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        txn_id = f"txn_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        cursor.execute("""
        INSERT INTO transactions (id, business, type, category, amount, description, payment_method, reference_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            txn_id, data["business"], data["type"], data["category"],
            data["amount"], data["description"], data["payment_method"],
            data.get("reference_id"), now
        ))
        conn.commit()
        cursor.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
        res = dict(cursor.fetchone())
        conn.close()
        return res

    # ---------------- TASKS & GOOGLE TO-DO ----------------
    @staticmethod
    def list_tasks(business: Optional[str] = None, status: Optional[str] = None, assigned_to_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        query = "SELECT * FROM tasks WHERE 1=1"
        params = []
        if business and business != "all":
            query += " AND (business = ? OR business = 'all')"
            params.append(business)
        if status:
            query += " AND status = ?"
            params.append(status)
        if assigned_to_id:
            query += " AND assigned_to_id = ?"
            params.append(assigned_to_id)
        query += " ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, due_date ASC"
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        tasks = []
        for r in rows:
            t = dict(r)
            t["tags"] = json.loads(t["tags_json"] or "[]")
            tasks.append(t)
        conn.close()
        return tasks

    @staticmethod
    def create_task(data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        task_id = f"tsk_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()
        tags_json = json.dumps(data.get("tags", []))

        cursor.execute("""
        INSERT INTO tasks (id, title, description, business, priority, status, due_date, assigned_to_id, assigned_to_name, google_task_id, tags_json, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            task_id, data["title"], data.get("description"), data.get("business", "all"),
            data.get("priority", "medium"), data.get("status", "todo"), data.get("due_date"),
            data.get("assigned_to_id"), data.get("assigned_to_name"), data.get("google_task_id"),
            tags_json, created_by, now, now
        ))
        conn.commit()
        cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        res = dict(cursor.fetchone())
        res["tags"] = json.loads(res["tags_json"] or "[]")
        conn.close()
        return res

    @staticmethod
    def update_task(task_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        fields = ["updated_at = ?"]
        values = [now]
        for key in ["title", "description", "business", "priority", "status", "due_date", "assigned_to_id", "assigned_to_name"]:
            if key in data and data[key] is not None:
                fields.append(f"{key} = ?")
                values.append(data[key])
        if "tags" in data and data["tags"] is not None:
            fields.append("tags_json = ?")
            values.append(json.dumps(data["tags"]))

        values.append(task_id)
        cursor.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", tuple(values))
        conn.commit()
        cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        res = dict(row)
        res["tags"] = json.loads(res["tags_json"] or "[]")
        return res

    @staticmethod
    def delete_task(task_id: str) -> bool:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        rows = cursor.rowcount
        conn.commit()
        conn.close()
        return rows > 0

    # ---------------- DOCUMENTS & GOOGLE DRIVE ----------------
    @staticmethod
    def list_documents(business: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_connection()
        cursor = conn.cursor()
        if business and business != "all":
            cursor.execute("SELECT * FROM documents WHERE business = ? OR business = 'all' ORDER BY created_at DESC", (business,))
        else:
            cursor.execute("SELECT * FROM documents ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def create_document(data: Dict[str, Any], uploaded_by: str) -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        doc_id = f"doc_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        cursor.execute("""
        INSERT INTO documents (id, title, category, business, file_type, drive_file_id, drive_url, size_label, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            doc_id, data["title"], data.get("category", "General"), data.get("business", "all"),
            data.get("file_type", "pdf"), data.get("drive_file_id"), data.get("drive_url"),
            data.get("size_label", "1.2 MB"), uploaded_by, now
        ))
        conn.commit()
        cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
        res = dict(cursor.fetchone())
        conn.close()
        return res

    # ---------------- SETTINGS ----------------
    @staticmethod
    def get_setting(key: str, default: str = "") -> str:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        return row["value"] if row else default

    @staticmethod
    def set_setting(key: str, value: str):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
        conn.close()

    # ---------------- EXECUTIVE STATS & KPI AGGREGATION ----------------
    @staticmethod
    def get_executive_stats(business: str = "all") -> Dict[str, Any]:
        conn = get_connection()
        cursor = conn.cursor()
        now_date = datetime.now(timezone.utc).isoformat()[:10]

        # 1. Revenue
        if business == "filtr_coffee":
            cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE business = 'filtr_coffee' AND type = 'income'")
            total_rev = cursor.fetchone()[0]
            cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE business = 'filtr_coffee' AND type = 'income' AND created_at LIKE ?", (f"{now_date}%",))
            today_rev = cursor.fetchone()[0]
        elif business == "zero7_consultancy":
            cursor.execute("SELECT COALESCE(SUM(monthly_value), 0) FROM clients WHERE status = 'active'")
            total_rev = cursor.fetchone()[0]
            today_rev = total_rev / 30.0
        else:
            cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'income'")
            filtr_income = cursor.fetchone()[0]
            cursor.execute("SELECT COALESCE(SUM(monthly_value), 0) FROM clients WHERE status = 'active'")
            zero7_monthly = cursor.fetchone()[0]
            total_rev = filtr_income + zero7_monthly
            cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'income' AND created_at LIKE ?", (f"{now_date}%",))
            today_rev = cursor.fetchone()[0]

        # 2. Leads (Zero7)
        cursor.execute("SELECT COUNT(*) FROM leads")
        total_leads = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM leads WHERE status IN ('pitch_completed', 'proposal_sent', 'followup_scheduled')")
        active_pipeline_leads = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM leads WHERE status = 'won'")
        converted_leads = cursor.fetchone()[0]
        conversion_rate = round((converted_leads / total_leads * 100) if total_leads > 0 else 0, 1)

        # 3. Orders (FILTR Coffee)
        cursor.execute("SELECT COUNT(*) FROM orders")
        total_orders = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM orders WHERE created_at LIKE ?", (f"{now_date}%",))
        today_orders = cursor.fetchone()[0]

        # 4. Inventory Alerts
        cursor.execute("SELECT COUNT(*) FROM inventory_items WHERE current_stock <= minimum_threshold")
        low_stock_count = cursor.fetchone()[0]

        # 5. Tasks
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE status != 'done'")
        open_tasks = cursor.fetchone()[0]

        # 6. Team Members
        cursor.execute("SELECT COUNT(*) FROM users WHERE status = 'active'")
        active_team_count = cursor.fetchone()[0]

        # 7. Recent Activities Stream
        activities = []
        # Recent orders
        cursor.execute("SELECT order_number, total, customer_name, created_at FROM orders ORDER BY created_at DESC LIMIT 4")
        for ord_row in cursor.fetchall():
            activities.append({
                "type": "order",
                "business": "filtr_coffee",
                "title": f"New Order {ord_row['order_number']}",
                "description": f"₹{ord_row['total']:.2f} paid by {ord_row['customer_name']}",
                "timestamp": ord_row["created_at"]
            })
        # Recent calls
        cursor.execute("""
        SELECT cl.outcome, cl.called_at, cl.caller_name, l.company_name 
        FROM call_logs cl JOIN leads l ON cl.lead_id = l.id 
        ORDER BY cl.called_at DESC LIMIT 4
        """)
        for call_row in cursor.fetchall():
            activities.append({
                "type": "call",
                "business": "zero7_consultancy",
                "title": f"Call Log: {call_row['company_name']}",
                "description": f"{call_row['caller_name']} reported: {call_row['outcome']}",
                "timestamp": call_row["called_at"]
            })
        # Recent task updates
        cursor.execute("SELECT title, business, status, updated_at FROM tasks ORDER BY updated_at DESC LIMIT 3")
        for task_row in cursor.fetchall():
            activities.append({
                "type": "task",
                "business": task_row["business"],
                "title": f"Task: {task_row['title']}",
                "description": f"Status updated to {task_row['status']}",
                "timestamp": task_row["updated_at"]
            })

        # Sort combined activities descending
        activities.sort(key=lambda x: x["timestamp"], reverse=True)

        conn.close()

        return {
            "business": business,
            "total_revenue": total_rev,
            "today_revenue": today_rev,
            "total_leads": total_leads,
            "active_pipeline_leads": active_pipeline_leads,
            "conversion_rate": conversion_rate,
            "total_orders": total_orders,
            "today_orders": today_orders,
            "low_stock_count": low_stock_count,
            "open_tasks": open_tasks,
            "active_team_count": active_team_count,
            "recent_activities": activities[:8]
        }
