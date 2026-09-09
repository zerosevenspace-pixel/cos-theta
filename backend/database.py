import sqlite3
import uuid
import datetime

DB_PATH = 'zero7_crm.db'

def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            role TEXT,
            created_at TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            business_name TEXT,
            phone TEXT,
            email TEXT,
            source TEXT,
            status TEXT,
            assigned_to TEXT,
            meta_form_id TEXT,
            meta_ad_name TEXT,
            priority TEXT DEFAULT 'medium',
            deal_value REAL,
            next_action TEXT,
            next_action_date TEXT,
            last_contacted_at TIMESTAMP,
            created_at TIMESTAMP,
            updated_at TIMESTAMP,
            FOREIGN KEY (assigned_to) REFERENCES users (id)
        );
        CREATE TABLE IF NOT EXISTS deals (
            id TEXT PRIMARY KEY,
            lead_id TEXT,
            title TEXT,
            value REAL,
            stage TEXT,
            assigned_to TEXT,
            expected_close TEXT,
            notes TEXT,
            created_at TIMESTAMP,
            updated_at TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id),
            FOREIGN KEY (assigned_to) REFERENCES users (id)
        );
        CREATE TABLE IF NOT EXISTS call_logs (
            id TEXT PRIMARY KEY,
            lead_id TEXT,
            user_id TEXT,
            outcome TEXT,
            notes TEXT,
            duration_minutes INTEGER,
            called_at TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            lead_id TEXT,
            user_id TEXT,
            content TEXT NOT NULL,
            created_at TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
    ''')
    conn.commit()
    conn.close()

class Repository:
    @staticmethod
    def now():
        return datetime.datetime.utcnow().isoformat()

    @staticmethod
    def _execute(query, params=(), commit=False, fetchone=False, fetchall=False):
        conn = get_connection()
        c = conn.cursor()
        c.execute(query, params)
        if commit:
            conn.commit()
        res = None
        if fetchone:
            res = c.fetchone()
            if res:
                res = dict(res)
        elif fetchall:
            res = c.fetchall()
            if res:
                res = [dict(row) for row in res]
            else:
                res = []
        conn.close()
        return res

    @staticmethod
    def get_user_by_email(email: str):
        return Repository._execute("SELECT * FROM users WHERE email = ?", (email,), fetchone=True)

    @staticmethod
    def get_user(user_id: str):
        return Repository._execute("SELECT * FROM users WHERE id = ?", (user_id,), fetchone=True)

    @staticmethod
    def create_user(name: str, email: str, password_hash: str, role: str):
        user_id = 'usr_' + uuid.uuid4().hex[:8]
        Repository._execute(
            "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, name, email, password_hash, role, Repository.now()),
            commit=True
        )
        return Repository.get_user(user_id)

    @staticmethod
    def list_users():
        return Repository._execute("SELECT id, name, email, role, created_at FROM users", fetchall=True)

    @staticmethod
    def create_lead(data: dict):
        lead_id = 'lead_' + uuid.uuid4().hex[:8]
        now = Repository.now()
        Repository._execute(
            """INSERT INTO leads (id, name, business_name, phone, email, source, status, assigned_to, 
            meta_form_id, meta_ad_name, priority, deal_value, next_action, next_action_date, 
            last_contacted_at, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                lead_id, data.get('name'), data.get('business_name'), data.get('phone'), data.get('email'),
                data.get('source', 'manual'), data.get('status', 'new'), data.get('assigned_to'),
                data.get('meta_form_id'), data.get('meta_ad_name'), data.get('priority', 'medium'),
                data.get('deal_value'), data.get('next_action'), data.get('next_action_date'),
                None, now, now
            ),
            commit=True
        )
        return Repository.get_lead(lead_id)

    @staticmethod
    def get_lead(lead_id: str):
        return Repository._execute("SELECT * FROM leads WHERE id = ?", (lead_id,), fetchone=True)

    @staticmethod
    def update_lead(lead_id: str, data: dict):
        current = Repository.get_lead(lead_id)
        if not current: return None
        
        updates = []
        params = []
        for key, val in data.items():
            if val is not None:
                updates.append(f"{key} = ?")
                params.append(val)
        if updates:
            updates.append("updated_at = ?")
            params.append(Repository.now())
            query = f"UPDATE leads SET {', '.join(updates)} WHERE id = ?"
            params.append(lead_id)
            Repository._execute(query, tuple(params), commit=True)
        return Repository.get_lead(lead_id)

    @staticmethod
    def delete_lead(lead_id: str):
        Repository._execute("DELETE FROM notes WHERE lead_id = ?", (lead_id,), commit=True)
        Repository._execute("DELETE FROM call_logs WHERE lead_id = ?", (lead_id,), commit=True)
        Repository._execute("DELETE FROM deals WHERE lead_id = ?", (lead_id,), commit=True)
        Repository._execute("DELETE FROM leads WHERE id = ?", (lead_id,), commit=True)

    @staticmethod
    def list_leads(filters: dict = None):
        query = "SELECT * FROM leads"
        params = []
        if filters:
            conds = []
            for k, v in filters.items():
                if v:
                    conds.append(f"{k} = ?")
                    params.append(v)
            if conds:
                query += " WHERE " + " AND ".join(conds)
        query += " ORDER BY created_at DESC"
        return Repository._execute(query, tuple(params), fetchall=True)

    @staticmethod
    def create_deal(data: dict):
        deal_id = 'deal_' + uuid.uuid4().hex[:8]
        now = Repository.now()
        Repository._execute(
            """INSERT INTO deals (id, lead_id, title, value, stage, assigned_to, expected_close, notes, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                deal_id, data.get('lead_id'), data.get('title'), data.get('value'),
                data.get('stage', 'discovery'), data.get('assigned_to'),
                data.get('expected_close'), data.get('notes'), now, now
            ),
            commit=True
        )
        return Repository.get_deal(deal_id)

    @staticmethod
    def get_deal(deal_id: str):
        return Repository._execute("SELECT * FROM deals WHERE id = ?", (deal_id,), fetchone=True)

    @staticmethod
    def update_deal(deal_id: str, data: dict):
        updates = []
        params = []
        for key, val in data.items():
            if val is not None:
                updates.append(f"{key} = ?")
                params.append(val)
        if updates:
            updates.append("updated_at = ?")
            params.append(Repository.now())
            query = f"UPDATE deals SET {', '.join(updates)} WHERE id = ?"
            params.append(deal_id)
            Repository._execute(query, tuple(params), commit=True)
        return Repository.get_deal(deal_id)

    @staticmethod
    def list_deals(filters: dict = None):
        query = "SELECT * FROM deals"
        params = []
        if filters:
            conds = []
            for k, v in filters.items():
                if v:
                    conds.append(f"{k} = ?")
                    params.append(v)
            if conds:
                query += " WHERE " + " AND ".join(conds)
        query += " ORDER BY created_at DESC"
        return Repository._execute(query, tuple(params), fetchall=True)

    @staticmethod
    def log_call(data: dict):
        call_id = 'call_' + uuid.uuid4().hex[:8]
        now = Repository.now()
        Repository._execute(
            "INSERT INTO call_logs (id, lead_id, user_id, outcome, notes, duration_minutes, called_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (call_id, data.get('lead_id'), data.get('user_id'), data.get('outcome'), data.get('notes'), data.get('duration_minutes'), now),
            commit=True
        )
        # Update lead last_contacted_at
        Repository._execute("UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?", (now, now, data.get('lead_id')), commit=True)
        return Repository._execute("SELECT * FROM call_logs WHERE id = ?", (call_id,), fetchone=True)

    @staticmethod
    def add_note(data: dict):
        note_id = 'note_' + uuid.uuid4().hex[:8]
        now = Repository.now()
        Repository._execute(
            "INSERT INTO notes (id, lead_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (note_id, data.get('lead_id'), data.get('user_id'), data.get('content'), now),
            commit=True
        )
        return Repository._execute("SELECT * FROM notes WHERE id = ?", (note_id,), fetchone=True)

    @staticmethod
    def get_lead_activity(lead_id: str):
        calls = Repository._execute("""
            SELECT c.id, 'call' as type, c.outcome, c.notes, c.duration_minutes, c.called_at as date, c.user_id, u.name as user_name 
            FROM call_logs c 
            LEFT JOIN users u ON c.user_id = u.id 
            WHERE c.lead_id = ?
        """, (lead_id,), fetchall=True)
        notes = Repository._execute("""
            SELECT n.id, 'note' as type, null as outcome, n.content as notes, null as duration_minutes, n.created_at as date, n.user_id, u.name as user_name 
            FROM notes n 
            LEFT JOIN users u ON n.user_id = u.id 
            WHERE n.lead_id = ?
        """, (lead_id,), fetchall=True)
        activities = calls + notes
        activities.sort(key=lambda x: x['date'] if x['date'] else '', reverse=True)
        return activities

init_db()
