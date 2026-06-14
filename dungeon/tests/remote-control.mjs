import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dungeonRoot = path.resolve(__dirname, '..');
const { port, appPort } = await resolveRemotePorts();
const origin = `http://127.0.0.1:${appPort}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-dungeon-remote-control-'));
const bridgeOutput = [];
let bridge;

async function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const freePort = typeof address === 'object' && address ? address.port : null;
      probe.close(() => {
        if (!freePort) reject(new Error('Unable to allocate a free remote-control test port.'));
        else resolve(freePort);
      });
    });
  });
}

async function resolveRemotePorts() {
  const requestedBridge = process.env.SEO_DUNGEON_REMOTE_TEST_PORT
    ? Number(process.env.SEO_DUNGEON_REMOTE_TEST_PORT)
    : null;
  const requestedApp = process.env.SEO_DUNGEON_REMOTE_TEST_APP_PORT
    ? Number(process.env.SEO_DUNGEON_REMOTE_TEST_APP_PORT)
    : null;
  const bridge = requestedBridge || await reserveFreePort();
  let app = requestedApp || await reserveFreePort();
  while (app === bridge && !requestedApp) app = await reserveFreePort();
  if (app === bridge) throw new Error('Remote bridge and app test ports must be different.');
  return { port: bridge, appPort: app };
}

function runBridge() {
  bridge = spawn(process.execPath, ['server/index.js'], {
    cwd: dungeonRoot,
    env: {
      ...process.env,
      SEO_DUNGEON_BRIDGE_PORT: String(port),
      SEO_DUNGEON_ALLOWED_ORIGINS: origin,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  bridge.stdout.on('data', (chunk) => bridgeOutput.push(chunk.toString()));
  bridge.stderr.on('data', (chunk) => bridgeOutput.push(chunk.toString()));
}

async function stopBridge() {
  if (!bridge || bridge.killed) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.on('exit', resolve);
      killer.on('error', resolve);
    });
  } else {
    bridge.kill('SIGTERM');
  }
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (bridge.exitCode !== null) {
      throw new Error(`Bridge exited early:\n${bridgeOutput.join('').slice(-4000)}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) });
      if (res.ok) return res.json();
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for bridge:\n${bridgeOutput.join('').slice(-4000)}`);
}

function connectClient(label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: origin } });
    const messages = [];
    ws.on('message', (chunk) => {
      const parsed = JSON.parse(String(chunk));
      messages.push(parsed);
    });
    ws.once('open', () => resolve({ label, ws, messages }));
    ws.once('error', reject);
  });
}

async function waitForMessage(client, predicate, label, timeoutMs = 5000) {
  const found = client.messages.find(predicate);
  if (found) return found;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const match = client.messages.find(predicate);
    if (match) return match;
  }
  throw new Error(`Timed out waiting for ${label} on ${client.label}. Messages: ${JSON.stringify(client.messages, null, 2)}`);
}

runBridge();

try {
  const health = await waitForHealth();
  assert.equal(health.supportsRemoteControl, true, 'bridge health should advertise remote control support');
  assert(health.allowedTypes.includes('remote-command'), 'remote-command should be allowlisted');
  assert(health.allowedTypes.includes('remote-command-claim'), 'remote-command-claim should be allowlisted');
  assert(health.allowedTypes.includes('session-event'), 'session-event should be allowlisted');

  const browser = await connectClient('browser');
  const controller = await connectClient('controller');

  controller.ws.send(JSON.stringify({
    id: 2001,
    type: 'remote-command',
    source: 'codex-app',
    command: 'Check the SEO Dungeon control bus.',
    projectPath: tmp,
    profile: 'deep',
    runtime: 'codex',
    dangerousBypass: true,
  }));

  const ack = await waitForMessage(controller, (msg) => msg.id === 2001, 'remote command ack');
  assert.equal(ack.type, 'result', `remote command should be acknowledged: ${JSON.stringify(ack)}`);
  assert.equal(ack.data?.accepted, true, 'remote command ack should mark accepted');
  assert.equal(ack.data?.commandId, ack.data?.event?.commandId, 'ack should expose the broadcast command id');

  const browserRemoteEvent = await waitForMessage(
    browser,
    (msg) => msg.type === 'session-event' && msg.event?.kind === 'remote-command',
    'browser remote-command broadcast'
  );
  assert.equal(browserRemoteEvent.event.command, 'Check the SEO Dungeon control bus.');
  assert.equal(browserRemoteEvent.event.source, 'codex-app');
  assert.equal(browserRemoteEvent.event.projectPath, tmp);
  assert.equal(browserRemoteEvent.event.runtime, 'codex');
  assert.equal(browserRemoteEvent.event.profile, 'deep');
  assert.equal(browserRemoteEvent.event.dangerousBypass, true);

  const controllerRemoteEvent = await waitForMessage(
    controller,
    (msg) => msg.type === 'session-event' && msg.event?.commandId === ack.data.commandId,
    'controller remote-command echo'
  );
  assert.equal(controllerRemoteEvent.event.kind, 'remote-command');

  browser.ws.send(JSON.stringify({
    id: 2002,
    type: 'remote-command-claim',
    commandId: ack.data.commandId,
  }));
  const firstClaim = await waitForMessage(browser, (msg) => msg.id === 2002, 'first remote command claim');
  assert.equal(firstClaim.type, 'result');
  assert.equal(firstClaim.data?.claimed, true, 'first browser should claim the remote command');

  controller.ws.send(JSON.stringify({
    id: 2003,
    type: 'remote-command-claim',
    commandId: ack.data.commandId,
  }));
  const secondClaim = await waitForMessage(controller, (msg) => msg.id === 2003, 'second remote command claim');
  assert.equal(secondClaim.type, 'result');
  assert.equal(secondClaim.data?.claimed, false, 'second client should not claim the same remote command');

  browser.ws.send(JSON.stringify({
    id: 2004,
    type: 'session-event',
    event: {
      kind: 'ledger-command',
      source: 'guild-ledger',
      command: 'Browser-origin mirrored command',
      projectPath: tmp,
    },
  }));

  const mirrorAck = await waitForMessage(browser, (msg) => msg.id === 2004, 'browser session-event ack');
  assert.equal(mirrorAck.type, 'result');
  assert.equal(mirrorAck.data?.accepted, true);

  const mirroredToController = await waitForMessage(
    controller,
    (msg) => msg.type === 'session-event' && msg.event?.kind === 'ledger-command',
    'ledger event mirrored to controller'
  );
  assert.equal(mirroredToController.event.command, 'Browser-origin mirrored command');
  assert.equal(mirroredToController.event.source, 'guild-ledger');
  assert.equal(mirroredToController.event.projectPath, tmp);

  browser.ws.send(JSON.stringify({
    id: 2005,
    type: 'session-event',
    event: {
      kind: 'remote-command',
      source: 'spoofed-browser',
      command: 'Do not execute this spoofed event.',
      runtime: 'claude',
    },
  }));
  const spoof = await waitForMessage(browser, (msg) => msg.id === 2005, 'spoofed remote-command session-event rejection');
  assert.equal(spoof.type, 'error');
  assert.match(spoof.message || '', /guarded command endpoint/i);

  browser.ws.send(JSON.stringify({ id: 2006, type: 'session-state' }));
  const state = await waitForMessage(browser, (msg) => msg.id === 2006, 'session state');
  assert.equal(state.type, 'result');
  assert(state.data.events.some((event) => event.kind === 'remote-command'), 'session state should include remote command history');
  assert(state.data.events.some((event) => event.kind === 'ledger-command'), 'session state should include ledger command history');
  assert(state.data.claimedCommandIds.includes(ack.data.commandId), 'session state should expose claimed remote command ids');

  controller.ws.send(JSON.stringify({
    id: 2007,
    type: 'remote-command',
    source: 'codex-app',
    command: 'Do not route this through Claude.',
    projectPath: tmp,
    runtime: 'claude',
  }));
  const nonCodex = await waitForMessage(controller, (msg) => msg.id === 2007, 'non-Codex remote command rejection');
  assert.equal(nonCodex.type, 'error');
  assert.match(nonCodex.message || '', /Codex-only/i);

  controller.ws.send(JSON.stringify({
    id: 2008,
    type: 'remote-command',
    source: 'codex-app',
    commandId: 'duplicate-remote-id',
    command: 'First command with explicit id.',
    projectPath: tmp,
    runtime: 'codex',
  }));
  const firstExplicitId = await waitForMessage(controller, (msg) => msg.id === 2008, 'first explicit command id');
  assert.equal(firstExplicitId.type, 'result');
  assert.equal(firstExplicitId.data?.commandId, 'duplicate-remote-id');

  controller.ws.send(JSON.stringify({
    id: 2009,
    type: 'remote-command',
    source: 'codex-app',
    commandId: 'duplicate-remote-id',
    command: 'Second command with duplicate explicit id.',
    projectPath: tmp,
    runtime: 'codex',
  }));
  const duplicateId = await waitForMessage(controller, (msg) => msg.id === 2009, 'duplicate command id rejection');
  assert.equal(duplicateId.type, 'error');
  assert.match(duplicateId.message || '', /duplicate remote command id/i);

  browser.ws.close();
  controller.ws.close();
  console.log('Remote control bridge self-test passed');
} finally {
  await stopBridge();
  fs.rmSync(tmp, { recursive: true, force: true });
}
