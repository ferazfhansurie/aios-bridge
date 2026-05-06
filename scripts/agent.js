/**
 * Agent orchestrator — picks the configured adapter, manages per-phone
 * session continuity, and handles WhatsApp media attachments.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { getAdapter } = require('./adapters');
const { buildSystemPrompt, loadConfig } = require('./team-router');

const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_DIR || path.join(__dirname, '..'));
const MCP_CONFIG = path.join(WORKSPACE_ROOT, '.mcp.json');
const SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.json');
const ADAPTER_NAME = process.env.AGENT_ADAPTER || 'claude-code';
const ALLOWED_TOOLS = process.env.ALLOWED_TOOLS
  || 'Read,Write,Edit,MultiEdit,NotebookEdit,Bash,Glob,Grep,WebFetch,WebSearch,TodoWrite';
const TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS || '600000', 10);

function loadSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); }
  catch (_) { return {}; }
}

function saveSessions(map) {
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(map, null, 2), 'utf8');
}

function sessionFor(phone) {
  const sessions = loadSessions();
  if (sessions[phone]) return { id: sessions[phone], isNew: false };
  const id = crypto.randomUUID();
  sessions[phone] = id;
  saveSessions(sessions);
  return { id, isNew: true };
}

function resetSession(phone) {
  const sessions = loadSessions();
  delete sessions[phone];
  saveSessions(sessions);
}

async function processMessage(text, member, imagePath = null) {
  const config = loadConfig();
  const { id: sessionId, isNew } = sessionFor(member.phone);
  const systemPrompt = buildSystemPrompt(member, config);

  let userMsg = text;
  if (imagePath) {
    const imgPath = imagePath.replace(/\\/g, '/');
    userMsg = `IMPORTANT: The user attached an image. Use the Read tool on this file to view it: ${imgPath}\n\nUser says: ${text}`;
  }

  console.log(`[agent] ${member.name} (${member.role}) [sid:${sessionId.slice(0, 8)} ${isNew ? 'NEW' : 'RESUME'}]: "${text.slice(0, 80)}"${imagePath ? ' [+image]' : ''}`);

  const adapter = getAdapter(ADAPTER_NAME);
  const { reply } = await adapter.run({
    prompt: userMsg,
    sessionId,
    isNew,
    systemPrompt,
    mcpConfigPath: MCP_CONFIG,
    cwd: WORKSPACE_ROOT,
    allowedTools: ALLOWED_TOOLS,
    timeout: TIMEOUT_MS,
  });

  return reply;
}

function adapterForKeepalive() {
  const adapter = getAdapter(ADAPTER_NAME);
  return adapter.startKeepalive ? adapter : null;
}

module.exports = { processMessage, resetSession, adapterForKeepalive, WORKSPACE_ROOT };
