#!/usr/bin/env node

/**
 * SEO Dungeon - One-click launcher.
 *
 * Builds the optimized production bundle (if needed), starts the bridge
 * server, and serves the game. The user just runs: npm start
 */

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const LOG_DIR = path.join(ROOT, '.logs');

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
    execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
    console.log('  ✓ Build complete');
    console.log('');
  } catch (e) {
    console.error('  ✗ Build failed. Try running: npm run build');
    process.exit(1);
  }
}

// Start bridge server and tee its stdout/stderr into bridge.log. We pipe
// instead of inherit because inherit would mix bridge output into the
// serve process's terminal stream and make both unreadable. Writing to
// a file keeps both readable and gives us a post-mortem for bugs that
// only happen during long audits.
const bridgeLog = fs.openSync(bridgeLogPath, 'a');
fs.writeSync(bridgeLog, `\n=== Bridge started ${new Date().toISOString()} ===\n`);
const bridge = spawn('node', [path.join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  stdio: ['ignore', bridgeLog, bridgeLog],
  detached: true,
  // Without windowsHide, Windows opens a blank console window for every
  // detached child. We don't want two empty PowerShell windows littering
  // the user's desktop; all bridge output goes to the log file anyway.
  windowsHide: true
});
bridge.unref();
console.log(`  ✓ Bridge server started (port 3001), logging to ${path.relative(ROOT, bridgeLogPath)}`);

// Serve optimized production build
const serve = spawn('npx', ['serve', 'dist', '-l', '3000', '-s'], {
  cwd: ROOT,
  shell: true,
  stdio: 'inherit',
  windowsHide: true
});

console.log('  ✓ Game server starting (port 3000)');
console.log('');
console.log('  Open http://localhost:3000 in your browser.');
console.log('  Codex is the default agent runtime. Open the game and play!');
console.log('');

// Clean up bridge on exit
process.on('exit', () => {
  try { process.kill(-bridge.pid); } catch (e) {}
});
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
