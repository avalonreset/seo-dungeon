#!/usr/bin/env node

/**
 * SEO Dungeon - One-click launcher.
 *
 * Builds the optimized production bundle (if needed), starts the bridge
 * server, and serves the game. The user just runs: npm start
 */

const { spawn, execFileSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const LOG_DIR = path.join(ROOT, '.logs');

function resolveNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

// Ensure log directory exists. Bridge stdout/stderr get piped here so we
// can diagnose audit parse failures, disconnects, and agent CLI errors
// after the fact. Previously the bridge ran with stdio:'ignore' and
// every console.log inside server/index.js went to /dev/null.
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Rotate the active bridge log by timestamping old runs. Keep the most
// recent 10 so the directory doesn't grow without bound.
const bridgeLogPath = path.join(LOG_DIR, 'bridge.log');
if (fs.existsSync(bridgeLogPath)) {
  const rotated = path.join(LOG_DIR, `bridge-${Date.now()}.log`);
  try { fs.renameSync(bridgeLogPath, rotated); } catch (_) {}
  const archived = fs.readdirSync(LOG_DIR)
    .filter(f => /^bridge-\d+\.log$/.test(f))
    .sort();
  while (archived.length > 10) {
    try { fs.unlinkSync(path.join(LOG_DIR, archived.shift())); } catch (_) {}
  }
}

console.log('');
console.log('  ⚔  SEO Dungeon  ⚔');
console.log('  ─────────────────────────');
console.log('');

// Build production bundle if dist/ doesn't exist or is empty
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log('  Building optimized production bundle...');
  try {
    execFileSync(resolveNpxCommand(), ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: false });
    console.log('  ✓ Build complete');
    console.log('');
  } catch (e) {
    console.error('  ✗ Build failed. Try running: npm run build');
    process.exit(1);
  }
}

function canUsePort(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, '127.0.0.1');
  });
}

async function findOpenPort(preferred, attempts = 24) {
  for (let i = 0; i < attempts; i += 1) {
    const port = preferred + i;
    if (await canUsePort(port)) return port;
  }
  throw new Error(`No open local port found from ${preferred} through ${preferred + attempts - 1}`);
}

let bridge = null;

(async () => {
  const appPort = await findOpenPort(Number(process.env.SEO_DUNGEON_APP_PORT || 3002));
  const bridgePort = await findOpenPort(Number(process.env.SEO_DUNGEON_BRIDGE_PORT || 3003));
  const bridgeUrl = `ws://127.0.0.1:${bridgePort}`;
  const sessionLogPath = process.env.SEO_DUNGEON_SESSION_LOG || path.join(LOG_DIR, 'session-events.jsonl');
  const runtimeConfig = `window.SEO_DUNGEON_BRIDGE_URL = ${JSON.stringify(bridgeUrl)};\n`;
  try {
    fs.writeFileSync(path.join(DIST, 'seo-dungeon-runtime-config.js'), runtimeConfig);
  } catch (_) {}

  // Start bridge server and tee its stdout/stderr into bridge.log. We pipe
  // instead of inherit because inherit would mix bridge output into the
  // serve process's terminal stream and make both unreadable. Writing to
  // a file keeps both readable and gives us a post-mortem for bugs that
  // only happen during long audits.
  const bridgeLog = fs.openSync(bridgeLogPath, 'a');
  fs.writeSync(bridgeLog, '\n=== Bridge started ' + new Date().toISOString() + ' on ' + bridgeUrl + ' ===\n');
  bridge = spawn('node', [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      SEO_DUNGEON_BRIDGE_PORT: String(bridgePort),
      SEO_DUNGEON_ALLOWED_ORIGINS: [
        process.env.SEO_DUNGEON_ALLOWED_ORIGINS || '',
        `http://localhost:${appPort}`,
        `http://127.0.0.1:${appPort}`
      ].filter(Boolean).join(','),
      SEO_DUNGEON_SESSION_LOG: sessionLogPath
    },
    stdio: ['ignore', bridgeLog, bridgeLog],
    detached: true,
    // Without windowsHide, Windows opens a blank console window for every
    // detached child. We don't want two empty PowerShell windows littering
    // the user's desktop; all bridge output goes to the log file anyway.
    windowsHide: true
  });
  bridge.unref();
  console.log(`  ✓ Bridge server started (port ${bridgePort}), logging to ${path.relative(ROOT, bridgeLogPath)}`);
  console.log(`  ✓ Remote session ledger: ${path.relative(ROOT, sessionLogPath)}`);

  // Serve optimized production build
  const serve = spawn(resolveNpxCommand(), ['serve', 'dist', '-l', String(appPort), '-s'], {
    cwd: ROOT,
    shell: false,
    stdio: 'inherit',
    windowsHide: true
  });

  console.log(`  ✓ Game server starting (port ${appPort})`);
  if (appPort !== 3002) console.log(`  Note: port 3002 is busy, so this launch is using ${appPort}.`);
  if (bridgePort !== 3003) console.log(`  Note: port 3003 is busy, so this bridge is using ${bridgePort}.`);
  console.log('');
  console.log(`  Open http://localhost:${appPort} in your browser.`);
  console.log('  Codex is the default agent runtime. Open the game and play!');
  console.log('');
})().catch((err) => {
  console.error(`  ✗ Launch failed: ${err.message}`);
  process.exit(1);
});

// Clean up bridge on exit
process.on('exit', () => {
  try { if (bridge?.pid) process.kill(-bridge.pid); } catch (e) {}
});
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
