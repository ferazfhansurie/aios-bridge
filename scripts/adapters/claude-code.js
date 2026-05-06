/**
 * Adapter: Claude Code CLI.
 *
 * Spawns `claude -p` with the user's subscription OAuth (or ANTHROPIC_API_KEY
 * if set in the parent env). Per-conversation continuity comes from a
 * deterministic session UUID passed via --session-id (first message) or
 * --resume (subsequent messages).
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function findClaudeCmd() {
  if (process.env.CLAUDE_CMD) return process.env.CLAUDE_CMD;
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return 'claude';
}

const CLAUDE_CMD = findClaudeCmd();

async function run({ prompt, sessionId, isNew, systemPrompt, mcpConfigPath, cwd, allowedTools, timeout = 600000 }) {
  const sysFile = path.join(os.tmpdir(), `aios-bridge-sys-${Date.now()}.txt`);
  fs.writeFileSync(sysFile, systemPrompt, 'utf8');

  const args = [
    '-p', prompt,
    '--system-prompt-file', sysFile,
    '--allowedTools', allowedTools,
    '--dangerously-skip-permissions',
    '--output-format', 'json',
  ];
  if (mcpConfigPath && fs.existsSync(mcpConfigPath)) {
    args.push('--mcp-config', mcpConfigPath);
  }
  if (isNew) args.push('--session-id', sessionId);
  else args.push('--resume', sessionId);

  // Strip env that would hijack auth back to API-key / host-managed paths.
  // The user's OAuth lives in ~/.claude/ on the host running this bot.
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST;
  delete cleanEnv.CLAUDE_CODE_EXECPATH;
  delete cleanEnv.CLAUDECODE;
  delete cleanEnv.ANTHROPIC_BASE_URL;
  delete cleanEnv.ANTHROPIC_API_KEY;
  delete cleanEnv.CLAUDE_AGENT_SDK_VERSION;
  delete cleanEnv.CLAUDE_INTERNAL_FC_OVERRIDES;

  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_CMD, args, {
      timeout,
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...cleanEnv,
        HOME: os.homedir(),
        USERPROFILE: os.homedir(),
        PATH: cleanEnv.PATH,
        APPDATA: cleanEnv.APPDATA,
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      try { fs.unlinkSync(sysFile); } catch (_) {}
      reject(new Error(`Failed to start Claude: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      try { fs.unlinkSync(sysFile); } catch (_) {}

      let reply = '';
      let authError = false;
      try {
        const parsed = JSON.parse(stdout);
        reply = (parsed.result || parsed.response || '').trim();
        if (parsed.is_error) authError = /401|authenti/i.test(reply);
      } catch (_) {
        reply = stdout.trim();
      }

      if (authError || /Failed to authenticate|Invalid authentication credentials/i.test(reply)) {
        reject(new Error('Claude Code OAuth expired. Run `claude` once on the bot host to re-login, then restart aios-bridge.'));
        return;
      }

      if (code !== 0 && !reply) {
        const friendly = signal === 'SIGTERM'
          ? 'Task took longer than the configured timeout. Break it into smaller steps.'
          : `Agent exited with code ${code}. ${stderr.slice(0, 200)}`;
        reject(new Error(friendly));
        return;
      }

      resolve({ reply: reply || 'Done.' });
    });
  });
}

/**
 * OAuth keepalive — Claude Code subscription tokens expire ~1hr.
 * Calling `claude -p ok` cheaply every 20min keeps the token warm.
 */
function startKeepalive(intervalMs = 20 * 60 * 1000) {
  const tick = () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST;
    delete cleanEnv.CLAUDE_CODE_EXECPATH;
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.ANTHROPIC_BASE_URL;
    delete cleanEnv.ANTHROPIC_API_KEY;

    const child = spawn(CLAUDE_CMD, ['-p', 'ok', '--output-format', 'json'], {
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...cleanEnv, HOME: os.homedir(), USERPROFILE: os.homedir() },
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) console.log('[keepalive] OAuth refreshed ✓');
      else console.warn(`[keepalive] Failed (code ${code}): ${err.slice(0, 200)}`);
    });
    child.on('error', (e) => console.warn(`[keepalive] Spawn error: ${e.message}`));
  };

  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { name: 'claude-code', run, startKeepalive };
