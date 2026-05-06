/**
 * Adapter: Ollama (local model fallback).
 *
 * Last-resort fallback when nothing cloud is reachable. Trade-offs vs Claude:
 *
 * - No agentic tool use. Most small local models can't reliably call
 *   Read/Write/Bash. Treat this adapter as READ-ONLY Q&A — answers from
 *   prompt + context only, no codebase mutations.
 * - No native session resumption. We re-send the rolling conversation
 *   history with each call (stored in data/ollama-sessions.json).
 * - System prompt + workspace context (CLAUDE.md) get inlined into the
 *   prompt body, since there's no `--system-prompt-file`.
 *
 * STATUS: skeleton — implement on day 8.
 *
 * Suggested defaults:
 *   OLLAMA_HOST=http://127.0.0.1:11434
 *   OLLAMA_MODEL=qwen2.5-coder:14b   # or llama3.1:8b for lower-end macs
 */

const fs = require('fs');
const path = require('path');

const HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:14b';
const HISTORY_FILE = path.join(__dirname, '..', '..', 'data', 'ollama-sessions.json');

function loadHistory(sessionId) {
  try {
    const all = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return all[sessionId] || [];
  } catch (_) { return []; }
}

function saveHistory(sessionId, messages) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (_) {}
  all[sessionId] = messages.slice(-20); // cap at 20 turns
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(all, null, 2), 'utf8');
}

async function run(/* { prompt, sessionId, isNew, systemPrompt, cwd, timeout } */) {
  throw new Error('ollama adapter: not implemented yet — scaffolded for day 8');
}

module.exports = { name: 'ollama', run, _loadHistory: loadHistory, _saveHistory: saveHistory };
