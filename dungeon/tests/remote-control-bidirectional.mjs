import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dungeonRoot = path.resolve(__dirname, '..');
const { bridgePort, vitePort } = await resolvePorts();
const origin = `http://127.0.0.1:${vitePort}`;
const bridgeWs = `ws://127.0.0.1:${bridgePort}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-dungeon-bidirectional-'));
const projectPath = path.join(tmp, 'project');
const fakeCodexAppServer = path.join(tmp, 'fake-codex-app-server.cjs');
const bridgeOutput = [];
const viteOutput = [];
let bridge;
let vite;
let browser;

async function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const freePort = typeof address === 'object' && address ? address.port : null;
      probe.close(() => {
        if (!freePort) reject(new Error('Unable to allocate a free bidirectional test port.'));
        else resolve(freePort);
      });
    });
  });
}

async function resolvePorts() {
  const requestedBridge = process.env.SEO_DUNGEON_BIDIRECTIONAL_BRIDGE_PORT
    ? Number(process.env.SEO_DUNGEON_BIDIRECTIONAL_BRIDGE_PORT)
    : null;
  const requestedVite = process.env.SEO_DUNGEON_BIDIRECTIONAL_VITE_PORT
    ? Number(process.env.SEO_DUNGEON_BIDIRECTIONAL_VITE_PORT)
    : null;
  const bridge = requestedBridge || await reserveFreePort();
  let viteCandidate = requestedVite || await reserveFreePort();
  while (viteCandidate === bridge && !requestedVite) {
    viteCandidate = await reserveFreePort();
  }
  if (viteCandidate === bridge) throw new Error('Bidirectional bridge and Vite ports must be different.');
  return { bridgePort: bridge, vitePort: viteCandidate };
}

fs.mkdirSync(projectPath, { recursive: true });
fs.writeFileSync(path.join(projectPath, 'README.md'), '# Remote Control Bidirectional Test\n', 'utf8');
fs.writeFileSync(fakeCodexAppServer, `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
let nextTurn = 1;
const turns = new Map();
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
const textFromInput = (input) => Array.isArray(input)
  ? input.map((item) => item && item.text ? item.text : '').join('\\n').trim()
  : '';

function complete(turnId, status = 'completed') {
  const turn = turns.get(turnId);
  if (!turn || turn.done) return;
  turn.done = true;
  for (const timer of turn.timers) clearTimeout(timer);
  send({ method: 'turn/completed', params: { turn: { id: turnId, status } } });
}

rl.on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') {
    send({ id: msg.id, result: { userAgent: 'fake-codex-bidirectional', platformFamily: 'test', platformOs: 'test' } });
    return;
  }
  if (msg.method === 'thread/start') {
    send({ id: msg.id, result: { thread: { id: 'thread_bidirectional' } } });
    send({ method: 'thread/started', params: { thread: { id: 'thread_bidirectional' } } });
    return;
  }
  if (msg.method === 'turn/start') {
    const prompt = textFromInput(msg.params && msg.params.input);
    const turnId = 'turn_' + nextTurn++;
    const browserOrigin = prompt.includes('Browser-origin command for Codex watcher');
    const codexOrigin = prompt.includes('Codex helper command into Guild Ledger');
    const turn = { done: false, timers: [] };
    turns.set(turnId, turn);
    turn.timers.push(setTimeout(() => {
      send({ method: 'turn/started', params: { turn: { id: turnId } } });
      send({ id: msg.id, result: { turn: { id: turnId } } });
      send({ method: 'item/agentMessage/delta', params: { delta: browserOrigin
        ? ' BROWSER_ORIGIN_STREAM.'
        : codexOrigin
          ? ' CODEX_HELPER_STREAM.'
          : ' BIDIRECTIONAL_STREAM.' } });
    }, 100));
    turn.timers.push(setTimeout(() => complete(turnId), 700));
    return;
  }
  if (msg.method === 'turn/interrupt') {
    for (const turnId of turns.keys()) complete(turnId, 'interrupted');
    send({ id: msg.id, result: {} });
  }
});
`, 'utf8');

function spawnNode(args, options) {
  return spawn(process.execPath, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.on('exit', resolve);
      killer.on('error', resolve);
    });
    return;
  }
  child.kill('SIGTERM');
}

async function waitForHttp(url, label, output, proc, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (proc && proc.exitCode !== null) throw new Error(`${label} exited early:\n${output.join('').slice(-5000)}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (res.ok) return res;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}:\n${output.join('').slice(-5000)}`);
}

function runBridge() {
  bridge = spawnNode(['server/index.js'], {
    cwd: dungeonRoot,
    env: {
      ...process.env,
      SEO_DUNGEON_BRIDGE_PORT: String(bridgePort),
      SEO_DUNGEON_ALLOWED_ORIGINS: origin,
      SEO_DUNGEON_CODEX_CLI: process.execPath,
      SEO_DUNGEON_CODEX_ARGS: `"${fakeCodexAppServer}"`,
    },
  });
  bridge.stdout.on('data', (chunk) => bridgeOutput.push(chunk.toString()));
  bridge.stderr.on('data', (chunk) => bridgeOutput.push(chunk.toString()));
}

function runVite() {
  const viteBin = path.join(dungeonRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawnNode([viteBin, '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
    cwd: dungeonRoot,
    env: { ...process.env },
  });
  vite.stdout.on('data', (chunk) => viteOutput.push(chunk.toString()));
  vite.stderr.on('data', (chunk) => viteOutput.push(chunk.toString()));
}

function cliEnv(extra = {}) {
  return {
    ...process.env,
    SEO_DUNGEON_BRIDGE_URL: bridgeWs,
    SEO_DUNGEON_CONTROLLER_ORIGIN: origin,
    ...extra,
  };
}

function runCli(args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/remote-control.mjs', ...args], {
      cwd: dungeonRoot,
      env: cliEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI timed out: ${args.join(' ')}\nstdout=${stdout}\nstderr=${stderr}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function parseJsonLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function ledgerTexts(page) {
  await page.evaluate(() => window.__seoDungeonFlushLogQueue?.()).catch(() => {});
  return page.locator('.log-line .log-text').evaluateAll((nodes) => nodes.map((node) => node.textContent || ''));
}

async function waitForLedger(page, matcher, label, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const texts = await ledgerTexts(page);
    if (texts.some((text) => matcher.test(text))) return texts;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ledger line: ${label}\n${(await ledgerTexts(page)).join('\n')}`);
}

runBridge();
runVite();

try {
  const healthResponse = await waitForHttp(`http://127.0.0.1:${bridgePort}/health`, 'bridge', bridgeOutput, bridge);
  const health = await healthResponse.json();
  assert.equal(health.supportsRemoteControl, true, 'bridge should advertise remote control');
  await waitForHttp(origin, 'vite', viteOutput, vite);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(`${origin}/?bridge=${encodeURIComponent(bridgeWs)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__seoDungeonDialogueReady === true, null, { timeout: 15000 });
  await page.waitForFunction(async () => {
    const { bridge } = await import('/src/utils/ws.js');
    return bridge.connected === true ||
      document.querySelector('#bridge-status')?.classList.contains('connected');
  }, null, { timeout: 15000 });

  await page.locator('#domain-input').fill('seodungeon.com');
  await page.locator('#path-input').fill(projectPath);
  if (await page.locator('#danger-mode-toggle').getAttribute('aria-pressed') !== 'true') {
    await page.locator('#danger-mode-toggle').click();
  }

  const browserWatch = runCli([
    'watch',
    '--json',
    '--no-replay',
    '--kind',
    'ledger-command',
    '--filter-source',
    'guild-ledger',
    '--count',
    '1',
    '--timeout',
    '10000',
  ]);
  await page.waitForTimeout(500);
  await page.locator('#log-input').fill('Browser-origin command for Codex watcher');
  await page.locator('#log-input').press('Enter');
  await waitForLedger(page, /> Browser-origin command for Codex watcher/i, 'browser-origin command submitted');
  await waitForLedger(page, /BROWSER_ORIGIN_STREAM/i, 'browser-origin fake stream visible');
  const browserWatchResult = await browserWatch;
  assert.equal(browserWatchResult.code, 0, browserWatchResult.stdout);
  const browserWatchLines = parseJsonLines(browserWatchResult.stdout);
  const browserEvent = browserWatchLines.find((line) => line.type === 'session-event');
  assert.equal(browserEvent?.replay, false, 'browser-origin watch event should be live, not replay');
  assert.equal(browserEvent?.event?.kind, 'ledger-command');
  assert.equal(browserEvent?.event?.source, 'guild-ledger');
  assert.equal(browserEvent?.event?.command, 'Browser-origin command for Codex watcher');
  assert.equal(browserEvent?.event?.projectPath, projectPath);
  assert.equal(browserWatchLines.at(-1)?.type, 'watch-complete');
  assert.equal(browserWatchLines.at(-1)?.reason, 'count');

  await page.waitForFunction(() => {
    const state = window.__seoDungeonDialogueState?.();
    return state && state.queue.length === 0 && state.busy === false;
  }, null, { timeout: 12000 });

  const sendResult = await runCli([
    'send',
    '--json',
    '--wait',
    '--timeout',
    '12000',
    '--project',
    projectPath,
    '--profile',
    'fast',
    '--dangerous-bypass',
    '--',
    'Codex helper command into Guild Ledger',
  ], { timeoutMs: 16000 });
  assert.equal(sendResult.code, 0, sendResult.stdout);
  const sendJson = JSON.parse(sendResult.stdout);
  assert.equal(sendJson.ok, true);
  assert.equal(sendJson.waitEvent?.status, 'complete');
  await waitForLedger(page, /Remote codex-cli: Codex helper command into Guild Ledger/i, 'Codex helper command mirrored to ledger');
  await waitForLedger(page, /> Codex helper command into Guild Ledger/i, 'Codex helper command submitted through browser');
  await waitForLedger(page, /CODEX_HELPER_STREAM/i, 'Codex helper fake stream visible');

  assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
  console.log('Remote control bidirectional UI/CLI self-test passed');
} finally {
  if (browser) await browser.close().catch(() => {});
  await killTree(vite);
  await killTree(bridge);
  fs.rmSync(tmp, { recursive: true, force: true });
}
