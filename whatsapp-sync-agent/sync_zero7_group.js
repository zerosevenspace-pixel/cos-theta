/**
 * Sync Zero7 WhatsApp Group messages & media to CRM
 */
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CRM_URL = 'https://cos.zero7.space';
const CRM_EMAIL = 'abhijeet@zero7.space';
const CRM_PASSWORD = 'admin123';
const TARGET_GROUP = 'Zero7';

const AUTH_DIR = path.join(__dirname, 'auth_state');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const logger = pino({ level: 'silent' });

let crmToken = null;
let crmLeads = [];
let targetGroupId = null;
const processedMessageIds = new Set();
let lastContextLead = null;
let lastContextTime = 0;

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

async function crmLogin() {
  try {
    const resp = await httpRequest(`${CRM_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CRM_EMAIL, password: CRM_PASSWORD })
    });
    crmToken = resp.data.token;
    console.log('[CRM] Logged in successfully as ' + CRM_EMAIL);
    return true;
  } catch (e) {
    console.error('[CRM] Login failed:', e.message);
    return false;
  }
}

async function fetchCRMLeads() {
  try {
    const resp = await httpRequest(`${CRM_URL}/api/leads`, {
      headers: { 'Authorization': `Bearer ${crmToken}` }
    });
    crmLeads = resp.data || [];
    console.log(`[CRM] Loaded ${crmLeads.length} leads from database.`);
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
  // 1. Exact full name match
  for (const lead of crmLeads) {
    if (lead.name && lead.name.length > 2 && lower.includes(lead.name.toLowerCase())) {
      return lead;
    }
  }
  // 2. First + Last name components
  for (const lead of crmLeads) {
    if (lead.name) {
      const parts = lead.name.toLowerCase().split(/\s+/).filter(p => p.length >= 4);
      for (const part of parts) {
        // avoid matching generic words
        if (['kumar', 'sharma', 'singh', 'patil', 'shah', 'gupta'].includes(part)) continue;
        if (lower.includes(part)) return lead;
      }
    }
  }
  return null;
}

async function uploadRecordingToLead(leadId, filePath, fileName, mimeType, notes) {
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
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
          console.log(`  [CRM] Uploaded recording to lead ${leadId} (HTTP ${res.statusCode}) - auto-transcription queued!`);
          resolve(data);
        });
      });
      req.on('error', reject);
      req.write(fullBody);
      req.end();
    });
  } catch (e) {
    console.error(`  [CRM] Upload failed: ${e.message}`);
  }
}

async function addNoteToLead(leadId, noteText) {
  try {
    await httpRequest(`${CRM_URL}/api/leads/${leadId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${crmToken}` },
      body: JSON.stringify({ content: noteText })
    });
    console.log(`  [CRM] Added note to lead ${leadId}`);
  } catch (e) {
    console.error(`  [CRM] Note failed: ${e.message}`);
  }
}

async function handleMessage(sock, msg) {
  if (!msg.key || !msg.message) return;
  const msgId = msg.key.id;
  if (processedMessageIds.has(msgId)) return;
  processedMessageIds.add(msgId);

  const remoteJid = msg.key.remoteJid || '';
  if (targetGroupId && remoteJid !== targetGroupId) return;

  const m = msg.message;
  let text = '';
  let isAudio = false;
  let isDoc = false;
  let mimeType = '';
  let docFileName = '';

  if (m.conversation) {
    text = m.conversation;
  } else if (m.extendedTextMessage) {
    text = m.extendedTextMessage.text || '';
  } else if (m.audioMessage) {
    isAudio = true;
    mimeType = m.audioMessage.mimetype || 'audio/ogg';
  } else if (m.documentMessage) {
    isDoc = true;
    mimeType = m.documentMessage.mimetype || 'application/octet-stream';
    docFileName = m.documentMessage.fileName || '';
    text = docFileName + (m.documentMessage.caption ? ` - ${m.documentMessage.caption}` : '');
    // If document is audio format, treat as audio
    if (mimeType.includes('audio') || /\.(mp3|m4a|wav|aac|ogg|opus)$/i.test(docFileName)) {
      isAudio = true;
    }
  } else if (m.imageMessage) {
    text = m.imageMessage.caption || '';
  } else if (m.videoMessage) {
    text = m.videoMessage.caption || '';
  }

  // Check quoted message for lead reference
  const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage || 
                 m.audioMessage?.contextInfo?.quotedMessage ||
                 m.documentMessage?.contextInfo?.quotedMessage;
  let quotedText = '';
  if (quoted) {
    quotedText = quoted.conversation || quoted.extendedTextMessage?.text || quoted.documentMessage?.fileName || '';
  }

  const combinedText = `${text} ${quotedText}`.trim();
  const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
  const timeStr = new Date(ts).toLocaleString('en-IN');
  const sender = (msg.key.participant || msg.key.remoteJid || '').split('@')[0];

  console.log(`\n[MSG] [${timeStr}] Sender: ${sender}`);
  if (text) console.log(`      Text: "${text.substring(0, 100)}"`);
  if (isAudio) console.log(`      Media: AUDIO (${mimeType})`);
  if (isDoc && !isAudio) console.log(`      Media: DOC (${docFileName})`);

  // Match Lead
  let matchedLead = null;

  // 1. Phone number match in text or quoted text
  const phones = combinedText.match(/(?:\+?91)?[\s-]?(\d{10})/g);
  if (phones) {
    for (const p of phones) {
      matchedLead = findLeadByPhone(p);
      if (matchedLead) {
        console.log(`      -> Matched by phone: ${p} => ${matchedLead.name} (${matchedLead.phone})`);
        break;
      }
    }
  }

  // 2. Name match
  if (!matchedLead && combinedText) {
    matchedLead = findLeadByName(combinedText);
    if (matchedLead) {
      console.log(`      -> Matched by name in text: ${matchedLead.name} (${matchedLead.phone})`);
    }
  }

  // 3. Recent context match (if sent within 3 minutes of a message that mentioned a lead)
  if (!matchedLead && lastContextLead && (ts - lastContextTime < 180000)) {
    matchedLead = lastContextLead;
    console.log(`      -> Matched by recent context: ${matchedLead.name}`);
  }

  if (matchedLead) {
    lastContextLead = matchedLead;
    lastContextTime = ts;

    if (isAudio) {
      console.log(`      [ACTION] Downloading audio recording for ${matchedLead.name}...`);
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
        const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : mimeType.includes('wav') ? 'wav' : 'mp3';
        const cleanName = matchedLead.name.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `wa_${cleanName}_${Date.now()}.${ext}`;
        const filePath = path.join(DOWNLOADS_DIR, fileName);
        fs.writeFileSync(filePath, buffer);
        console.log(`      [SAVED] ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);

        await uploadRecordingToLead(
          matchedLead.id, filePath, fileName, mimeType,
          `WhatsApp audio from ${sender} in Zero7 group [${timeStr}]: ${text || 'Recording'}`
        );
      } catch (err) {
        console.error(`      [ERROR] Audio download failed: ${err.message}`);
      }
    } else if (text) {
      console.log(`      [ACTION] Adding note to ${matchedLead.name}...`);
      await addNoteToLead(
        matchedLead.id,
        `[WhatsApp Zero7 Group - ${sender} (${timeStr})]\n${text}`
      );
    }
  } else {
    console.log(`      [INFO] Message did not match any active lead in CRM.`);
  }
}

async function start() {
  console.log('=== Zero7 Group WhatsApp Synchronizer ===\n');
  await crmLogin();
  await fetchCRMLeads();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    syncFullHistory: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      const me = sock.user;
      console.log(`\n[WA] Connected as ${me?.id?.split(':')[0]} (${me?.name || 'Zero7'})`);

      // Find exact Zero7 group (120363426285521103@g.us)
      const groups = await sock.groupFetchAllParticipating();
      for (const [id, g] of Object.entries(groups)) {
        if (id === '120363426285521103@g.us' || (g.subject && g.subject.trim().toLowerCase() === 'zero7')) {
          targetGroupId = id;
          console.log(`[WA] Found Exact Target Group: "${g.subject}" -> ID: ${id} (${g.participants?.length || 0} participants)`);
          break;
        }
      }
      if (!targetGroupId) {
        targetGroupId = '120363426285521103@g.us';
        console.log(`[WA] Using Target Group ID: ${targetGroupId}`);
      }

      if (targetGroupId) {
        console.log(`[WA] Requesting history for group ${targetGroupId}...`);
        try {
          await sock.fetchMessageHistory(100, { remoteJid: targetGroupId });
        } catch (e) {
          console.log(`[WA] History fetch info: ${e.message}`);
        }
      }

      console.log('\n[WA] Listening for messages & files in Zero7 group...');
      console.log('[WA] Tip: You can forward, share, or type in the Zero7 group now, and it will sync immediately!\n');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`[WA] Connection closed. ${shouldReconnect ? 'Reconnecting...' : 'Logged out.'}`);
      if (shouldReconnect) setTimeout(start, 5000);
    }
  });

  // History sync event
  sock.ev.on('messaging-history.set', async ({ messages, isLatest }) => {
    if (messages && messages.length > 0) {
      console.log(`[EVENT: history.set] Received ${messages.length} messages...`);
      for (const m of messages) {
        if (m.key?.remoteJid === targetGroupId) {
          await handleMessage(sock, m);
        }
      }
    }
  });

  // Real-time messages event
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const m of messages) {
      if (m.key?.remoteJid === targetGroupId) {
        await handleMessage(sock, m);
      }
    }
  });
}

start().catch(console.error);
