#!/usr/bin/env node

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
const repoRoot = path.resolve(dungeonRoot, '..');
const defaultOutputRoot = path.join(dungeonRoot, '.logs', 'desktop-proof');
const defaultWebsitePath = 'E:\\seo-dungeon-website';
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');

function parseArgs(argv) {
  const options = {
    outputDir: process.env.SEO_DUNGEON_DESKTOP_PROOF_OUTPUT_DIR || path.join(defaultOutputRoot, runStamp),
    domain: process.env.SEO_DUNGEON_DESKTOP_PROOF_DOMAIN || 'seodungeon.com',
    projectPath: process.env.SEO_DUNGEON_DESKTOP_PROOF_PROJECT || defaultWebsitePath,
    fps: Number(process.env.SEO_DUNGEON_DESKTOP_PROOF_FPS || 12),
    browserX: Number(process.env.SEO_DUNGEON_DESKTOP_PROOF_BROWSER_X || 960),
    browserY: Number(process.env.SEO_DUNGEON_DESKTOP_PROOF_BROWSER_Y || 0),
    browserWidth: Number(process.env.SEO_DUNGEON_DESKTOP_PROOF_BROWSER_WIDTH || 960),
    browserHeight: Number(process.env.SEO_DUNGEON_DESKTOP_PROOF_BROWSER_HEIGHT || 1040),
    keepOpenMs: Number(process.env.SEO_DUNGEON_DESKTOP_PROOF_KEEP_OPEN_MS || 1200),
    fakeCodex: process.env.SEO_DUNGEON_DESKTOP_PROOF_REAL_CODEX !== '1',
    minimizeKnownBlockers: process.env.SEO_DUNGEON_DESKTOP_PROOF_MINIMIZE_BLOCKERS === '1',
    hideKnownBlockers: process.env.SEO_DUNGEON_DESKTOP_PROOF_HIDE_BLOCKERS === '1',
    allowForegroundMismatch: process.env.SEO_DUNGEON_DESKTOP_PROOF_ALLOW_FOREGROUND_MISMATCH === '1',
  };

  const tokens = [...argv];
  while (tokens.length) {
    const token = tokens.shift();
    const readValue = () => {
      if (!tokens.length) throw new Error(`Missing value for ${token}`);
      return tokens.shift();
    };
    if (token === '--output-dir') options.outputDir = path.resolve(readValue());
    else if (token === '--domain') options.domain = readValue();
    else if (token === '--project') options.projectPath = readValue();
    else if (token === '--fps') options.fps = Number(readValue());
    else if (token === '--browser-x') options.browserX = Number(readValue());
    else if (token === '--browser-y') options.browserY = Number(readValue());
    else if (token === '--browser-width') options.browserWidth = Number(readValue());
    else if (token === '--browser-height') options.browserHeight = Number(readValue());
    else if (token === '--keep-open-ms') options.keepOpenMs = Number(readValue());
    else if (token === '--real-codex') options.fakeCodex = false;
    else if (token === '--fake-codex') options.fakeCodex = true;
    else if (token === '--minimize-known-blockers') options.minimizeKnownBlockers = true;
    else if (token === '--hide-known-blockers') {
      options.hideKnownBlockers = true;
      options.minimizeKnownBlockers = true;
    }
    else if (token === '--allow-foreground-mismatch') options.allowForegroundMismatch = true;
    else if (token === '--help' || token === '-h') options.help = true;
    else throw new Error(`Unknown option: ${token}`);
  }

  for (const [name, value] of Object.entries({
    fps: options.fps,
    browserX: options.browserX,
    browserY: options.browserY,
    browserWidth: options.browserWidth,
    browserHeight: options.browserHeight,
    keepOpenMs: options.keepOpenMs,
  })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)} must be a non-negative number.`);
  }
  if (options.fps < 1) throw new Error('--fps must be at least 1.');
  if (options.browserWidth < 400 || options.browserHeight < 400) {
    throw new Error('--browser-width and --browser-height must be at least 400.');
  }
  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/record-desktop-proof.mjs [--output-dir path] [--domain seodungeon.com] [--project E:\\seo-dungeon-website]',
    '    [--browser-x 960] [--browser-y 0] [--browser-width 960] [--browser-height 1040] [--fake-codex|--real-codex]',
    '    [--minimize-known-blockers] [--hide-known-blockers] [--allow-foreground-mismatch]',
    '',
    'Records a full-desktop RC-008 rehearsal with SEO Dungeon in a headed browser window.',
    'This does not automate the Codex desktop UI. Put Codex on the left before running for side-by-side proof framing.',
  ].join('\n');
}

async function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const freePort = typeof address === 'object' && address ? address.port : null;
      probe.close(() => {
        if (!freePort) reject(new Error('Unable to allocate a free desktop proof port.'));
        else resolve(freePort);
      });
    });
  });
}

async function resolvePorts() {
  const appPort = process.env.SEO_DUNGEON_DESKTOP_PROOF_APP_PORT
    ? Number(process.env.SEO_DUNGEON_DESKTOP_PROOF_APP_PORT)
    : await reserveFreePort();
  let bridgePort = process.env.SEO_DUNGEON_DESKTOP_PROOF_BRIDGE_PORT
    ? Number(process.env.SEO_DUNGEON_DESKTOP_PROOF_BRIDGE_PORT)
    : await reserveFreePort();
  while (bridgePort === appPort && !process.env.SEO_DUNGEON_DESKTOP_PROOF_BRIDGE_PORT) {
    bridgePort = await reserveFreePort();
  }
  if (bridgePort === appPort) throw new Error('Desktop proof app and bridge ports must differ.');
  return { appPort, bridgePort };
}

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    ...options,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function spawnNode(args, options) {
  return spawnProcess(process.execPath, args, options);
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

function writeFakeCodexAppServer(file) {
  fs.writeFileSync(file, `
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
    send({ id: msg.id, result: { userAgent: 'fake-codex-desktop-proof', platformFamily: 'test', platformOs: 'test' } });
    return;
  }
  if (msg.method === 'thread/start') {
    send({ id: msg.id, result: { thread: { id: 'thread_desktop_proof' } } });
    send({ method: 'thread/started', params: { thread: { id: 'thread_desktop_proof' } } });
    return;
  }
  if (msg.method === 'turn/start') {
    const prompt = textFromInput(msg.params && msg.params.input);
    const turnId = 'turn_' + nextTurn++;
    const browserOrigin = prompt.includes('Desktop proof browser-origin command');
    const helperOrigin = prompt.includes('Desktop proof Codex helper command');
    const turn = { done: false, timers: [] };
    turns.set(turnId, turn);
    turn.timers.push(setTimeout(() => {
      send({ method: 'turn/started', params: { turn: { id: turnId } } });
      send({ id: msg.id, result: { turn: { id: turnId } } });
      send({ method: 'item/agentMessage/delta', params: { delta: browserOrigin
        ? ' DESKTOP_PROOF_BROWSER_ORIGIN_STREAM.'
        : helperOrigin
          ? ' DESKTOP_PROOF_CODEX_HELPER_STREAM.'
          : ' DESKTOP_PROOF_STREAM.' } });
    }, 120));
    turn.timers.push(setTimeout(() => complete(turnId), 900));
    return;
  }
  if (msg.method === 'turn/interrupt') {
    for (const turnId of turns.keys()) complete(turnId, 'interrupted');
    send({ id: msg.id, result: {} });
  }
});
`, 'utf8');
}

function cliEnv(bridgeWs, origin) {
  return {
    ...process.env,
    SEO_DUNGEON_BRIDGE_URL: bridgeWs,
    SEO_DUNGEON_CONTROLLER_ORIGIN: origin,
  };
}

function runCli(args, { bridgeWs, origin, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnNode(['scripts/remote-control.mjs', ...args], {
      cwd: dungeonRoot,
      env: cliEnv(bridgeWs, origin),
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

async function waitForLedger(page, matcher, label, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const texts = await ledgerTexts(page);
    if (texts.some((text) => matcher.test(text))) return texts;
    await page.waitForTimeout(120);
  }
  throw new Error(`Timed out waiting for ledger line: ${label}\n${(await ledgerTexts(page)).join('\n')}`);
}

async function waitForChildExit(child, timeoutMs = 8000) {
  if (!child || child.exitCode !== null) return child?.exitCode ?? 0;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for child exit.')), timeoutMs);
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function startDesktopRecorder({ capturePath, fps, ffmpegOutput }) {
  const args = [
    '-y',
    '-f', 'gdigrab',
    '-draw_mouse', '1',
    '-framerate', String(fps),
    '-rtbufsize', '256M',
    '-i', 'desktop',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    capturePath,
  ];
  ffmpegOutput.push(`[record] ffmpeg ${args.join(' ')}\n`);
  const proc = spawnProcess('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  proc.stdout.on('data', (chunk) => ffmpegOutput.push(chunk.toString()));
  proc.stderr.on('data', (chunk) => ffmpegOutput.push(chunk.toString()));
  return proc;
}

async function stopDesktopRecorder(proc, ffmpegOutput) {
  if (!proc || proc.exitCode !== null) return;
  try { proc.stdin.write('q'); } catch (_) {}
  try {
    await waitForChildExit(proc, 8000);
  } catch (_) {
    ffmpegOutput.push('\n[recorder] ffmpeg did not stop after q; killing process tree.\n');
    await killTree(proc);
  }
}

function runTool(command, args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out.`));
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

async function positionBrowserWindow(page, options) {
  await page.evaluate(() => { document.title = 'SEO Dungeon Desktop Proof'; }).catch(() => {});
  const session = await page.context().newCDPSession(page);
  const { windowId } = await session.send('Browser.getWindowForTarget');
  await session.send('Browser.setWindowBounds', {
    windowId,
    bounds: {
      left: Math.trunc(options.browserX),
      top: Math.trunc(options.browserY),
      width: Math.trunc(options.browserWidth),
      height: Math.trunc(options.browserHeight),
      windowState: 'normal',
    },
  });
  await session.send('Page.bringToFront').catch(() => {});
  await page.bringToFront();
}

async function focusBrowserWindowByTitle(title, logOutput = []) {
  const titlePattern = String(title || '').replace(/'/g, "''");
  const script = `
Add-Type -Namespace SeoDungeon -Name Win32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetForegroundWindow(System.IntPtr hWnd);
'@
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like '*${titlePattern}*' } | Sort-Object StartTime -Descending | Select-Object -First 1
if (-not $p) { Write-Error 'No matching browser window found'; exit 2 }
[SeoDungeon.Win32]::ShowWindowAsync($p.MainWindowHandle, 9) | Out-Null
Start-Sleep -Milliseconds 200
[SeoDungeon.Win32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Write-Output $p.MainWindowTitle
`;
  const result = await runTool('powershell', ['-NoProfile', '-Command', script], 8000);
  logOutput.push(`\n[focus] code=${result.code}\n${result.stdout}${result.stderr}\n`);
  if (result.code !== 0) throw new Error(`Could not focus browser window:\n${result.stderr || result.stdout}`);
}

async function getForegroundWindowInfo(logOutput = []) {
  const script = `
Add-Type -Namespace SeoDungeon -Name Foreground -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr GetForegroundWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
public static extern int GetWindowText(System.IntPtr hWnd, System.Text.StringBuilder text, int count);
'@
$handle = [SeoDungeon.Foreground]::GetForegroundWindow()
$windowProcessId = [uint32]0
[SeoDungeon.Foreground]::GetWindowThreadProcessId($handle, [ref]$windowProcessId) | Out-Null
$builder = New-Object System.Text.StringBuilder 1024
[SeoDungeon.Foreground]::GetWindowText($handle, $builder, $builder.Capacity) | Out-Null
$process = Get-Process -Id $windowProcessId -ErrorAction SilentlyContinue
[pscustomobject]@{
  processName = $process.ProcessName
  pid = $windowProcessId
  title = $builder.ToString()
} | ConvertTo-Json -Compress
`;
  const result = await runTool('powershell', ['-NoProfile', '-Command', script], 8000);
  logOutput.push(`\n[foreground] code=${result.code}\n${result.stdout}${result.stderr}\n`);
  if (result.code !== 0) throw new Error(`Could not read foreground window:\n${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
}

async function minimizeKnownBlockers(logOutput = [], hide = false) {
  const script = `
Add-Type -Namespace SeoDungeon -Name WindowOps -MemberDefinition @'
public delegate bool EnumWindowsProc(System.IntPtr hWnd, System.IntPtr lParam);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, System.IntPtr lParam);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsWindowVisible(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
public static extern int GetWindowText(System.IntPtr hWnd, System.Text.StringBuilder text, int count);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);
'@
$names = @('CapCut')
$showCommand = ${hide ? 0 : 6}
$targets = Get-Process | Where-Object { $names -contains $_.ProcessName }
$pids = @($targets | ForEach-Object { [int]$_.Id })
if ($pids.Count -gt 0) {
  $callback = [SeoDungeon.WindowOps+EnumWindowsProc]{
    param([System.IntPtr]$hWnd, [System.IntPtr]$lParam)
    [uint32]$windowProcessId = 0
    [SeoDungeon.WindowOps]::GetWindowThreadProcessId($hWnd, [ref]$windowProcessId) | Out-Null
    if ($pids -contains [int]$windowProcessId -and [SeoDungeon.WindowOps]::IsWindowVisible($hWnd)) {
      $builder = New-Object System.Text.StringBuilder 1024
      [SeoDungeon.WindowOps]::GetWindowText($hWnd, $builder, $builder.Capacity) | Out-Null
      [SeoDungeon.WindowOps]::ShowWindowAsync($hWnd, $showCommand) | Out-Null
      Write-Output ('{0}:{1}' -f $windowProcessId, $builder.ToString())
    }
    return $true
  }
  [SeoDungeon.WindowOps]::EnumWindows($callback, [System.IntPtr]::Zero) | Out-Null
}
`;
  const result = await runTool('powershell', ['-NoProfile', '-Command', script], 8000);
  logOutput.push(`\n[${hide ? 'hide' : 'minimize'}-known-blockers] code=${result.code}\n${result.stdout}${result.stderr}\n`);
  if (result.code !== 0) throw new Error(`Could not minimize known blockers:\n${result.stderr || result.stdout}`);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}

async function assertBrowserForeground(options, logOutput = []) {
  if (options.minimizeKnownBlockers) {
    await minimizeKnownBlockers(logOutput, options.hideKnownBlockers);
  }
  await focusBrowserWindowByTitle('SEO Dungeon Desktop Proof', logOutput);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const foregroundInfo = await getForegroundWindowInfo(logOutput);
  if (!foregroundInfo.title?.includes('SEO Dungeon Desktop Proof') && !options.allowForegroundMismatch) {
    throw new Error([
      `Foreground window is "${foregroundInfo.title || '(empty)'}" from ${foregroundInfo.processName || 'unknown'}:${foregroundInfo.pid}, not the SEO Dungeon proof browser.`,
      'Close/minimize the blocking window, pass --minimize-known-blockers, or pass --hide-known-blockers for stubborn known blockers.',
      'Use --allow-foreground-mismatch only for debugging, not final proof.',
    ].join('\n'));
  }
  return foregroundInfo;
}

async function ffprobeVideo(videoPath) {
  const result = await runTool('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-show_streams',
    '-select_streams', 'v:0',
    '-of', 'json',
    videoPath,
  ]);
  if (result.code !== 0) throw new Error(`ffprobe failed:\n${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

async function extractVideoFrame(videoPath, framePath) {
  const result = await runTool('ffmpeg', [
    '-y',
    '-ss', '1',
    '-i', videoPath,
    '-frames:v', '1',
    framePath,
  ], 15000);
  if (result.code !== 0) throw new Error(`ffmpeg frame extraction failed:\n${result.stderr || result.stdout}`);
}

async function remuxVideo(rawVideoPath, videoPath, ffmpegOutput) {
  const result = await runTool('ffmpeg', [
    '-y',
    '-i', rawVideoPath,
    '-c', 'copy',
    videoPath,
  ], 30000);
  ffmpegOutput.push(`\n[remux] code=${result.code}\n${result.stdout}${result.stderr}\n`);
  if (result.code !== 0) throw new Error(`ffmpeg remux failed:\n${result.stderr || result.stdout}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (process.platform !== 'win32') throw new Error('Desktop proof recording currently requires Windows gdigrab.');

  const { appPort, bridgePort } = await resolvePorts();
  const origin = `http://127.0.0.1:${appPort}`;
  const bridgeWs = `ws://127.0.0.1:${bridgePort}`;
  const appUrl = `${origin}/?bridge=${encodeURIComponent(bridgeWs)}`;
  const outputDir = path.resolve(options.outputDir);
  const rawVideoPath = path.join(outputDir, 'desktop-proof-rehearsal.mkv');
  const videoPath = path.join(outputDir, 'desktop-proof-rehearsal.mp4');
  const framePath = path.join(outputDir, 'desktop-proof-frame.png');
  const screenshotPath = path.join(outputDir, 'desktop-proof-browser.png');
  const ledgerPath = path.join(outputDir, 'ledger.txt');
  const manifestPath = path.join(outputDir, 'manifest.json');
  const bridgeOutputPath = path.join(outputDir, 'bridge-output.txt');
  const viteOutputPath = path.join(outputDir, 'vite-output.txt');
  const ffmpegOutputPath = path.join(outputDir, 'ffmpeg-output.txt');
  const watchOutputPath = path.join(outputDir, 'watch-output.jsonl');
  const sendOutputPath = path.join(outputDir, 'send-output.json');
  const failureManifestPath = path.join(outputDir, 'failure-manifest.json');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-dungeon-desktop-proof-'));
  const fallbackProject = path.join(tmp, 'project');
  const fakeCodexAppServer = path.join(tmp, 'fake-codex-app-server.cjs');
  const bridgeOutput = [];
  const viteOutput = [];
  const ffmpegOutput = [];
  let browser;
  let page;
  let bridge;
  let vite;
  let recorder;
  let foregroundBeforeCapture = '';
  let failureError = null;

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(fallbackProject, { recursive: true });
  fs.writeFileSync(path.join(fallbackProject, 'README.md'), '# SEO Dungeon Desktop Proof Fallback Project\n', 'utf8');
  writeFakeCodexAppServer(fakeCodexAppServer);

  const projectPath = fs.existsSync(options.projectPath)
    ? path.resolve(options.projectPath)
    : fallbackProject;

  try {
    bridge = spawnNode(['server/index.js'], {
      cwd: dungeonRoot,
      env: {
        ...process.env,
        SEO_DUNGEON_BRIDGE_PORT: String(bridgePort),
        SEO_DUNGEON_ALLOWED_ORIGINS: origin,
        ...(options.fakeCodex
          ? {
              SEO_DUNGEON_CODEX_CLI: process.execPath,
              SEO_DUNGEON_CODEX_ARGS: `"${fakeCodexAppServer}"`,
            }
          : {}),
      },
    });
    bridge.stdout.on('data', (chunk) => bridgeOutput.push(chunk.toString()));
    bridge.stderr.on('data', (chunk) => bridgeOutput.push(chunk.toString()));

    const viteBin = path.join(dungeonRoot, 'node_modules', 'vite', 'bin', 'vite.js');
    vite = spawnNode([viteBin, '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
      cwd: dungeonRoot,
      env: { ...process.env },
    });
    vite.stdout.on('data', (chunk) => viteOutput.push(chunk.toString()));
    vite.stderr.on('data', (chunk) => viteOutput.push(chunk.toString()));

    await waitForHttp(`http://127.0.0.1:${bridgePort}/health`, 'bridge', bridgeOutput, bridge);
    await waitForHttp(origin, 'vite', viteOutput, vite);

    browser = await chromium.launch({
      headless: false,
      args: [
        `--window-position=${Math.trunc(options.browserX)},${Math.trunc(options.browserY)}`,
        `--window-size=${Math.trunc(options.browserWidth)},${Math.trunc(options.browserHeight)}`,
      ],
    });
    page = await browser.newPage({
      viewport: {
        width: Math.trunc(options.browserWidth),
        height: Math.max(400, Math.trunc(options.browserHeight) - 90),
      },
    });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await positionBrowserWindow(page, options);
    await page.waitForFunction(() => window.__seoDungeonDialogueReady === true, null, { timeout: 15000 });
    await page.waitForFunction(async () => {
      const { bridge } = await import('/src/utils/ws.js');
      return bridge.connected === true ||
        document.querySelector('#bridge-status')?.classList.contains('connected');
    }, null, { timeout: 15000 });
    await page.locator('#domain-input').fill(options.domain);
    await page.locator('#path-input').fill(projectPath);
    if (await page.locator('#danger-mode-toggle').getAttribute('aria-pressed') !== 'true') {
      await page.locator('#danger-mode-toggle').click();
    }
    await positionBrowserWindow(page, options);
    foregroundBeforeCapture = await assertBrowserForeground(options, ffmpegOutput);

    recorder = startDesktopRecorder({ capturePath: rawVideoPath, fps: options.fps, ffmpegOutput });
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (recorder.exitCode !== null) throw new Error(`ffmpeg exited early:\n${ffmpegOutput.join('').slice(-5000)}`);

    const watch = runCli([
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
      '12000',
    ], { bridgeWs, origin, timeoutMs: 15000 });
    await page.waitForTimeout(600);
    await page.locator('#log-input').fill('Desktop proof browser-origin command');
    await page.locator('#log-input').press('Enter');
    await waitForLedger(page, /> Desktop proof browser-origin command/i, 'desktop proof browser-origin command submitted');
    await waitForLedger(page, /DESKTOP_PROOF_BROWSER_ORIGIN_STREAM/i, 'desktop proof browser-origin stream');

    const watchResult = await watch;
    fs.writeFileSync(watchOutputPath, watchResult.stdout, 'utf8');
    assert.equal(watchResult.code, 0, watchResult.stdout);
    const watchLines = parseJsonLines(watchResult.stdout);
    const watchedEvent = watchLines.find((line) => line.type === 'session-event');
    assert.equal(watchedEvent?.event?.command, 'Desktop proof browser-origin command');
    assert.equal(watchedEvent?.event?.projectPath, projectPath);

    await page.waitForFunction(() => {
      const state = window.__seoDungeonDialogueState?.();
      return state && state.queue.length === 0 && state.busy === false;
    }, null, { timeout: 15000 });

    const sendResult = await runCli([
      'send',
      '--json',
      '--wait',
      '--timeout',
      '15000',
      '--project',
      projectPath,
      '--profile',
      'fast',
      '--dangerous-bypass',
      '--',
      'Desktop proof Codex helper command',
    ], { bridgeWs, origin, timeoutMs: 18000 });
    fs.writeFileSync(sendOutputPath, sendResult.stdout, 'utf8');
    assert.equal(sendResult.code, 0, sendResult.stdout);
    const sendJson = JSON.parse(sendResult.stdout);
    assert.equal(sendJson.ok, true);
    assert.equal(sendJson.waitEvent?.status, 'complete');
    await waitForLedger(page, /Remote codex-cli: Desktop proof Codex helper command/i, 'desktop proof helper command mirrored');
    await waitForLedger(page, /DESKTOP_PROOF_CODEX_HELPER_STREAM/i, 'desktop proof helper stream');

    assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join('\n')}`);
    const finalLedger = await ledgerTexts(page);
    fs.writeFileSync(ledgerPath, `${finalLedger.join('\n')}\n`, 'utf8');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.waitForTimeout(options.keepOpenMs);
  } catch (err) {
    failureError = err;
    throw err;
  } finally {
    await stopDesktopRecorder(recorder, ffmpegOutput).catch((err) => ffmpegOutput.push(`\n[recorder] ${err.message}\n`));
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(bridgeOutputPath, bridgeOutput.join(''), 'utf8');
      fs.writeFileSync(viteOutputPath, viteOutput.join(''), 'utf8');
      fs.writeFileSync(ffmpegOutputPath, ffmpegOutput.join(''), 'utf8');
      if (failureError) {
        fs.writeFileSync(failureManifestPath, `${JSON.stringify({
          kind: 'desktop-remote-control-proof-failure',
          createdAt: new Date().toISOString(),
          repoRoot,
          appUrl,
          bridgeWs,
          domain: options.domain,
          projectPath,
          usedFallbackProject: projectPath === fallbackProject,
          fakeCodex: options.fakeCodex,
          minimizedKnownBlockers: options.minimizeKnownBlockers,
          hiddenKnownBlockers: options.hideKnownBlockers,
          allowForegroundMismatch: options.allowForegroundMismatch,
          foregroundBeforeCapture,
          browserWindow: {
            x: options.browserX,
            y: options.browserY,
            width: options.browserWidth,
            height: options.browserHeight,
          },
          ports: {
            app: appPort,
            bridge: bridgePort,
          },
          error: {
            name: failureError.name,
            message: failureError.message,
            stack: failureError.stack,
          },
          bridgeOutput: bridgeOutputPath,
          viteOutput: viteOutputPath,
          ffmpegOutput: ffmpegOutputPath,
        }, null, 2)}\n`, 'utf8');
      }
    } catch (_) {}
    if (browser) await browser.close().catch(() => {});
    await killTree(vite);
    await killTree(bridge);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const rawVideoStats = fs.statSync(rawVideoPath);
  assert(rawVideoStats.size > 4096, `desktop proof raw video is unexpectedly small: ${rawVideoStats.size} bytes`);
  await remuxVideo(rawVideoPath, videoPath, ffmpegOutput);
  fs.writeFileSync(ffmpegOutputPath, ffmpegOutput.join(''), 'utf8');
  const videoStats = fs.statSync(videoPath);
  assert(videoStats.size > 4096, `desktop proof video is unexpectedly small: ${videoStats.size} bytes`);
  await extractVideoFrame(videoPath, framePath);
  const probe = await ffprobeVideo(videoPath);
  const manifest = {
    kind: 'desktop-remote-control-proof-rehearsal',
    createdAt: new Date().toISOString(),
    note: 'Full-desktop capture rehearsal. For final RC-008 proof, put the real Codex app on the left before running so the recording shows Codex plus the SEO Dungeon browser side by side.',
    repoRoot,
    appUrl,
    bridgeWs,
    domain: options.domain,
    projectPath,
    usedFallbackProject: projectPath === fallbackProject,
    fakeCodex: options.fakeCodex,
    minimizedKnownBlockers: options.minimizeKnownBlockers,
    hiddenKnownBlockers: options.hideKnownBlockers,
    foregroundBeforeCapture,
    browserWindow: {
      x: options.browserX,
      y: options.browserY,
      width: options.browserWidth,
      height: options.browserHeight,
    },
    ports: {
      app: appPort,
      bridge: bridgePort,
    },
    rawVideo: rawVideoPath,
    video: videoPath,
    frame: framePath,
    screenshot: screenshotPath,
    ledger: ledgerPath,
    watchOutput: watchOutputPath,
    sendOutput: sendOutputPath,
    bridgeOutput: bridgeOutputPath,
    viteOutput: viteOutputPath,
    ffmpegOutput: ffmpegOutputPath,
    ffprobe: probe,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, manifestPath, videoPath, screenshotPath }, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message || err}\n`);
  process.exitCode = 1;
});
