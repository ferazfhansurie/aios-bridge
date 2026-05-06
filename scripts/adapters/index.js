/**
 * Adapter registry. Each adapter exposes:
 *
 *   {
 *     name: string,
 *     run({ prompt, sessionId, isNew, systemPrompt, mcpConfigPath, cwd, allowedTools, timeout })
 *       → Promise<{ reply: string }>
 *   }
 *
 * Adding a provider = drop a new file here + register it below. The listener
 * never knows which engine ran the request.
 */

const adapters = {
  'claude-code': require('./claude-code'),
  'opencode':    require('./opencode'),  // day 8 — multi-provider harness (skeleton)
  'ollama':      require('./ollama'),    // day 8 — local fallback (skeleton)
  'failover':    require('./failover'),  // day 8 — try a chain of adapters in order
};

function getAdapter(name = 'claude-code') {
  const a = adapters[name];
  if (!a) {
    const available = Object.keys(adapters).join(', ');
    throw new Error(`Unknown agent adapter: "${name}". Available: ${available}`);
  }
  return a;
}

module.exports = { getAdapter };
