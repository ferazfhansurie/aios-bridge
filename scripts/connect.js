/**
 * QR connect — first-time WhatsApp pairing.
 *
 * Run once interactively, scan the QR with the client's WhatsApp number,
 * then session is saved to .wwebjs_auth/ and the listener can run headless.
 */

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
];

function findChrome() {
  for (const p of CHROME_PATHS) if (fs.existsSync(p)) return p;
  return undefined;
}

const CLIENT_ID = process.env.WA_CLIENT_ID || 'aios-bridge';
const AUTH_PATH = path.join(__dirname, '..', '.wwebjs_auth');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: CLIENT_ID, dataPath: AUTH_PATH }),
  puppeteer: {
    headless: false,
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions', '--disable-gpu', '--disable-dev-shm-usage'],
  },
});

client.on('qr', (qr) => {
  console.log("\nScan this QR code with the client's WhatsApp number:\n");
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('\n✓ Authenticated. Session saved to .wwebjs_auth/');
});

client.on('ready', () => {
  const me = client.info?.wid?.user || 'unknown';
  console.log(`\n✓ Connected as +${me}`);
  console.log('\nYou can now start the listener:');
  console.log('  npm run listener');
  console.log('  # or with PM2:');
  console.log('  pm2 start ecosystem.config.js');
  console.log('\nPress Ctrl+C to disconnect.');
});

client.on('disconnected', (reason) => {
  console.log('Disconnected:', reason);
  process.exit(0);
});

client.on('auth_failure', (msg) => {
  console.error('Auth failed:', msg);
  process.exit(1);
});

console.log('Initializing WhatsApp client for QR pairing...');
client.initialize();

process.on('SIGINT', async () => {
  console.log('\nDisconnecting...');
  await client.destroy();
  process.exit(0);
});
