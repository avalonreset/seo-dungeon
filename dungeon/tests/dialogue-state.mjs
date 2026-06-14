import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dungeonRoot = path.resolve(__dirname, '..');
const port = Number(process.env.SEO_DUNGEON_DIALOGUE_TEST_PORT || (4175 + (process.pid % 1000)));
const baseUrl = `http://127.0.0.1:${port}/`;

let server;
const serverOutput = [];

function runServer() {
  const viteBin = path.join(dungeonRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: dungeonRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()));
  server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()));
}

async function stopServer() {
  if (!server || server.killed) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.on('exit', resolve);
      killer.on('error', resolve);
    });
  } else {
    server.kill('SIGTERM');
  }
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited early:\n${serverOutput.join('').slice(-4000)}`);
    }
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(800) });
      if (res.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${baseUrl}\n${serverOutput.join('').slice(-4000)}`);
}

async function installBridgeHarness(page) {
  await page.evaluate(async () => {
    const { bridge } = await import('/src/utils/ws.js');
    try { bridge.disconnect(); } catch (_) {}
    bridge.ws = null;
    bridge.handlers.clear();
    bridge._clearReconnect?.();

    const pending = new Map();
    let nextId = 9000;
    const harness = {
      calls: [],
      steered: [],
      cancelled: [],
      pendingIds() {
        return Array.from(pending.keys());
      },
      resolveOldest(summary = 'done') {
        const id = Array.from(pending.keys())[0];
        if (!id) return null;
        pending.get(id).resolve(summary);
        return id;
      },
      rejectOldest(message = 'failed') {
        const id = Array.from(pending.keys())[0];
        if (!id) return null;
        pending.get(id).reject(message);
        return id;
      },
      setConnected(value) {
        bridge._setConnected(Boolean(value));
      },
      setBusy(value) {
        bridge.activeAuditId = value ? 777001 : null;
        window.dispatchEvent(new CustomEvent('seo-dungeon-agent-settled', { detail: { id: 777001 } }));
      },
    };

    bridge.chat = (text, projectPath, profile, runtime, onStream) => {
      const id = ++nextId;
      bridge.activeLedgerId = id;
      harness.calls.push({ id, text, projectPath, profile, runtime });
      if (typeof onStream === 'function') {
        setTimeout(() => onStream(`streaming response for ${text}`), 0);
      }
      return new Promise((resolve, reject) => {
        pending.set(id, {
          resolve(summary) {
            pending.delete(id);
            bridge._clearActiveId(id);
            resolve({ data: { summary } });
          },
          reject(message) {
            pending.delete(id);
            bridge._clearActiveId(id);
            reject(new Error(message));
          },
        });
      });
    };

    bridge.steer = (text, targetId) => {
      const activeId = targetId ||
        bridge.activeLedgerId ||
        bridge.activeAuditId ||
        bridge.activeFixId ||
        bridge.activeCommitId ||
        bridge.activeNarrationId ||
        null;
      if (!activeId) return Promise.reject(new Error('No active turn to steer.'));
      harness.steered.push({ id: activeId, text });
      return Promise.resolve({ data: { targetId: activeId, mode: 'test' } });
    };

    bridge.cancel = (id) => {
      harness.cancelled.push(id);
      const entry = pending.get(id);
      if (entry) entry.reject('Cancelled by user');
      else bridge._clearActiveId(id);
    };

    window.__dialogueHarness = harness;
    bridge._setConnected(true);
  });
}

async function submitPrompt(page, text) {
  const input = page.locator('#log-input');
  await input.fill(text);
  await input.press('Enter');
}

async function callTexts(page) {
  return page.evaluate(() => window.__dialogueHarness.calls.map((call) => call.text));
}

async function cancelledIds(page) {
  return page.evaluate(() => window.__dialogueHarness.cancelled.slice());
}

async function steeredTexts(page) {
  return page.evaluate(() => window.__dialogueHarness.steered.map((entry) => entry.text));
}

async function queueCount(page) {
  return page.locator('.prompt-queue-item').count();
}

async function waitForQueueCount(page, count) {
  await page.waitForFunction((expected) => document.querySelectorAll('.prompt-queue-item').length === expected, count);
}

async function waitForCalls(page, count) {
  await page.waitForFunction((expected) => window.__dialogueHarness?.calls.length === expected, count);
}

async function waitForSteers(page, count) {
  await page.waitForFunction((expected) => window.__dialogueHarness?.steered.length === expected, count);
}

async function waitForUiIdle(page) {
  await page.waitForFunction(() => {
    return !document.querySelector('#log-input-bar')?.classList.contains('running') &&
      !document.querySelector('#prompt-queue-panel')?.classList.contains('running');
  });
}

async function waitForUserLine(page, text) {
  await page.waitForFunction((needle) => {
    return Array.from(document.querySelectorAll('.log-line.user')).some((line) => line.textContent.includes(needle));
  }, text);
}

async function userLineCount(page, text) {
  return page.locator('.log-line.user').filter({ hasText: text }).count();
}

async function queueStatusLeakCount(page, text) {
  return page.locator('.log-line.queue').filter({ hasText: text }).count();
}

async function queueTexts(page) {
  return page.locator('.prompt-queue-text').evaluateAll((nodes) => nodes.map((node) => node.textContent));
}

async function resolveOldest(page, summary = 'done') {
  return page.evaluate((value) => window.__dialogueHarness.resolveOldest(value), summary);
}

async function setConnected(page, value) {
  await page.evaluate((next) => window.__dialogueHarness.setConnected(next), value);
}

async function addSlowAgentLog(page) {
  await page.evaluate(async () => {
    const { addLog } = await import('/src/activity-log.js');
    addLog('old agent backlog '.repeat(80));
  });
}

runServer();

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/ws:\/\/127\.0\.0\.1:3001|favicon/i.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#log-input');
  await installBridgeHarness(page);

  assert.equal(await page.locator('#log-input-bar #log-stop').count(), 1, 'input bar should expose the stop button');
  assert.equal(await page.locator('#log-input-bar #prompt-queue-steer').count(), 0, 'input bar should not expose queue/steer buttons');
  assert.equal(await page.locator('#log-stop').isVisible(), false, 'stop should be hidden while idle');

  await submitPrompt(page, 'Idle direct command');
  await waitForCalls(page, 1);
  await waitForUserLine(page, 'Idle direct command');
  assert.equal(await page.locator('#log-stop').isVisible(), true, 'stop should show while the agent is running');
  assert.equal(await queueCount(page), 0, 'idle submit should not create a queued item');
  await resolveOldest(page, 'idle complete');
  await waitForUiIdle(page);
  assert.equal(await page.locator('#log-stop').isVisible(), false, 'stop should hide after the agent settles');

  await addSlowAgentLog(page);
  await submitPrompt(page, 'After backlog command');
  await waitForCalls(page, 2);
  await waitForUserLine(page, 'After backlog command');
  assert.equal(await queueCount(page), 0, 'idle submit during typewriter backlog should not become queued');

  await submitPrompt(page, 'Queued while busy');
  await waitForQueueCount(page, 1);
  assert.equal((await callTexts(page)).length, 2, 'busy submit should wait in queue');
  assert.equal(await userLineCount(page, 'Queued while busy'), 0, 'queued text should not render as submitted user text');
  assert.equal(await queueStatusLeakCount(page, 'Queued while busy'), 0, 'queue status line should not leak queued prompt content');

  await page.locator('.prompt-queue-edit').first().click();
  await page.locator('#prompt-edit-text').waitFor({ state: 'visible' });
  await page.waitForTimeout(75);
  await page.locator('#prompt-edit-text').fill('Edited queued command');
  await page.locator('#prompt-edit-save').click();
  await page.waitForFunction(() => document.querySelector('.prompt-queue-text')?.textContent.includes('Edited queued command'));

  await submitPrompt(page, 'Temporary queued prompt');
  await waitForQueueCount(page, 2);
  await page.locator('.prompt-queue-item').nth(1).locator('.prompt-queue-remove').click();
  await waitForQueueCount(page, 1);
  assert.deepEqual(await queueTexts(page), ['Edited queued command'], 'remove should only drop the targeted queued row');

  await page.locator('#log-stop').click();
  await page.waitForFunction(() => document.querySelector('#prompt-queue-title')?.textContent === 'Held Queue');
  assert.equal((await callTexts(page)).length, 2, 'stop should not submit the held queue');
  await page.waitForTimeout(650);
  assert.equal((await callTexts(page)).length, 2, 'held queue should not auto-drain after stop');

  await submitPrompt(page, 'Manual direct after stop');
  await waitForCalls(page, 3);
  await waitForUserLine(page, 'Manual direct after stop');
  assert.deepEqual(await queueTexts(page), ['Edited queued command'], 'manual direct submit should leave held queued prompt alone');
  await resolveOldest(page, 'manual direct complete');
  await waitForUiIdle(page);
  assert.equal((await callTexts(page)).length, 3, 'held queue should not auto-drain after a later direct prompt completes');
  assert.deepEqual(await queueTexts(page), ['Edited queued command'], 'held queue should remain available after a later direct prompt completes');

  await submitPrompt(page, 'Second direct after held stop');
  await waitForCalls(page, 4);
  const cancelsBeforeSteer = (await cancelledIds(page)).length;
  await page.locator('#prompt-queue-steer').click();
  await waitForSteers(page, 1);
  await waitForQueueCount(page, 0);
  await waitForUserLine(page, 'Edited queued command');
  assert.deepEqual(await steeredTexts(page), ['Edited queued command'], 'steer should inject the selected queued prompt');
  assert.equal((await callTexts(page)).length, 4, 'steer should not start a separate chat request');
  assert.equal((await cancelledIds(page)).length, cancelsBeforeSteer, 'steering while busy must not cancel the active request');

  await submitPrompt(page, 'Auto drain child');
  await waitForQueueCount(page, 1);
  await resolveOldest(page, 'steered complete');
  await waitForCalls(page, 5);
  assert.equal((await callTexts(page)).at(-1), 'Auto drain child', 'normal completion should auto-drain the next queued prompt');
  await waitForQueueCount(page, 0);
  await resolveOldest(page, 'child complete');
  await waitForUiIdle(page);

  await setConnected(page, false);
  await submitPrompt(page, 'Disconnected direct command');
  await waitForQueueCount(page, 1);
  assert.equal((await callTexts(page)).length, 5, 'disconnected submit should be preserved, not sent');
  assert.equal(await userLineCount(page, 'Disconnected direct command'), 0, 'disconnected preserved prompt should not render as submitted text');
  await setConnected(page, true);
  await waitForCalls(page, 6);
  assert.equal((await callTexts(page)).at(-1), 'Disconnected direct command', 'reconnect should drain preserved prompt');
  await waitForQueueCount(page, 0);

  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')}`);

  console.log('Dialogue state tests passed');
} finally {
  if (browser) await browser.close();
  await stopServer();
}
