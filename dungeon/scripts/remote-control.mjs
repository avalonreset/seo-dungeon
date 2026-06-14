#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dungeonRoot = path.resolve(__dirname, '..');
const DEFAULT_TIMEOUT_MS = 30000;
const RESERVED_EVENT_KINDS = new Set(['remote-command']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function usage() {
  return [
    'Usage:',
    '  node scripts/remote-control.mjs status [--bridge ws://127.0.0.1:3003] [--origin http://127.0.0.1:3002]',
    '  node scripts/remote-control.mjs state [--json]',
    '  node scripts/remote-control.mjs watch [--kind ledger-command] [--filter-source guild-ledger] [--after-sequence n] [--count n] [--no-replay] [--timeout ms]',
    '  node scripts/remote-control.mjs send [--wait] [--timeout ms] [--project path] [--profile fast|balanced|deep] [--dangerous-bypass] -- <command>',
    '  node scripts/remote-control.mjs event --kind <kind> [--status running] [--message text]',
  ].join('\n');
}

function parseArgs(argv) {
  const tokens = [...argv];
  let command = tokens.shift();
  let help = false;
  if (command === '--help' || command === '-h') {
    command = undefined;
    help = true;
  }
  const options = {
    command,
    json: true,
    help,
    allowNonlocal: false,
    dangerousBypass: false,
    wait: false,
    replay: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    runtime: 'codex',
    source: command === 'event' ? 'codex-cli' : 'codex-cli',
    positionals: [],
  };

  while (tokens.length) {
    const token = tokens.shift();
    if (token === '--') {
      options.positionals.push(...tokens);
      break;
    }
    if (!token.startsWith('--')) {
      options.positionals.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      if (!tokens.length) throw new Error(`Missing value for --${rawKey}`);
      return tokens.shift();
    };

    if (key === 'json') options.json = true;
    else if (key === 'allowNonlocal') options.allowNonlocal = true;
    else if (key === 'dangerousBypass') options.dangerousBypass = true;
    else if (key === 'wait') options.wait = true;
    else if (key === 'noReplay') options.replay = false;
    else if (key === 'bridge') options.bridge = readValue();
    else if (key === 'origin') options.origin = readValue();
    else if (key === 'project') options.project = readValue();
    else if (key === 'profile' || key === 'model') options.profile = readValue();
    else if (key === 'runtime') options.runtime = readValue();
    else if (key === 'source') options.source = readValue();
    else if (key === 'timeout') options.timeoutMs = Number(readValue());
    else if (key === 'count') options.count = Number(readValue());
    else if (key === 'afterSequence') options.afterSequence = Number(readValue());
    else if (key === 'kind') options.kind = readValue();
    else if (key === 'filterSource') options.filterSource = readValue();
    else if (key === 'status') options.status = readValue();
    else if (key === 'message') options.message = readValue();
    else if (key === 'command') options.commandText = readValue();
    else if (key === 'help' || key === 'h') options.help = true;
    else throw new Error(`Unknown option: --${rawKey}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout must be a positive number of milliseconds.');
  }
  if (options.count !== undefined && (!Number.isInteger(options.count) || options.count <= 0)) {
    throw new Error('--count must be a positive integer.');
  }
  if (options.afterSequence !== undefined && (!Number.isInteger(options.afterSequence) || options.afterSequence < 0)) {
    throw new Error('--after-sequence must be a non-negative integer.');
  }
  return options;
}

function redact(value) {
  return String(value || '')
    .replace(/\b(AKIA)[0-9A-Z]{12}([0-9A-Z]{4})\b/g, '$1****$2')
    .replace(/\b(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]{12,}\b/g, '$1****')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{4})[A-Za-z0-9_]{20,}\b/g, '$1****')
    .replace(/\b(xox[baprs]-[A-Za-z0-9-]{8})[A-Za-z0-9-]{12,}\b/g, '$1****')
    .replace(/((?:api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?)([^"'\s]{8,})/gi, '$1****');
}

function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item)]));
  }
  return value;
}

function writeJsonLine(payload) {
  process.stdout.write(`${JSON.stringify(redactDeep(payload))}\n`);
}

function readRuntimeConfig(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const source = fs.readFileSync(file, 'utf8');
    const match = source.match(/SEO_DUNGEON_BRIDGE_URL\s*=\s*(?:window\.SEO_DUNGEON_BRIDGE_URL\s*\|\|\s*)?(['"])(.*?)\1/);
    return match ? match[2] : null;
  } catch (_) {
    return null;
  }
}

function resolveBridgeUrl(options) {
  const candidate = options.bridge ||
    process.env.SEO_DUNGEON_BRIDGE_URL ||
    readRuntimeConfig(path.join(dungeonRoot, 'dist', 'seo-dungeon-runtime-config.js')) ||
    readRuntimeConfig(path.join(dungeonRoot, 'public', 'seo-dungeon-runtime-config.js')) ||
    `ws://127.0.0.1:${process.env.SEO_DUNGEON_BRIDGE_PORT || 3003}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`Invalid bridge URL: ${candidate}`);
  }
  if (!['ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('Bridge URL must use ws:// or wss://.');
  }
  if (!options.allowNonlocal && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing non-loopback bridge host "${url.hostname}". Pass --allow-nonlocal only for deliberate diagnostics.`);
  }
  return url.href;
}

function resolveOrigins(options) {
  if (options.origin) return [options.origin];
  if (process.env.SEO_DUNGEON_CONTROLLER_ORIGIN) return [process.env.SEO_DUNGEON_CONTROLLER_ORIGIN];
  const appPort = process.env.SEO_DUNGEON_APP_PORT || 3002;
  return [`http://127.0.0.1:${appPort}`, `http://localhost:${appPort}`];
}

function resolveProject(projectPath) {
  if (!projectPath) return undefined;
  const resolved = path.resolve(projectPath);
  try {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error('Project folder does not exist.');
    }
  } catch (err) {
    throw new Error(`Invalid project path: ${resolved}. ${err.message}`);
  }
  return resolved;
}

function commandText(options) {
  const text = options.commandText || options.positionals.join(' ');
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Remote command cannot be empty. Put it after --.');
  return clean;
}

function eventPayload(options) {
  const kind = String(options.kind || '').trim();
  if (!kind) throw new Error('event requires --kind.');
  if (RESERVED_EVENT_KINDS.has(kind)) {
    throw new Error(`${kind} is reserved. Use "send" for remote command intents.`);
  }
  const event = {
    kind,
    source: options.source || 'codex-cli',
  };
  if (options.status) event.status = options.status;
  if (options.message) event.message = options.message;
  if (options.commandText || options.positionals.length) event.command = commandText(options);
  if (options.project) event.projectPath = resolveProject(options.project);
  if (options.profile) event.profile = options.profile;
  if (options.runtime) event.runtime = options.runtime;
  return event;
}

function connectOnce(bridgeUrl, origin, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(bridgeUrl, { headers: { Origin: origin } });
    const timer = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      reject(new Error(`Timed out connecting to ${bridgeUrl} with origin ${origin}.`));
    }, timeoutMs);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.once('close', () => {
      clearTimeout(timer);
      reject(new Error(`Bridge closed connection for origin ${origin}.`));
    });
  });
}

async function connectBridge(bridgeUrl, origins, timeoutMs) {
  let lastError;
  for (const origin of origins) {
    try {
      const ws = await connectOnce(bridgeUrl, origin, timeoutMs);
      return { ws, origin };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Could not connect to bridge: ${lastError?.message || 'unknown error'}`);
}

function request(ws, payload, timeoutMs) {
  const id = request.nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${payload.type} response.`));
    }, timeoutMs);
    const onMessage = (chunk) => {
      let message;
      try { message = JSON.parse(String(chunk)); } catch (_) { return; }
      if (message.id !== id) return;
      cleanup();
      if (message.type === 'error') {
        reject(new Error(message.message || `${payload.type} failed`));
      } else {
        resolve(message);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, ...payload }));
  });
}
request.nextId = 1;

function waitForSessionEvent(ws, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}.`));
    }, timeoutMs);
    const onMessage = (chunk) => {
      let message;
      try { message = JSON.parse(String(chunk)); } catch (_) { return; }
      if (message.type !== 'session-event') return;
      if (!predicate(message.event || {})) return;
      cleanup();
      resolve(message.event);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
    };
    ws.on('message', onMessage);
  });
}

function matchesWatchFilter(event = {}, options = {}) {
  if (options.kind && event.kind !== options.kind) return false;
  if (options.filterSource && event.source !== options.filterSource) return false;
  if (options.afterSequence !== undefined && Number(event.sequence || 0) <= options.afterSequence) return false;
  return true;
}

async function watchEvents(ws, options) {
  const startedAt = Date.now();
  let emitted = 0;
  let latestSequence = Number(options.afterSequence || 0);
  const seen = new Set();
  const buffered = [];
  let streamResolve;
  let streamReject;
  let timer;

  const remainingMs = () => Math.max(1, options.timeoutMs - (Date.now() - startedAt));
  const summary = (reason) => ({ ok: true, streamed: true, reason, events: emitted, latestSequence });
  const cleanup = () => {
    clearTimeout(timer);
    ws.off('message', onMessage);
    ws.off('close', onClose);
  };
  const complete = (reason) => {
    cleanup();
    streamResolve?.(summary(reason));
  };
  const fail = (err) => {
    cleanup();
    streamReject?.(err);
  };
  const emit = (event, replay) => {
    const identity = event?.eventId || (event?.sequence ? `seq:${event.sequence}` : null);
    if (identity && seen.has(identity)) return false;
    if (!event || !matchesWatchFilter(event, options)) return false;
    if (identity) seen.add(identity);
    latestSequence = Math.max(latestSequence, Number(event.sequence || 0));
    emitted += 1;
    writeJsonLine({
      ok: true,
      type: 'session-event',
      replay,
      event,
    });
    return options.count !== undefined && emitted >= options.count;
  };
  const handleFutureEvent = (event) => {
    if (emit(event, false)) complete('count');
  };
  function onMessage(chunk) {
    let message;
    try { message = JSON.parse(String(chunk)); } catch (_) { return; }
    if (message.type !== 'session-event') return;
    if (streamResolve) handleFutureEvent(message.event || {});
    else buffered.push(message.event || {});
  }
  function onClose() {
    fail(new Error('Bridge closed while watching session events.'));
  }

  ws.on('message', onMessage);
  ws.once('close', onClose);

  try {
    if (options.replay) {
      const state = await request(ws, { type: 'session-state', source: options.source || 'codex-cli' }, remainingMs());
      for (const event of state.data?.events || []) {
        if (emit(event, true)) {
          cleanup();
          return summary('count');
        }
      }
    }

    for (const event of buffered.splice(0)) {
      if (emit(event, false)) {
        cleanup();
        return summary('count');
      }
    }

    if (remainingMs() <= 1) {
      cleanup();
      return summary('timeout');
    }

    return await new Promise((resolve, reject) => {
      streamResolve = resolve;
      streamReject = reject;
      timer = setTimeout(() => complete('timeout'), remainingMs());
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}

async function run(options) {
  if (options.help || !options.command) {
    return { ok: true, usage: usage() };
  }

  const bridgeUrl = resolveBridgeUrl(options);
  const origins = resolveOrigins(options);
  const { ws, origin } = await connectBridge(bridgeUrl, origins, Math.min(options.timeoutMs, DEFAULT_TIMEOUT_MS));

  try {
    if (options.command === 'status') {
      const response = await request(ws, { type: 'capabilities', source: options.source || 'codex-cli' }, options.timeoutMs);
      return { ok: true, bridgeUrl, origin, data: response.data };
    }

    if (options.command === 'state') {
      const response = await request(ws, { type: 'session-state', source: options.source || 'codex-cli' }, options.timeoutMs);
      return { ok: true, bridgeUrl, origin, data: response.data };
    }

    if (options.command === 'watch') {
      const result = await watchEvents(ws, options);
      return { ...result, bridgeUrl, origin };
    }

    if (options.command === 'send') {
      if (String(options.runtime || 'codex').toLowerCase() !== 'codex') {
        throw new Error('The remote-control CLI is Codex-only. Use runtime codex.');
      }
      const projectPath = resolveProject(options.project);
      const command = commandText(options);
      const response = await request(ws, {
        type: 'remote-command',
        source: options.source || 'codex-cli',
        command,
        projectPath,
        runtime: 'codex',
        profile: options.profile,
        dangerousBypass: options.dangerousBypass,
      }, options.timeoutMs);
      const result = { ok: true, bridgeUrl, origin, data: response.data };
      if (options.wait) {
        const commandId = response.data?.commandId;
        result.waitEvent = await waitForSessionEvent(
          ws,
          (event) => event.kind === 'ledger-result' && event.commandId === commandId,
          options.timeoutMs,
          `ledger-result for ${commandId}`
        );
        if (result.waitEvent.status === 'error') {
          throw new Error(result.waitEvent.message || 'Remote command failed in the Guild Ledger.');
        }
      }
      return result;
    }

    if (options.command === 'event') {
      const response = await request(ws, {
        type: 'session-event',
        event: eventPayload(options),
      }, options.timeoutMs);
      return { ok: true, bridgeUrl, origin, data: response.data };
    }

    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  } finally {
    try { ws.close(); } catch (_) {}
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  run(options).then((result) => {
    if (result?.streamed) writeJsonLine({ ...result, type: 'watch-complete' });
    else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((err) => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: redact(err.message || String(err)) }, null, 2)}\n`);
    process.exitCode = 1;
  });
} catch (err) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: redact(err.message || String(err)) }, null, 2)}\n`);
  process.exitCode = 1;
}
