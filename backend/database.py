import sqlite3
import uuid
import datetime
import json

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
            city TEXT,
            temperature TEXT DEFAULT 'warm',
            call_stage TEXT DEFAULT 'first_call',
            source TEXT,
            status TEXT,
            assigned_to TEXT,
            meta_form_id TEXT,
            meta_ad_name TEXT,
            priority TEXT DEFAULT 'medium',
            deal_value REAL,
            next_action TEXT,
            next_action_date TEXT,
            last_update_notes TEXT,
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
            city TEXT,
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
        CREATE TABLE IF NOT EXISTS whatsapp_accounts (
            id TEXT PRIMARY KEY,
            phone_number TEXT UNIQUE NOT NULL,
            label TEXT,
            is_active INTEGER DEFAULT 1,
            last_synced_at TEXT,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id TEXT PRIMARY KEY,
            account_id TEXT,
            account_phone TEXT NOT NULL,
            lead_phone TEXT NOT NULL,
            lead_id TEXT,
            direction TEXT NOT NULL,
            message_text TEXT,
            message_type TEXT DEFAULT 'text',
            media_caption TEXT,
            timestamp TEXT NOT NULL,
            wa_message_id TEXT UNIQUE,
            status TEXT DEFAULT 'delivered',
            created_at TEXT,
            FOREIGN KEY (lead_id) REFERENCES leads (id)
        );
    ''')

    # Safe migrations for existing DBs
    lead_cols = [
        ("city", "TEXT"),
        ("temperature", "TEXT DEFAULT 'warm'"),
        ("call_stage", "TEXT DEFAULT 'first_call'"),
        ("last_update_notes", "TEXT"),
        ("channel_data", "TEXT")
    ]
    for col, col_type in lead_cols:
        try:
            c.execute(f"ALTER TABLE leads ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass

    try:
        c.execute("ALTER TABLE deals ADD COLUMN city TEXT")
    except sqlite3.OperationalError:
        pass

    # Safe migrations for website field
    try:
        c.execute("ALTER TABLE leads ADD COLUMN website TEXT")
    except sqlite3.OperationalError:
        pass

    # Safe migrations for call recording fields
    recording_cols = [
        ("recording_file_name", "TEXT"),
        ("recording_mime_type", "TEXT"),
        ("recording_size_bytes", "INTEGER"),
        ("recording_duration_secs", "INTEGER"),
    ]
    for col, col_type in recording_cols:
        try:
            c.execute(f"ALTER TABLE call_logs ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass

    # Safe migrations for Google Drive fields
    drive_cols = [
        ("recording_drive_file_id", "TEXT"),
        ("recording_drive_url", "TEXT"),
    ]
    for col, col_type in drive_cols:
        try:
            c.execute(f"ALTER TABLE call_logs ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass

    # Safe migrations for transcription fields
    transcription_cols = [
        ("transcription_text", "TEXT"),
        ("transcription_drive_file_id", "TEXT"),
        ("transcription_confidence", "REAL"),
        ("transcription_language", "TEXT"),
    ]
    for col, col_type in transcription_cols:
        try:
            c.execute(f"ALTER TABLE call_logs ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass

    # Performance indexes for WhatsApp messages
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_wa_messages_lead ON whatsapp_messages(lead_id)",
        "CREATE INDEX IF NOT EXISTS idx_wa_messages_phone ON whatsapp_messages(lead_phone)",
        "CREATE INDEX IF NOT EXISTS idx_wa_messages_ts ON whatsapp_messages(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_wa_messages_account ON whatsapp_messages(account_phone)",
    ]
    for idx in indexes:
        try:
            c.execute(idx)
        except sqlite3.OperationalError:
            pass

    conn.commit()
    conn.close()

    # Enable WAL mode for better concurrent read/write performance
    try:
        wal_conn = get_connection()
        wal_conn.execute("PRAGMA journal_mode=WAL")
        wal_conn.close()
    except Exception:
        pass


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
    def update_user(user_id: str, data: dict):
        current = Repository.get_user(user_id)
        if not current:
            return None
        updates = []
        params = []
        for key in ['name', 'email', 'role', 'password_hash']:
            if key in data and data[key] is not None:
                updates.append(f"{key} = ?")
                params.append(data[key])
        if updates:
            query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
            params.append(user_id)
            Repository._execute(query, tuple(params), commit=True)
        return Repository.get_user(user_id)

    @staticmethod
    def delete_user(user_id: str):
        Repository._execute("UPDATE leads SET assigned_to = NULL WHERE assigned_to = ?", (user_id,), commit=True)
        Repository._execute("UPDATE deals SET assigned_to = NULL WHERE assigned_to = ?", (user_id,), commit=True)
        Repository._execute("DELETE FROM users WHERE id = ?", (user_id,), commit=True)

    @staticmethod
    def list_users():
        users = Repository._execute("SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC", fetchall=True)
        for u in users:
            uid = u['id']
            lead_res = Repository._execute("SELECT COUNT(*) as count FROM leads WHERE assigned_to = ?", (uid,), fetchone=True)
            u['assigned_leads_count'] = lead_res['count'] if lead_res else 0

            deal_res = Repository._execute("SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as total_val FROM deals WHERE assigned_to = ?", (uid,), fetchone=True)
            u['assigned_deals_count'] = deal_res['count'] if deal_res else 0
            u['pipeline_value'] = float(deal_res['total_val']) if deal_res else 0.0
        return users

    @staticmethod
    def _format_lead(lead):
        if not lead:
            return None
        d = dict(lead)
        if 'channel_data' in d and d['channel_data']:
            if isinstance(d['channel_data'], str):
                try:
                    d['channel_data'] = json.loads(d['channel_data'])
                except Exception:
                    pass
        else:
            d['channel_data'] = None
        return d

    @staticmethod
    def create_lead(data: dict):
        lead_id = 'lead_' + uuid.uuid4().hex[:8]
        now = Repository.now()
        channel_data = data.get('channel_data')
        if isinstance(channel_data, dict):
            channel_data_str = json.dumps(channel_data)
        elif isinstance(channel_data, str):
            channel_data_str = channel_data
        else:
            channel_data_str = None

        Repository._execute(
            """INSERT INTO leads (id, name, business_name, phone, email, city, temperature, call_stage, source, status, assigned_to, 
            meta_form_id, meta_ad_name, priority, deal_value, next_action, next_action_date, last_update_notes, 
            channel_data, last_contacted_at, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                lead_id, data.get('name'), data.get('business_name'), data.get('phone'), data.get('email'),
                data.get('city'), data.get('temperature', 'warm'), data.get('call_stage', 'first_call'),
                data.get('source', 'manual'), data.get('status', 'new'), data.get('assigned_to'),
                data.get('meta_form_id'), data.get('meta_ad_name'), data.get('priority', 'medium'),
                data.get('deal_value'), data.get('next_action'), data.get('next_action_date'), data.get('last_update_notes'),
                channel_data_str, None, now, now
            ),
            commit=True
        )
        return Repository.get_lead(lead_id)

    @staticmethod
    def bulk_create_leads(leads_list: list):
        created = []
        for d in leads_list:
            created.append(Repository.create_lead(d))
        return created

    @staticmethod
    def get_lead(lead_id: str):
        row = Repository._execute("SELECT * FROM leads WHERE id = ?", (lead_id,), fetchone=True)
        return Repository._format_lead(row)

    @staticmethod
    def update_lead(lead_id: str, data: dict):
        current = Repository.get_lead(lead_id)
        if not current: return None
        
        updates = []
        params = []
        for key, val in data.items():
            if val is not None:
                if key == 'channel_data' and isinstance(val, dict):
                    val = json.dumps(val)
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
        rows = Repository._execute(query, tuple(params), fetchall=True)
        return [Repository._format_lead(r) for r in rows]

    @staticmethod
    def create_deal(data: dict):
        deal_id = 'deal_' + uuid.uuid4().hex[:8]
        now = Repository.now()
        Repository._execute(
            """INSERT INTO deals (id, lead_id, title, value, stage, city, assigned_to, expected_close, notes, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                deal_id, data.get('lead_id'), data.get('title'), data.get('value'),
                data.get('stage', 'discovery'), data.get('city'), data.get('assigned_to'),
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
            "INSERT INTO call_logs (id, lead_id, user_id, outcome, notes, duration_minutes, called_at, recording_file_name, recording_mime_type, recording_size_bytes, recording_duration_secs, recording_drive_file_id, recording_drive_url, transcription_text, transcription_drive_file_id, transcription_confidence, transcription_language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (call_id, data.get('lead_id'), data.get('user_id'), data.get('outcome'), data.get('notes'), data.get('duration_minutes'), now,
             data.get('recording_file_name'), data.get('recording_mime_type'), data.get('recording_size_bytes'), data.get('recording_duration_secs'),
             data.get('recording_drive_file_id'), data.get('recording_drive_url'),
             data.get('transcription_text'), data.get('transcription_drive_file_id'), data.get('transcription_confidence'), data.get('transcription_language')),
            commit=True
        )
        # Update lead last_contacted_at
        Repository._execute("UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?", (now, now, data.get('lead_id')), commit=True)
        return Repository._execute("SELECT * FROM call_logs WHERE id = ?", (call_id,), fetchone=True)

    @staticmethod
    def update_call_transcription(call_id: str, transcription_text: str, drive_file_id: str = None, confidence: float = None, language: str = None):
        """Update transcription data for an existing call log."""
        Repository._execute(
            "UPDATE call_logs SET transcription_text = ?, transcription_drive_file_id = ?, transcription_confidence = ?, transcription_language = ? WHERE id = ?",
            (transcription_text, drive_file_id, confidence, language, call_id),
            commit=True
        )
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
            SELECT c.id, 'call' as type, c.outcome, c.notes, c.duration_minutes, c.called_at as date, c.user_id, u.name as user_name,
                   c.recording_file_name, c.recording_mime_type, c.recording_size_bytes, c.recording_duration_secs,
                   c.recording_drive_file_id, c.recording_drive_url,
                   c.transcription_text, c.transcription_confidence, c.transcription_language
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

    @staticmethod
    def normalize_phone(phone):
        """Normalize phone to last 10 digits."""
        if not phone:
            return ''
        digits = ''.join(c for c in phone if c.isdigit())
        return digits[-10:] if len(digits) >= 10 else digits

    @staticmethod
    def get_all_lead_phones():
        """Return all normalized lead phone numbers with their IDs."""
        leads = Repository._execute("SELECT id, phone FROM leads WHERE phone IS NOT NULL AND phone != ''", fetchall=True)
        result = {}
        for l in leads:
            normalized = Repository.normalize_phone(l['phone'])
            if normalized:
                result[normalized] = l['id']
        return result

    @staticmethod
    def register_whatsapp_account(phone_number, label=''):
        acc_id = 'wa_' + uuid.uuid4().hex[:8]
        now = Repository.now()
        try:
            Repository._execute(
                "INSERT INTO whatsapp_accounts (id, phone_number, label, is_active, created_at) VALUES (?, ?, ?, 1, ?)",
                (acc_id, phone_number, label, now), commit=True
            )
        except Exception:
            # Already exists, update label
            Repository._execute(
                "UPDATE whatsapp_accounts SET label = ?, is_active = 1 WHERE phone_number = ?",
                (label, phone_number), commit=True
            )
        return Repository._execute("SELECT * FROM whatsapp_accounts WHERE phone_number = ?", (phone_number,), fetchone=True)

    @staticmethod
    def get_whatsapp_accounts():
        return Repository._execute("SELECT * FROM whatsapp_accounts WHERE is_active = 1 ORDER BY label", fetchall=True)

    @staticmethod
    def sync_whatsapp_messages(account_phone, messages):
        """Batch insert messages, skipping duplicates by wa_message_id."""
        phone_map = Repository.get_all_lead_phones()
        account = Repository._execute("SELECT id FROM whatsapp_accounts WHERE phone_number = ?", (account_phone,), fetchone=True)
        account_id = account['id'] if account else None
        now = Repository.now()
        inserted = 0
        for msg in messages:
            lead_phone_norm = Repository.normalize_phone(msg.get('lead_phone', ''))
            lead_id = phone_map.get(lead_phone_norm)
            if not lead_id:
                continue  # Skip messages not matching any CRM lead
            msg_id = 'wamsg_' + uuid.uuid4().hex[:8]
            try:
                Repository._execute(
                    """INSERT INTO whatsapp_messages 
                    (id, account_id, account_phone, lead_phone, lead_id, direction, message_text, message_type, media_caption, timestamp, wa_message_id, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (msg_id, account_id, account_phone, lead_phone_norm, lead_id,
                     msg.get('direction', 'out'), msg.get('message_text', ''),
                     msg.get('message_type', 'text'), msg.get('media_caption'),
                     msg.get('timestamp', now), msg.get('wa_message_id'),
                     msg.get('status', 'delivered'), now),
                    commit=True
                )
                inserted += 1
            except Exception:
                pass  # Duplicate wa_message_id, skip
        # Update last_synced_at
        Repository._execute(
            "UPDATE whatsapp_accounts SET last_synced_at = ? WHERE phone_number = ?",
            (now, account_phone), commit=True
        )
        return inserted

    @staticmethod
    def get_whatsapp_conversation(lead_id, account_phone=None):
        """Get WhatsApp messages for a lead, optionally filtered by account."""
        if account_phone:
            messages = Repository._execute(
                "SELECT * FROM whatsapp_messages WHERE lead_id = ? AND account_phone = ? ORDER BY timestamp ASC",
                (lead_id, account_phone), fetchall=True
            )
        else:
            messages = Repository._execute(
                "SELECT * FROM whatsapp_messages WHERE lead_id = ? ORDER BY timestamp ASC",
                (lead_id,), fetchall=True
            )
        return messages

    @staticmethod
    def get_whatsapp_accounts_for_lead(lead_id):
        """Get all WhatsApp accounts that have conversations with this lead."""
        return Repository._execute("""
            SELECT DISTINCT wa.id, wa.phone_number, wa.label
            FROM whatsapp_accounts wa
            INNER JOIN whatsapp_messages wm ON wa.phone_number = wm.account_phone
            WHERE wm.lead_id = ?
            ORDER BY wa.label
        """, (lead_id,), fetchall=True)

init_db()
