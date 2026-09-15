/**
 * Captures the WhatsApp QR code and saves it as a PNG image.
 */
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');

const AUTH_DIR = path.join(__dirname, 'auth_state');
const QR_IMAGE_PATH = path.join('C:\\Users\\m_hit\\.gemini\\antigravity\\brain\\cdb5bb33-8b97-4a6f-8855-662142f5207a', 'whatsapp_qr.png');
const logger = pino({ level: 'silent' });

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
  });
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;
    
    if (qr) {
      console.log('QR_RECEIVED');
      await QRCode.toFile(QR_IMAGE_PATH, qr, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      console.log('QR_SAVED:' + QR_IMAGE_PATH);
    }
    
    if (connection === 'open') {
      const me = sock.user;
      console.log('CONNECTED:' + (me?.id || '').split(':')[0].split('@')[0]);
    }
  });
  
  sock.ev.on('creds.update', saveCreds);
}

main().catch(console.error);
