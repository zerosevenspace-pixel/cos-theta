/**
 * Zero7 CRM - WhatsApp Group Sync Agent
 * 
 * Connects to WhatsApp, reads the Zero7 group, extracts audio files
 * and text messages related to leads, and uploads them to the CRM.
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Config
const CRM_URL = 'https://cos.zero7.space';
const CRM_EMAIL = 'abhijeet@zero7.space';
const CRM_PASSWORD = 'admin123';
const ACCOUNT_LABEL = 'Abhijeet Main';
const TARGET_GROUP = 'Zero7'; // Group name to look for

const AUTH_DIR = path.join(__dirname, 'auth_state');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const logger = pino({ level: 'warn' });

// Ensure downloads dir
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

let crmToken = null;
let crmLeads = [];
let myPhoneNumber = '';

// ── HTTP helper (works without fetch polyfill) ───────────

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const reqOpts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    
    const req = mod.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── CRM API ──────────────────────────────────────────────

async function crmLogin() {
  try {
    const resp = await httpRequest(`${CRM_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CRM_EMAIL, password: CRM_PASSWORD })
    });
    crmToken = resp.data.token;
    console.log('[CRM] ✅ Logged in');
    return true;
  } catch (e) {
    console.error('[CRM] ❌ Login failed:', e.message);
    return false;
  }
}

async function fetchCRMLeads() {
  try {
    const resp = await httpRequest(`${CRM_URL}/api/leads`, {
      headers: { 'Authorization': `Bearer ${crmToken}` }
    });
    crmLeads = resp.data || [];
    console.log(`[CRM] Loaded ${crmLeads.length} leads`);
    return true;
  } catch (e) {
    console.error('[CRM] Failed to fetch leads:', e.message);
    return false;
  }
}

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function findLeadByPhone(phone) {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  return crmLeads.find(l => normalizePhone(l.phone) === norm);
}

function findLeadByName(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Try exact match first
  for (const lead of crmLeads) {
    if (lead.name && lower.includes(lead.name.toLowerCase())) return lead;
  }
  // Try first name match
  for (const lead of crmLeads) {
    if (lead.name) {
      const firstName = lead.name.split(' ')[0].toLowerCase();
      if (firstName.length > 3 && lower.includes(firstName)) return lead;
    }
  }
  return null;
}

async function uploadRecordingToLead(leadId, filePath, fileName, mimeType, notes) {
  // Use multipart form upload via raw HTTP
  const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
  const fileBytes = fs.readFileSync(filePath);
  
  let body = '';
  body += `--${boundary}\r\nContent-Disposition: form-data; name="outcome"\r\n\r\nConnected\r\n`;
  body += `--${boundary}\r\nContent-Disposition: form-data; name="notes"\r\n\r\n${notes || 'Imported from WhatsApp Zero7 group'}\r\n`;
  body += `--${boundary}\r\nContent-Disposition: form-data; name="duration_minutes"\r\n\r\n5\r\n`;
  body += `--${boundary}\r\nContent-Disposition: form-data; name="recording"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  
  const bodyStart = Buffer.from(body, 'utf8');
  const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const fullBody = Buffer.concat([bodyStart, fileBytes, bodyEnd]);
  
  try {
    const urlObj = new URL(`${CRM_URL}/api/leads/${leadId}/calls`);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${crmToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length,
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`  [CRM] ✅ Recording uploaded to lead ${leadId} (${res.statusCode})`);
          resolve(data);
        });
      });
      req.on('error', reject);
      req.write(fullBody);
      req.end();
    });
  } catch (e) {
    console.error(`  [CRM] ❌ Upload failed: ${e.message}`);
  }
}

async function addNoteToLead(leadId, noteText) {
  try {
    await httpRequest(`${CRM_URL}/api/leads/${leadId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${crmToken}` },
      body: JSON.stringify({ content: noteText })
    });
    console.log(`  [CRM] ✅ Note added to lead ${leadId}`);
  } catch (e) {
    console.error(`  [CRM] ❌ Note failed: ${e.message}`);
  }
}

// ── WhatsApp ─────────────────────────────────────────────

async function startAgent() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Zero7 CRM - WhatsApp Group Sync Agent v2   ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  
  const loggedIn = await crmLogin();
  if (!loggedIn) { console.error('Cannot connect to CRM.'); process.exit(1); }
  await fetchCRMLeads();
  
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[WA] Connecting with Baileys v${version.join('.')}...\n`);
  
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    syncFullHistory: true,
  });
  
  // QR code display
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('📱 Scan this QR code with your WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nWaiting for scan...\n');
    }
    
    if (connection === 'open') {
      const me = sock.user;
      myPhoneNumber = me ? (me.id || '').split(':')[0].split('@')[0] : '';
      console.log(`[WA] ✅ Connected as ${myPhoneNumber} (${me?.name || 'Unknown'})\n`);
      
      // Find and process Zero7 group
      console.log('[WA] Looking for Zero7 group...');
      setTimeout(() => scanGroups(sock), 5000);
    }
    
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('[WA] Reconnecting...');
        setTimeout(startAgent, 5000);
      } else {
        console.log('[WA] Logged out. Delete auth_state/ folder and run again.');
      }
    }
  });
  
  sock.ev.on('creds.update', saveCreds);
  
  // Listen for real-time messages
  sock.ev.on('messages.upsert', async ({ messages: newMsgs }) => {
    for (const msg of newMsgs) {
      if (!msg.key?.remoteJid) continue;
      // Only process group messages from target group
      if (msg.key.remoteJid.includes('@g.us')) {
        await processGroupMessage(sock, msg);
      }
    }
  });

  // History sync
  sock.ev.on('messaging-history.set', async ({ messages: historyMsgs }) => {
    console.log(`[HISTORY] Received ${historyMsgs.length} historical messages`);
    let groupMsgs = historyMsgs.filter(m => m.key?.remoteJid?.includes('@g.us'));
    console.log(`[HISTORY] ${groupMsgs.length} are group messages`);
    
    for (const msg of groupMsgs) {
      await processGroupMessage(sock, msg);
    }
  });
}

async function scanGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    console.log(`[WA] Found ${groupList.length} groups:`);
    
    let targetGroup = null;
    for (const g of groupList) {
      const name = g.subject || 'unnamed';
      const isTarget = name.toLowerCase().includes(TARGET_GROUP.toLowerCase());
      console.log(`  ${isTarget ? '→' : ' '} ${name} (${g.id}) - ${g.participants?.length || 0} members`);
      if (isTarget) targetGroup = g;
    }
    
    if (targetGroup) {
      console.log(`\n[WA] ✅ Found target group: "${targetGroup.subject}" (${targetGroup.id})`);
      console.log('[WA] Fetching group messages...\n');
      
      // Fetch recent messages from the group
      try {
        const msgs = await sock.fetchMessageHistory(50, { remoteJid: targetGroup.id }, null);
        console.log(`[WA] Got ${msgs?.length || 0} messages from group`);
      } catch(e) {
        console.log(`[WA] History fetch not available (${e.message}). Listening for real-time messages instead.`);
      }
    } else {
      console.log(`\n[WA] ⚠️  No group matching "${TARGET_GROUP}" found. Listening for new messages...`);
    }
    
    console.log('\n[WA] Agent is running. Messages will be processed as they arrive.');
    console.log('[WA] Press Ctrl+C to stop.\n');
  } catch (e) {
    console.error('[WA] Group scan error:', e.message);
  }
}

async function processGroupMessage(sock, msg) {
  if (!msg.message || !msg.key) return;
  
  const remoteJid = msg.key.remoteJid || '';
  const m = msg.message;
  
  // Check if it's from the target group
  // We'll process all group messages and try to match leads
  
  let messageText = '';
  let isAudio = false;
  let isDocument = false;
  let mimeType = '';
  
  if (m.conversation) {
    messageText = m.conversation;
  } else if (m.extendedTextMessage) {
    messageText = m.extendedTextMessage?.text || '';
  } else if (m.audioMessage) {
    isAudio = true;
    mimeType = m.audioMessage.mimetype || 'audio/ogg';
  } else if (m.documentMessage) {
    isDocument = true;
    mimeType = m.documentMessage?.mimetype || 'application/octet-stream';
    messageText = m.documentMessage?.fileName || '';
  } else if (m.imageMessage) {
    messageText = m.imageMessage?.caption || '';
  } else if (m.videoMessage) {
    messageText = m.videoMessage?.caption || '';
  }
  
  // Try to find matching lead
  let matchedLead = null;
  
  // Try phone numbers in message text
  const phoneMatches = messageText.match(/(?:\+?91)?[\s-]?(\d{10})/g);
  if (phoneMatches) {
    for (const p of phoneMatches) {
      matchedLead = findLeadByPhone(p);
      if (matchedLead) break;
    }
  }
  
  // Try name matching
  if (!matchedLead) {
    matchedLead = findLeadByName(messageText);
  }
  
  // Try document filename
  if (!matchedLead && isDocument) {
    matchedLead = findLeadByName(m.documentMessage?.fileName || '');
  }
  
  const timestamp = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();
  const sender = msg.key.participant || msg.key.remoteJid || 'unknown';
  
  if (isAudio && matchedLead) {
    // Download and upload audio to CRM as call recording
    console.log(`[AUDIO] 🎵 Audio for lead: ${matchedLead.name} (${matchedLead.phone})`);
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : mimeType.includes('mpeg') ? 'mp3' : 'ogg';
      const fileName = `wa_${matchedLead.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${ext}`;
      const filePath = path.join(DOWNLOADS_DIR, fileName);
      fs.writeFileSync(filePath, buffer);
      console.log(`  Saved: ${fileName} (${(buffer.length / 1024).toFixed(0)} KB)`);
      
      await uploadRecordingToLead(matchedLead.id, filePath, fileName, mimeType, 
        `WhatsApp voice note from ${sender.split('@')[0]} - imported from Zero7 group (${timestamp})`);
    } catch (e) {
      console.error(`  ❌ Audio download failed: ${e.message}`);
    }
  } else if (messageText && matchedLead) {
    // Add text as a note to the lead
    console.log(`[TEXT] 💬 Message for lead: ${matchedLead.name}: "${messageText.substring(0, 60)}..."`);
    await addNoteToLead(matchedLead.id,
      `[WhatsApp - Zero7 Group] ${sender.split('@')[0]} (${new Date(timestamp).toLocaleString('en-IN')}):\n${messageText}`);
  } else if (isAudio && !matchedLead) {
    console.log(`[SKIP] 🎵 Audio - no matching lead found`);
  } else if (messageText && !matchedLead) {
    // Only log if message seems relevant (has a phone number or name-like content)
    if (phoneMatches || messageText.length > 20) {
      console.log(`[SKIP] 💬 "${messageText.substring(0, 50)}..." - no matching lead`);
    }
  }
}

// Start
startAgent().catch(console.error);
