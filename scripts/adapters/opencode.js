/**
 * Adapter: opencode CLI.
 *
 * opencode is a multi-provider TUI/CLI harness. It can route to Anthropic,
 * OpenAI, Gemini, local Ollama, and others — useful as a fallback when the
 * Claude Code CLI is unhappy (subscription cap, OAuth expired, outage).
 *
 * STATUS: skeleton — implement on day 8.
 *
 * Research notes / open questions:
 * - Non-interactive mode: `opencode run "<prompt>"` exists. Confirm flag set.
 * - Session resumption: opencode has session UUIDs. Find the resume flag
 *   (likely `--session <id>` or via config file).
 * - Tool support: opencode supports MCP servers — does it accept the same
 *   `--mcp-config` shape as Claude Code, or its own format?
 * - Output: confirm there's a `--json` / structured output mode so we can
 *   parse `result` reliably (vs scraping pretty TUI output).
 * - Auth: pick provider via env (`OPENCODE_PROVIDER=anthropic` etc).
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function findOpencodeCmd() {
  if (process.env.OPENCODE_CMD) return process.env.OPENCODE_CMD;
  const candidates = [
    '/usr/local/bin/opencode',
    path.join(os.homedir(), '.local', 'bin', 'opencode'),
    path.join(os.homedir(), '.npm-global', 'bin', 'opencode'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return 'opencode';
}

async function run(/* { prompt, sessionId, isNew, systemPrompt, mcpConfigPath, cwd, allowedTools, timeout } */) {
  throw new Error('opencode adapter: not implemented yet — scaffolded for day 8');
}

module.exports = { name: 'opencode', run };
