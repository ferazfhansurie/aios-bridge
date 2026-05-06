/**
 * Team Router — phone → member mapping with permissions and per-member system prompts.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`config.json missing. Copy config.example.json → config.json and fill it in.`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function normalizePhone(phone) {
  return phone.replace(/[\s+\-]/g, '');
}

function getTeamMember(phone) {
  const config = loadConfig();
  const normalized = normalizePhone(phone);

  if (config.team[normalized]) {
    return { phone: normalized, ...config.team[normalized] };
  }

  for (const [key, member] of Object.entries(config.team)) {
    const keyNorm = normalizePhone(key);
    if (normalized.endsWith(keyNorm) || keyNorm.endsWith(normalized)) {
      return { phone: key, ...member };
    }
  }

  return null;
}

function isTeamMember(phone) {
  return getTeamMember(phone) !== null;
}

function hasPermission(phone, permission) {
  const member = getTeamMember(phone);
  if (!member) return false;
  if (member.permissions.includes('all')) return true;
  return member.permissions.includes(permission);
}

/**
 * Build a per-message system prompt. CLAUDE.md in the workspace handles the
 * heavy context — this just briefs the agent on WHO it's talking to and the
 * non-negotiable WhatsApp output rules.
 */
function buildSystemPrompt(member, config) {
  const clientName = config.client?.name || 'this business';
  return `You are ${clientName}'s AI business partner. You run with full Claude Code tools.
Talking to: ${member.name} (${member.role}) via WhatsApp.
${member.context || ''}

YOUR OUTPUT BECOMES A WHATSAPP MESSAGE. A human reads this on their phone.

═══ HARD RULES ═══
1. TOOL-FIRST: any action verb (read, list, check, send, query, run, deploy) → call a tool BEFORE replying.
2. BANNED REPLIES: "What can I do for you?" / "How can I help?" / "Let me know..." — anything that asks the user what they need instead of doing it. Instant fail.
3. GREETING-ONLY: message is literally "hi"/"hello"/"gm" alone → 1-line greeting. ANY extra content → execute.
4. WhatsApp @mentions at the start are metadata. Strip mentally, read the real instruction.
5. If a request is ambiguous — don't deflect. Run an investigation first (ls, dir, query), THEN report findings with concrete options.

═══ REPLY FORMAT ═══
- No markdown tables (WhatsApp can't render). Use line breaks + "- " dashes.
- Scannable. <300 words typical.
- Emojis only for status: ✅ done, ❌ failed, 📊 data, ⏰ reminder.
- Lead with the RESULT, not the process. The user wants the answer, not a log.

${member.name} is pre-approved for everything. Don't hedge, don't warn — just do.`;
}

function resolveGroupId(nameOrId, config) {
  if (nameOrId.includes('@g.us')) return nameOrId;
  const aliases = config.group_aliases || {};
  const lower = nameOrId.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  for (const [alias, id] of Object.entries(aliases)) {
    if (alias.includes(lower) || lower.includes(alias)) return id;
  }
  return null;
}

module.exports = {
  loadConfig,
  getTeamMember,
  isTeamMember,
  hasPermission,
  buildSystemPrompt,
  resolveGroupId,
};
