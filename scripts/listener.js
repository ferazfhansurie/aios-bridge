/**
 * AIOS Bridge — WhatsApp listener.
 *
 * Listens for messages from configured team members, dispatches each into
 * an agent (Claude Code by default; pluggable via AGENT_ADAPTER), and
 * replies back in the same chat.
 *
 * First run:    npm run connect    (scan QR)
 * Foreground:   npm run listener
 * Production:   pm2 start ecosystem.config.js
 */

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');

const { getTeamMember, isTeamMember, loadConfig } = require('./team-router');
const { processMessage, resetSession, adapterForKeepalive } = require('./agent');

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
const KEEPALIVE_MS = parseInt(process.env.OAUTH_KEEPALIVE_MS || '1200000', 10);

const config = loadConfig();
const processing = new Set();

const client = new Client({
  authStrategy: new LocalAuth({ clientId: CLIENT_ID, dataPath: AUTH_PATH }),
  puppeteer: {
    headless: true,
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions', '--disable-gpu', '--disable-dev-shm-usage'],
  },
});

client.on('qr', () => {
  console.error('No saved session. Run `npm run connect` to scan QR first.');
  process.exit(1);
});

client.on('authenticated', () => {
  console.log('[aios-bridge] Authenticated.');
});

client.on('ready', () => {
  const me = client.info?.wid?.user || 'unknown';
  console.log(`[aios-bridge] Ready — connected as +${me}`);
  console.log(`[aios-bridge] Adapter: ${process.env.AGENT_ADAPTER || 'claude-code'}`);
  console.log(`[aios-bridge] Team: ${Object.values(config.team).map(m => m.name).join(', ')}`);

  if (KEEPALIVE_MS > 0) {
    const adapter = adapterForKeepalive();
    if (adapter) {
      adapter.startKeepalive(KEEPALIVE_MS);
      console.log(`[aios-bridge] OAuth keepalive every ${KEEPALIVE_MS / 60000}min`);
    }
  }
});

client.on('message', async (msg) => {
  try {
    if (msg.fromMe) return;

    if (msg.from.includes('@g.us')) {
      if (config.settings.ignore_groups) return;
      if (config.settings.require_mention_in_groups) {
        const mentions = await msg.getMentions();
        const botNumber = client.info?.wid?._serialized;
        const mentioned = mentions.some(m => m.id._serialized === botNumber);
        if (!mentioned) return;
      }
    }

    const sender = msg.from.replace('@c.us', '').replace('@g.us', '');
    const contact = await msg.getContact();
    const senderNumber = contact.id?.user || sender;

    if (config.settings.only_team_members && !isTeamMember(senderNumber)) return;

    const member = getTeamMember(senderNumber);
    if (!member) return;

    if (processing.has(senderNumber)) {
      console.log(`[aios-bridge] ${member.name} sent another message while processing. Dropped (queueing not yet implemented).`);
      return;
    }

    const text = msg.body?.trim();
    const hasMedia = msg.hasMedia;
    if (!text && !hasMedia) return;

    const stripped = (text || '').replace(/^@\S+\s*/, '').trim();

    // Admin slash commands (owner / developer only).
    if (stripped.startsWith('/') && (member.role === 'owner' || member.role === 'developer')) {
      const cmd = stripped.split(/\s+/)[0].toLowerCase();
      if (cmd === '/restart') {
        await msg.reply('🔄 Restarting bot. Back in ~15s.');
        const { spawn } = require('child_process');
        const child = spawn(process.platform === 'win32' ? 'cmd.exe' : 'sh',
          process.platform === 'win32'
            ? ['/c', 'pm2 restart aios-bridge']
            : ['-c', 'pm2 restart aios-bridge'],
          { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
        return;
      }
      if (cmd === '/reset') {
        resetSession(senderNumber);
        await msg.reply('🧹 Session cleared. Next message starts fresh.');
        return;
      }
      if (cmd === '/ping') {
        await msg.reply(`✅ Alive. Uptime: ${Math.floor(process.uptime() / 60)}m`);
        return;
      }
    }

    let imagePath = null;
    if (hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media && media.data) {
          const ext = media.mimetype?.split('/')[1]?.split(';')[0] || 'bin';
          const mediaDir = path.join(__dirname, '..', 'data', 'media');
          if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
          const filename = `${Date.now()}-${senderNumber}.${ext}`;
          imagePath = path.join(mediaDir, filename);
          fs.writeFileSync(imagePath, Buffer.from(media.data, 'base64'));
          console.log(`[aios-bridge] ${member.name} sent media: ${filename}`);
        }
      } catch (e) {
        console.error(`[aios-bridge] Failed to download media:`, e.message);
      }
    }

    const userText = text || (imagePath ? 'The user sent a file. Read it and respond.' : '');
    if (!userText) return;

    console.log(`[aios-bridge] ${member.name}: ${userText.slice(0, 100)}${userText.length > 100 ? '...' : ''}${imagePath ? ' [+media]' : ''}`);
    processing.add(senderNumber);

    try {
      const reply = await processMessage(userText, member, imagePath);
      if (reply) {
        if (reply.length > 4000) {
          for (const chunk of splitMessage(reply, 4000)) {
            await msg.reply(chunk);
            await new Promise(r => setTimeout(r, 500));
          }
        } else {
          await msg.reply(reply);
        }
        console.log(`[aios-bridge] → ${member.name}: ${reply.slice(0, 100)}${reply.length > 100 ? '...' : ''}`);
      }
    } catch (err) {
      console.error(`[aios-bridge] Error:`, err.message);
      try { await msg.reply(`⚠️ ${err.message.slice(0, 300)}`); } catch (_) {}
    } finally {
      processing.delete(senderNumber);
    }
  } catch (err) {
    console.error(`[aios-bridge] Outer error:`, err.message);
  }
});

function splitMessage(text, maxLen) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

client.on('disconnected', (reason) => {
  console.error('[aios-bridge] Disconnected:', reason);
  console.log('[aios-bridge] Reconnecting in 10s...');
  setTimeout(() => client.initialize(), 10000);
});

client.on('auth_failure', (msg) => {
  console.error('[aios-bridge] Auth failed:', msg);
  console.error('[aios-bridge] Run `npm run connect` to re-pair.');
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n[aios-bridge] Shutting down...');
  await client.destroy();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('[aios-bridge] SIGTERM, shutting down...');
  await client.destroy();
  process.exit(0);
});

console.log('[aios-bridge] Initializing WhatsApp client...');
client.initialize();
