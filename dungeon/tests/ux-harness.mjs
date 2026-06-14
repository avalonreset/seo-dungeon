import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dungeonRoot = path.resolve(__dirname, '..');
const basePort = 5520 + (process.pid % 400);
const bridgePort = Number(process.env.SEO_DUNGEON_UX_BRIDGE_PORT || basePort);
const vitePort = Number(process.env.SEO_DUNGEON_UX_VITE_PORT || (basePort + 1));
const origin = `http://127.0.0.1:${vitePort}`;
const bridgeWs = `ws://127.0.0.1:${bridgePort}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-dungeon-ux-'));
const fakeCodexAppServer = path.join(tmp, 'fake-codex-app-server.cjs');
const projectPath = path.join(tmp, 'project');
const bridgeOutput = [];
const viteOutput = [];
let bridge;
let vite;
let browser;

fs.mkdirSync(projectPath, { recursive: true });
fs.writeFileSync(path.join(projectPath, 'README.md'), '# SEO Dungeon UX Test\n', 'utf8');

fs.writeFileSync(fakeCodexAppServer, `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
let threadId = 'thread_fake';
let nextTurn = 1;
let currentTurn = null;
const turns = new Map();
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');
const textFromInput = (input) => Array.isArray(input)
  ? input.map((item) => item && item.text ? item.text : '').join('\\n').trim()
  : '';
const tinyDeltas = ["I'll", " verify", " this", " against", " the", " live", " repo", "."];

function completeTurn(turnId, status = 'completed') {
  const turn = turns.get(turnId);
  if (!turn || turn.completed) return;
  turn.completed = true;
  for (const timer of turn.timers) clearTimeout(timer);
  send({ method: 'turn/completed', params: { turn: { id: turnId, status } } });
}

function scheduleTurnDeltas(turnId, completeDelay = 6200) {
  const turn = turns.get(turnId);
  if (!turn) return;
  tinyDeltas.forEach((delta, index) => {
    turn.timers.push(setTimeout(() => {
      if (turn.completed) return;
      send({ method: 'item/agentMessage/delta', params: { delta } });
    }, 320 + (index * 95)));
  });
  turn.timers.push(setTimeout(() => completeTurn(turnId), completeDelay));
}

rl.on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') {
    send({ id: msg.id, result: { userAgent: 'fake-codex', platformFamily: 'test', platformOs: 'test' } });
    return;
  }
  if (msg.method === 'thread/start') {
    send({ id: msg.id, result: { thread: { id: threadId } } });
    send({ method: 'thread/started', params: { thread: { id: threadId } } });
    return;
  }
  if (msg.method === 'turn/start') {
    const turnId = 'turn_' + nextTurn++;
    const promptText = textFromInput(msg.params && msg.params.input);
    const completeDelay = promptText.includes('Initial battle harness prompt.')
      ? 12000
      : 6200;
    const turn = { id: turnId, completed: false, timers: [] };
    turns.set(turnId, turn);
    currentTurn = turnId;
    setTimeout(() => {
      send({ method: 'turn/started', params: { turn: { id: turnId } } });
      send({ id: msg.id, result: { turn: { id: turnId } } });
      scheduleTurnDeltas(turnId, completeDelay);
    }, 80);
    return;
  }
  if (msg.method === 'turn/steer') {
    const turnId = msg.params && msg.params.turnId ? msg.params.turnId : currentTurn;
    const turn = turns.get(turnId);
    if (!turn || turn.completed) {
      send({ id: msg.id, error: { code: -32000, message: 'no active turn to steer' } });
      return;
    }
    send({ id: msg.id, result: { turnId } });
    send({ method: 'item/agentMessage/delta', params: { delta: ' STEERED_OK ' + textFromInput(msg.params.input) + '.' } });
    return;
  }
  if (msg.method === 'turn/interrupt') {
    for (const turnId of turns.keys()) completeTurn(turnId, 'interrupted');
    send({ id: msg.id, result: {} });
  }
});
`, 'utf8');

function spawnNode(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return child;
}

function runBridge() {
  bridge = spawnNode(process.execPath, ['server/index.js'], {
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
  vite = spawnNode(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
    cwd: dungeonRoot,
    env: { ...process.env },
  });
  vite.stdout.on('data', (chunk) => viteOutput.push(chunk.toString()));
  vite.stderr.on('data', (chunk) => viteOutput.push(chunk.toString()));
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
    if (proc && proc.exitCode !== null) {
      throw new Error(`${label} exited early:\\n${output.join('').slice(-5000)}`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (res.ok) return res;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}:\\n${output.join('').slice(-5000)}`);
}

async function waitForLog(page, matcher, label, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const texts = await ledgerTexts(page);
    if (texts.some((text) => matcher.test(text))) return texts;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ledger line: ${label}\\n${(await ledgerTexts(page)).join('\\n')}`);
}

async function ledgerTexts(page) {
  await page.evaluate(() => window.__seoDungeonFlushLogQueue?.()).catch(() => {});
  return page.locator('.log-line .log-text').evaluateAll((nodes) => nodes.map((node) => node.textContent || ''));
}

async function queueTexts(page) {
  return page.locator('.prompt-queue-item .prompt-queue-text').evaluateAll((nodes) => nodes.map((node) => node.textContent || ''));
}

async function expectNoStreamWordSpam(page) {
  const texts = await ledgerTexts(page);
  const spamWords = new Set(["I'll", 'verify', 'this', 'against', 'the', 'live', 'repo', 'but', 'there', 'are', 'un', 'comm', 'itted']);
  const spam = texts
    .map((text) => text.trim())
    .filter((text) => spamWords.has(text));
  assert.deepEqual(spam, [], `ledger rendered one-word stream spam:\\n${texts.join('\\n')}`);
}

async function waitForIdle(page) {
  await page.waitForFunction(() => {
    const stop = document.querySelector('#log-stop');
    const state = window.__seoDungeonDialogueState?.();
    const battle = window.__seoDungeonGame?.scene?.getScene('Battle');
    const battleReady = !battle ||
      !battle.scene?.isActive?.() ||
      battle.battleOver ||
      battle.isPlayerTurn === true;
    return stop &&
      stop.disabled &&
      state &&
      state.busy === false &&
      state.ledgerRunning === false &&
      state.hasQueueDrainTimer === false &&
      battleReady;
  }, null, { timeout: 12000 });
}

async function fillAndSubmit(page, text) {
  const input = page.locator('#log-input');
  await input.fill(text);
  await input.press('Enter');
}

async function runTitleLaunchSmoke(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/?bridge=${encodeURIComponent(bridgeWs)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#bridge-status')?.classList.contains('connected'), null, { timeout: 15000 });
  await expectNoStreamWordSpam(page);

  assert.equal(await page.locator('#danger-mode-toggle').getAttribute('aria-pressed'), 'false', 'YOLO must start disarmed on first boot');
  assert.equal(await page.locator('#descend-btn').isDisabled(), true, 'launch must be blocked until YOLO is armed');
  assert.equal(await page.locator('text=/deep audit|balanced|quick pass/i').count(), 0, 'old profile detail labels must not be visible');

  await page.locator('#domain-input').fill('seodungeon.com');
  await page.locator('#path-input').fill(projectPath);
  await page.locator('#danger-mode-toggle').click();
  await page.locator('#descend-btn').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#descend-btn').isDisabled(), false, 'launch should be enabled after domain, path, bridge, and YOLO are ready');
  await page.locator('#descend-btn').click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#title-screen')).display === 'none', null, { timeout: 6000 });
  assert.deepEqual(errors, [], `title launch page errors:\\n${errors.join('\\n')}`);
  await page.close();
}

async function runBattleLedgerHarness(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ projectPath: injectedProjectPath }) => {
    window.seoDungeonDangerousBypass = true;
    localStorage.setItem('seo_dungeon_last_domain', 'seodungeon.com');
    localStorage.setItem('seo_dungeon_last_path', injectedProjectPath);
    localStorage.setItem('seo_dungeon_audit_seodungeon.com_codex_balanced', JSON.stringify({
      domain: 'seodungeon.com',
      runtime: 'codex',
      profile: 'balanced',
      model: 'balanced',
      auditData: {
        score: 72,
        summary: 'Cached UX harness audit',
        issues: [{
          id: 'ux-harness-demon',
          title: 'Mobile UX issue',
          description: 'Regression fixture for battle ledger controls.',
          severity: 'medium',
          category: 'ux',
          hp: 60,
        }],
      },
      timestamp: Date.now(),
    }));
  }, { projectPath });

  await page.goto(`${origin}/?battle=1&bridge=${encodeURIComponent(bridgeWs)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#bridge-status')?.classList.contains('connected'), null, { timeout: 15000 });
  await page.locator('#game-container canvas').first().waitFor({ timeout: 15000 });
  await waitForLog(page, /DEV: jumping to battle/i, 'dev battle jump');
  await page.waitForFunction(() => window.__seoDungeonGame?.scene?.isActive('Battle'), null, { timeout: 15000 });

  await fillAndSubmit(page, 'Initial battle harness prompt.');
  await waitForLog(page, /channels the agent/i, 'battle fix started');
  await fillAndSubmit(page, 'Please steer this into the active turn.');
  await page.locator('#prompt-queue-panel.open').waitFor({ timeout: 5000 });
  assert.deepEqual(await queueTexts(page), ['Please steer this into the active turn.']);

  await page.locator('#prompt-queue-steer').click();
  await page.waitForFunction(() => document.querySelectorAll('.prompt-queue-item').length === 0);
  assert.deepEqual(await queueTexts(page), [], 'steered prompt should leave the queue immediately');

  await fillAndSubmit(page, 'Queued after a successful steer.');
  await page.locator('#log-stop').click();
  await page.waitForFunction(() => document.querySelector('#prompt-queue-title')?.textContent === 'Held');
  assert.deepEqual(await queueTexts(page), ['Queued after a successful steer.'], 'stop after steer should hold the later queued prompt only');

  await page.locator('#prompt-queue-steer').click();
  await waitForLog(page, /Submitted held prompt\./i, 'post-steer held prompt submission');
  assert.deepEqual(await queueTexts(page), [], 'post-steer held prompt should leave queue when submitted');
  await waitForLog(page, /> Queued after a successful steer\./i, 'post-steer held prompt becomes active user line');
  await waitForLog(page, /I'll verify this against the live repo\./i, 'post-steer held coalesced stream');
  await expectNoStreamWordSpam(page);
  await waitForIdle(page);

  await fillAndSubmit(page, 'Second prompt that will be stopped.');
  await waitForLog(page, /channels the agent/i, 'second battle fix started');
  await fillAndSubmit(page, 'Hold this prompt after stop.');
  await page.locator('#prompt-queue-panel.open').waitFor({ timeout: 5000 });
  await page.locator('#log-stop').click();
  await page.waitForFunction(() => document.querySelector('#prompt-queue-title')?.textContent === 'Held');
  assert.deepEqual(await queueTexts(page), ['Hold this prompt after stop.'], 'stop should hold queued prompt instead of orphaning it');

  await page.locator('#prompt-queue-steer').click();
  await waitForLog(page, /Submitted held prompt\./i, 'held prompt submission');
  assert.deepEqual(await queueTexts(page), [], 'submitted held prompt should leave queue');
  await waitForLog(page, /> Hold this prompt after stop\./i, 'held prompt becomes active user line');
  await waitForLog(page, /I'll verify this against the live repo\./i, 'second coalesced agent stream');
  await expectNoStreamWordSpam(page);
  assert.deepEqual(errors, [], `battle ledger page errors:\\n${errors.join('\\n')}`);
  await page.close();
}

runBridge();
runVite();

try {
  const healthResponse = await waitForHttp(`http://127.0.0.1:${bridgePort}/health`, 'bridge', bridgeOutput, bridge);
  const health = await healthResponse.json();
  assert.equal(health.supportsSteer, true, 'bridge health should advertise live steering');
  await waitForHttp(origin, 'vite', viteOutput, vite);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await runTitleLaunchSmoke(context);
  await runBattleLedgerHarness(context);
  await context.close();

  console.log('UX harness self-test passed');
} finally {
  if (browser) await browser.close().catch(() => {});
  await killTree(vite);
  await killTree(bridge);
  fs.rmSync(tmp, { recursive: true, force: true });
}
