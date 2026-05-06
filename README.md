# aios-bridge

**WhatsApp → Claude Code → ship → reply.**

Drop a WhatsApp number into your team group. They send a message. Claude does the work in your repo — queries the database, edits code, ships a deploy, generates a PDF — and replies in the same thread.

This is the integration shape that AIOS clients actually pay for. It's already in production at one paying client (RM300/mo) — this repo is that pattern, generalized.

```
client WhatsApp
       │  "fix the broken booking page"
       ▼
listener.js  (whatsapp-web.js)         ← strips @mentions, filters non-team
       │
       ▼
agent.js  → adapters/claude-code.js    ← spawns `claude -p --resume <sid>`
       │                                  with cwd = your workspace
       │                                  + .mcp.json for DBs/integrations
       │                                  + per-phone session continuity
       ▼
listener.js  msg.reply(...)            ← chunked, sent back in thread
```

## Why this works

- **Per-phone session UUID** — each team member has their own resumable Claude session. Context carries across messages.
- **Full Claude Code tools** — Read, Write, Edit, Bash, Glob, Grep, MCP servers. Same as desktop.
- **OAuth keepalive** — pings every 20min so the subscription token never expires mid-conversation.
- **Adapter abstraction** — Claude Code today, opencode / Ollama / local model tomorrow. The listener doesn't care.

## Setup

```bash
git clone https://github.com/<you>/aios-bridge
cd aios-bridge
npm install

# 1. Configure the client
cp config.example.json config.json    # team phone numbers → roles
cp .env.example .env                  # adapter, paths, timeouts
cp .mcp.example.json .mcp.json        # databases, integrations
cp CLAUDE.example.md CLAUDE.md        # client-specific system prompt

# 2. Pair WhatsApp (one-time, scan QR)
npm run connect

# 3. Run the listener
npm run listener
# or, in production:
pm2 start ecosystem.config.js
pm2 save
```

## Files

| File | Purpose |
|---|---|
| `scripts/listener.js` | wwebjs listener — filters, dispatches, replies |
| `scripts/agent.js` | orchestrator — picks adapter, manages sessions |
| `scripts/adapters/claude-code.js` | Claude Code CLI adapter |
| `scripts/team-router.js` | phone → member, system prompt builder |
| `scripts/connect.js` | one-time QR pairing |
| `config.json` | team, group aliases, settings (gitignored) |
| `.mcp.json` | MCP server config — Claude pulls DB/tools from here (gitignored) |
| `CLAUDE.md` | client-specific context — schema, decision tree, voice (gitignored) |

## Slash commands (owner/developer only)

- `/restart` — pm2 restart the bot
- `/reset` — clear current sender's session
- `/ping` — uptime check

## Adapters

Today: `claude-code` (default). Set via `AGENT_ADAPTER` in `.env`.

Adding a new adapter:

1. Create `scripts/adapters/<name>.js` exposing `{ name, run, startKeepalive? }`.
2. Register it in `scripts/adapters/index.js`.
3. Set `AGENT_ADAPTER=<name>` in `.env`.

The contract is one function:

```js
async function run({ prompt, sessionId, isNew, systemPrompt, mcpConfigPath, cwd, allowedTools, timeout }) {
  // ...spawn the engine, parse output...
  return { reply: '...' };
}
```

Planned: `opencode` (multi-model harness), `ollama` (local fallback when subscriptions cap).

## Why not Meta Cloud API?

wwebjs ships in a day. Meta Direct ships in a week (template approval, webhook router, business verification). For an MVP at one client, wwebjs wins. If you outgrow it, swap the listener — `agent.js` is unchanged.

## Status

Day 7 of [30 days, 30 tools](https://x.com/firazfhansurie). Not 1.0. The pattern is battle-tested in production at one client; this repo is that pattern extracted and made reusable.

## License

MIT.
