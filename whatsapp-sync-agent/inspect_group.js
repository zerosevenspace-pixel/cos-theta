const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(__dirname, 'auth_state');
const TARGET_GROUP_ID = '120363426285521103@g.us';
const logger = pino({ level: 'silent' });

async function inspectGroup() {
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
  
  sock.ev.on('connection.update', async (update) => {
    const { connection } = update;
    if (connection === 'open') {
      console.log('[WA] Connected! Querying group messages for ' + TARGET_GROUP_ID);
      
      try {
        // Try fetching up to 100 messages
        const msgs = await sock.fetchMessageHistory(100, { remoteJid: TARGET_GROUP_ID }, null);
        console.log(`[WA] Fetched ${msgs?.length || 0} messages.`);
        
        fs.writeFileSync(path.join(__dirname, 'group_messages.json'), JSON.stringify(msgs || [], null, 2));
        console.log('[WA] Saved group_messages.json');
        
        if (msgs && msgs.length > 0) {
          msgs.forEach((m, idx) => {
            const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
            const isAudio = !!m.message?.audioMessage;
            const isDoc = !!m.message?.documentMessage;
            const docName = m.message?.documentMessage?.fileName || '';
            const caption = m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || '';
            const ts = m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000).toLocaleString('en-IN') : '';
            console.log(`[#${idx+1}] [${ts}] Audio:${isAudio} Doc:${isDoc ? docName : 'No'} Text:"${text.replace(/\n/g, ' ')}" Caption:"${caption}"`);
          });
        }
      } catch (err) {
        console.error('[WA] Error fetching history:', err);
      }
    }
  });
}

inspectGroup().catch(console.error);
