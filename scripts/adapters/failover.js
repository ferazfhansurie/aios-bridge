/**
 * Adapter: failover chain.
 *
 * Wraps multiple adapters and tries them in order until one succeeds.
 * The killer feature for the day 8 post:
 *
 *   "your bridge doesn't go down when claude does."
 *
 * Configure with AGENT_FAILOVER_CHAIN, comma-separated:
 *
 *   AGENT_ADAPTER=failover
 *   AGENT_FAILOVER_CHAIN=claude-code,opencode,ollama
 *
 * When the first adapter throws (cap hit, OAuth expired, network down), the
 * next one is tried with the SAME prompt + sessionId. Each adapter manages
 * its own session continuity, so cross-adapter conversation context is best
 * effort — switching providers mid-conversation may lose memory. That's an
 * accepted trade-off vs the bridge being silent.
 *
 * STATUS: scaffolded for day 8 — wire to real adapters once opencode/ollama
 * implementations land.
 */

// Lazy-require to avoid circular dep with ./index (which registers us).
function getAdapter(name) {
  return require('./index').getAdapter(name);
}

const CHAIN = (process.env.AGENT_FAILOVER_CHAIN || 'claude-code')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

async function run(opts) {
  const errors = [];
  for (const name of CHAIN) {
    if (name === 'failover') continue; // guard against recursion
    try {
      const adapter = getAdapter(name);
      console.log(`[failover] Trying adapter: ${name}`);
      const result = await adapter.run(opts);
      if (errors.length > 0) {
        console.warn(`[failover] Recovered via ${name} after ${errors.length} failure(s)`);
      }
      return result;
    } catch (err) {
      console.warn(`[failover] ${name} failed: ${err.message}`);
      errors.push({ adapter: name, error: err.message });
    }
  }
  const summary = errors.map(e => `${e.adapter}: ${e.error}`).join(' | ');
  throw new Error(`All adapters in chain [${CHAIN.join(', ')}] failed. ${summary}`);
}

// Pass keepalive through to whichever adapter in the chain implements it
// (typically claude-code).
function startKeepalive(intervalMs) {
  for (const name of CHAIN) {
    try {
      const adapter = getAdapter(name);
      if (adapter.startKeepalive) {
        return adapter.startKeepalive(intervalMs);
      }
    } catch (_) {}
  }
  return null;
}

module.exports = { name: 'failover', run, startKeepalive };
