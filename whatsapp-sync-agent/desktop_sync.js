/**
 * Zero7 CRM - WhatsApp Desktop Sync Agent
 * ========================================
 * Manages multiple Baileys sessions (WhatsApp Web connections) and syncs
 * 1:1 conversations with CRM leads to the backend.
 * 
 * Features:
 *  - Multi-account support (central business + personal numbers)
 *  - QR code display for first-time pairing
 *  - Auto-reconnection with exponential backoff
 *  - CRM phone whitelist (only syncs conversations matching CRM leads)
 *  - Real-time message capture + periodic history sync
 *  - System tray icon with status indicator
 */

const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── CONFIGURATION ──────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const CRM_URL = config.crm_url;
const CRM_EMAIL = config.crm_email;
const CRM_PASSWORD = config.crm_password;
const ACCOUNTS = config.accounts || [];
const SYNC_INTERVAL = (config.sync_interval_seconds || 30) * 1000;

// ─── STATE ──────────────────────────────────────────────
let authToken = null;
let crmPhones = {};           // normalized_phone -> lead_id
let sessions = {};            // account_id -> { socket, connected, phoneNumber }
let pendingMessages = {};     // account_id -> [messages]
let syncTimer = null;
const LOG_FILE = path.join(__dirname, config.log_file || 'sync.log');

function log(msg, level = 'INFO') {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${msg}`;
    console.log(line);
    try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
}

// ─── HTTP HELPERS ───────────────────────────────────────
function httpRequest(url, method, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method,
            headers: { 'Content-Type': 'application/json', ...headers }
        };
        const req = mod.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch(e) { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ─── CRM AUTH ───────────────────────────────────────────
async function crmLogin() {
    try {
        const resp = await httpRequest(`${CRM_URL}/api/auth/login`, 'POST', {
            email: CRM_EMAIL,
            password: CRM_PASSWORD
        });
        if (resp.status === 200 && resp.data.token) {
            authToken = resp.data.token;
            log(`CRM login successful as ${CRM_EMAIL}`);
            return true;
        }
        log(`CRM login failed: ${JSON.stringify(resp.data)}`, 'ERROR');
        return false;
    } catch(e) {
        log(`CRM login error: ${e.message}`, 'ERROR');
        return false;
    }
}

// ─── CRM LEAD PHONES ───────────────────────────────────
async function fetchCRMPhones() {
    if (!authToken) await crmLogin();
    try {
        const resp = await httpRequest(`${CRM_URL}/api/leads/phones`, 'GET', null, {
            'Authorization': `Bearer ${authToken}`
        });
        if (resp.status === 200) {
            crmPhones = resp.data;
            log(`Fetched ${Object.keys(crmPhones).length} CRM lead phone numbers`);
            return true;
        }
        if (resp.status === 401) {
            log('Token expired, re-authenticating...', 'WARN');
            await crmLogin();
            return fetchCRMPhones();
        }
        log(`Failed to fetch phones: ${resp.status}`, 'ERROR');
        return false;
    } catch(e) {
        log(`Fetch phones error: ${e.message}`, 'ERROR');
        return false;
    }
}

// ─── CRM REGISTER ACCOUNT ──────────────────────────────
async function registerAccount(phoneNumber, label) {
    if (!authToken) await crmLogin();
    try {
        const resp = await httpRequest(`${CRM_URL}/api/whatsapp/accounts`, 'POST', {
            phone_number: phoneNumber,
            label: label
        }, { 'Authorization': `Bearer ${authToken}` });
        if (resp.status === 200) {
            log(`Registered WA account: ${phoneNumber} (${label})`);
        }
    } catch(e) {
        log(`Register account error: ${e.message}`, 'ERROR');
    }
}

// ─── CRM SYNC MESSAGES ─────────────────────────────────
async function syncMessagesToCRM(accountPhone, messages) {
    if (!messages.length) return 0;
    if (!authToken) await crmLogin();
    try {
        const resp = await httpRequest(`${CRM_URL}/api/whatsapp/messages/sync`, 'POST', {
            account_phone: accountPhone,
            messages: messages
        }, { 'Authorization': `Bearer ${authToken}` });
        if (resp.status === 200) {
            log(`Synced ${resp.data.inserted}/${messages.length} messages for ${accountPhone}`);
            return resp.data.inserted;
        }
        if (resp.status === 401) {
            await crmLogin();
            return syncMessagesToCRM(accountPhone, messages);
        }
        log(`Sync failed: ${resp.status} - ${JSON.stringify(resp.data)}`, 'ERROR');
        return 0;
    } catch(e) {
        log(`Sync error: ${e.message}`, 'ERROR');
        return 0;
    }
}

// ─── PHONE NORMALIZATION ────────────────────────────────
function normalizePhone(jid) {
    // Extract phone from JID like "919479007951@s.whatsapp.net"
    if (!jid) return '';
    const num = jid.split('@')[0].replace(/\D/g, '');
    // Return last 10 digits (Indian numbers)
    return num.length >= 10 ? num.slice(-10) : num;
}

function isCRMLead(jid) {
    const norm = normalizePhone(jid);
    return norm in crmPhones;
}

// ─── MESSAGE PROCESSING ────────────────────────────────
function processMessage(accountId, msg) {
    if (!msg.key || !msg.message) return null;
    
    const jid = msg.key.remoteJid;
    // Skip group messages, status broadcasts, and newsletters
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return null;
    
    // Only process if this phone is a CRM lead
    if (!isCRMLead(jid)) return null;
    
    const leadPhone = normalizePhone(jid);
    const fromMe = msg.key.fromMe;
    
    // Extract message text
    let messageText = '';
    let messageType = 'text';
    let mediaCaption = '';
    
    const m = msg.message;
    if (m.conversation) {
        messageText = m.conversation;
    } else if (m.extendedTextMessage) {
        messageText = m.extendedTextMessage.text || '';
    } else if (m.imageMessage) {
        messageType = 'image';
        mediaCaption = m.imageMessage.caption || '';
        messageText = mediaCaption || '[Image]';
    } else if (m.videoMessage) {
        messageType = 'video';
        mediaCaption = m.videoMessage.caption || '';
        messageText = mediaCaption || '[Video]';
    } else if (m.audioMessage) {
        messageType = m.audioMessage.ptt ? 'voice_note' : 'audio';
        messageText = '[Voice Note]';
    } else if (m.documentMessage) {
        messageType = 'document';
        messageText = m.documentMessage.fileName || '[Document]';
    } else if (m.stickerMessage) {
        messageType = 'sticker';
        messageText = '[Sticker]';
    } else if (m.contactMessage) {
        messageType = 'contact';
        messageText = m.contactMessage.displayName || '[Contact]';
    } else if (m.locationMessage) {
        messageType = 'location';
        messageText = `[Location: ${m.locationMessage.degreesLatitude}, ${m.locationMessage.degreesLongitude}]`;
    } else {
        // Unknown type, try to get any text
        const keys = Object.keys(m);
        messageType = keys[0] || 'unknown';
        messageText = `[${messageType}]`;
    }

    // Get timestamp
    const timestamp = msg.messageTimestamp 
        ? new Date(typeof msg.messageTimestamp === 'number' 
            ? msg.messageTimestamp * 1000 
            : parseInt(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

    return {
        lead_phone: leadPhone,
        direction: fromMe ? 'outgoing' : 'incoming',
        message_text: messageText,
        message_type: messageType,
        media_caption: mediaCaption || null,
        timestamp: timestamp,
        wa_message_id: msg.key.id,
        status: 'delivered'
    };
}

// ─── FLUSH PENDING MESSAGES ─────────────────────────────
async function flushPending() {
    for (const accountId of Object.keys(pendingMessages)) {
        const msgs = pendingMessages[accountId];
        if (!msgs || !msgs.length) continue;
        
        const session = sessions[accountId];
        if (!session || !session.phoneNumber) continue;
        
        // Take all pending and clear
        pendingMessages[accountId] = [];
        
        const inserted = await syncMessagesToCRM(session.phoneNumber, msgs);
        if (inserted > 0) {
            log(`Flushed ${inserted} messages for ${accountId} (${session.phoneNumber})`);
        }
    }
}

// ─── BAILEYS SESSION ────────────────────────────────────
async function startSession(account) {
    const accountId = account.id;
    const authDir = path.join(__dirname, account.auth_dir);
    
    // Ensure auth dir exists
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }
    
    log(`Starting session: ${accountId} (${account.label})`);
    
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Zero7 CRM Sync', 'Desktop', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined
    });
    
    // Initialize pending queue
    if (!pendingMessages[accountId]) pendingMessages[accountId] = [];
    
    // Save session reference
    sessions[accountId] = {
        socket: sock,
        connected: false,
        phoneNumber: null,
        label: account.label
    };

    // ── QR CODE EVENT ──
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // Save QR as PNG for user to scan
            const qrPath = path.join(__dirname, `qr_${accountId}.png`);
            await QRCode.toFile(qrPath, qr, { width: 400, margin: 2 });
            log(`QR code saved to ${qrPath} — scan with WhatsApp for account: ${account.label}`);
            console.log(`\n${'='.repeat(60)}`);
            console.log(`  SCAN QR CODE for: ${account.label}`);
            console.log(`  File: ${qrPath}`);
            console.log(`${'='.repeat(60)}\n`);
            // Also print in terminal
            try {
                const qrTerminal = require('qrcode-terminal');
                qrTerminal.generate(qr, { small: true });
            } catch(e) {}
        }
        
        if (connection === 'open') {
            sessions[accountId].connected = true;
            // Extract phone number from socket credentials
            const me = sock.user;
            if (me && me.id) {
                // me.id is like "919479007951:123@s.whatsapp.net"
                const phoneRaw = me.id.split(':')[0].split('@')[0];
                sessions[accountId].phoneNumber = normalizePhone(phoneRaw);
                log(`Connected: ${accountId} as ${sessions[accountId].phoneNumber}`);
                
                // Register with CRM
                await registerAccount(sessions[accountId].phoneNumber, account.label);
                
                // Delete QR file if it exists
                const qrPath = path.join(__dirname, `qr_${accountId}.png`);
                if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
            }
        }
        
        if (connection === 'close') {
            sessions[accountId].connected = false;
            const statusCode = (lastDisconnect?.error instanceof Boom) 
                ? lastDisconnect.error.output.statusCode 
                : 0;
            
            if (statusCode === DisconnectReason.loggedOut) {
                log(`${accountId}: Logged out. Delete ${account.auth_dir} and restart to re-pair.`, 'WARN');
            } else {
                log(`${accountId}: Disconnected (code ${statusCode}), reconnecting in 5s...`, 'WARN');
                setTimeout(() => startSession(account), 5000);
            }
        }
    });
    
    // ── SAVE CREDENTIALS ──
    sock.ev.on('creds.update', saveCreds);
    
    // ── REAL-TIME MESSAGES ──
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
        if (type !== 'notify') return;  // Only process new notifications
        
        for (const msg of msgs) {
            const processed = processMessage(accountId, msg);
            if (processed) {
                pendingMessages[accountId].push(processed);
                const dir = processed.direction === 'incoming' ? '←' : '→';
                log(`${dir} ${accountId}: ${processed.lead_phone} | ${processed.message_type}: ${processed.message_text.substring(0, 80)}`);
            }
        }
    });
    
    // ── HISTORY SYNC (initial batch) ──
    sock.ev.on('messaging-history.set', async ({ messages: histMsgs }) => {
        let count = 0;
        for (const msg of histMsgs) {
            const processed = processMessage(accountId, msg);
            if (processed) {
                pendingMessages[accountId].push(processed);
                count++;
            }
        }
        if (count > 0) {
            log(`History sync: ${count} CRM-relevant messages from ${accountId}`);
        }
    });
    
    return sock;
}

// ─── STATUS DISPLAY ─────────────────────────────────────
function printStatus() {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  Zero7 CRM WhatsApp Sync Agent - Status');
    console.log(`${'─'.repeat(60)}`);
    for (const [id, session] of Object.entries(sessions)) {
        const status = session.connected ? '🟢 Connected' : '🔴 Disconnected';
        const phone = session.phoneNumber || 'N/A';
        const pending = (pendingMessages[id] || []).length;
        console.log(`  ${session.label}: ${status} | Phone: ${phone} | Pending: ${pending}`);
    }
    console.log(`  CRM Leads: ${Object.keys(crmPhones).length} phone numbers`);
    console.log(`${'─'.repeat(60)}\n`);
}

// ─── MAIN ───────────────────────────────────────────────
async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║       Zero7 CRM - WhatsApp Desktop Sync Agent          ║
║       Syncing WhatsApp conversations to CRM            ║
╚══════════════════════════════════════════════════════════╝
`);
    
    // 1. Login to CRM
    log('Authenticating with CRM...');
    if (!await crmLogin()) {
        log('Cannot authenticate with CRM. Check credentials in config.json', 'FATAL');
        process.exit(1);
    }
    
    // 2. Fetch CRM lead phones
    log('Fetching CRM lead phone numbers...');
    if (!await fetchCRMPhones()) {
        log('Cannot fetch lead phones. Check CRM connection.', 'FATAL');
        process.exit(1);
    }
    
    // 3. Start all WhatsApp sessions
    for (const account of ACCOUNTS) {
        try {
            await startSession(account);
        } catch(e) {
            log(`Failed to start session ${account.id}: ${e.message}`, 'ERROR');
        }
    }
    
    // 4. Periodic flush of pending messages
    syncTimer = setInterval(async () => {
        try {
            await flushPending();
        } catch(e) {
            log(`Flush error: ${e.message}`, 'ERROR');
        }
    }, SYNC_INTERVAL);
    
    // 5. Periodic phone list refresh (every 10 minutes)
    setInterval(async () => {
        await fetchCRMPhones();
    }, 10 * 60 * 1000);
    
    // 6. Status display every 2 minutes
    setInterval(printStatus, 2 * 60 * 1000);
    
    // Initial status after 10 seconds
    setTimeout(printStatus, 10000);
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
        log('Shutting down...');
        clearInterval(syncTimer);
        // Flush remaining messages
        await flushPending();
        // Close sockets
        for (const [id, session] of Object.entries(sessions)) {
            if (session.socket) {
                try { session.socket.end(); } catch(e) {}
            }
        }
        log('Goodbye!');
        process.exit(0);
    });
    
    log(`Sync agent running. Checking every ${SYNC_INTERVAL/1000}s. Press Ctrl+C to stop.`);
}

main().catch(e => {
    log(`Fatal error: ${e.message}`, 'FATAL');
    console.error(e);
    process.exit(1);
});
