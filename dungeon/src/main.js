import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { SummoningScene } from './scenes/SummoningScene.js';
import { DungeonHallScene } from './scenes/DungeonHallScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { VictoryScene } from './scenes/VictoryScene.js';
import { GateScene } from './scenes/GateScene.js';
import { bridge } from './utils/ws.js';
import { initKnightSprite } from './knight-sprite.js';
import { initActivityLog, addLog, showLoadingIndicator, hideLoadingIndicator } from './activity-log.js';
import { SFX } from './utils/sound-manager.js';
import { getProfileKey, getSelectedRuntime } from './profile-config.js';

// Minimum 3x render scale ensures crisp text on 4K monitors.
// On a 4K display with 150% scaling (DPR 1.5), the base 800x600 canvas
// would be CSS-upscaled ~4x, making text blurry. At 3x, the canvas is
// 2400x1800, which closely matches the physical pixel count.
window.GAME_DPR = Math.max(window.devicePixelRatio || 1, 3);

let game = null;

// ── Abort & Return to Title ───────────────────
function returnToTitle() {
  bridge.cancelAll();
  if (game) {
    game.destroy(true);
    game = null;
  }
  document.getElementById('game-container').style.display = 'none';
  _fullBlackTransition('Ascending...', () => location.reload());
}

// Expose for Phaser scenes
window.returnToTitle = returnToTitle;

// Dev hook - lets you push a log line from the browser console for
// debugging or linkifier verification. Harmless in production.
window.addLog = addLog;

// ── Bridge Connection ──────────────────────────
function _createDisconnectBanner() {
  if (document.getElementById('bridge-disconnect-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'bridge-disconnect-banner';
  banner.innerHTML = '&#9888; BRIDGE SERVER DISCONNECTED &mdash; Run <code>npm start</code> in the dungeon/ directory';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
    background: linear-gradient(90deg, #8b0000, #cc2200, #8b0000);
    color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 14px;
    font-weight: bold; text-align: center; padding: 10px 20px;
    letter-spacing: 1px; box-shadow: 0 2px 20px rgba(200, 0, 0, 0.6);
    animation: bannerPulse 2s ease-in-out infinite;
  `;
  if (!document.getElementById('banner-pulse-style')) {
    const s = document.createElement('style');
    s.id = 'banner-pulse-style';
    s.textContent = `
      @keyframes bannerPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.8; } }
      #bridge-disconnect-banner code {
        background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px; font-size: 13px;
      }
    `;
    document.head.appendChild(s);
  }
  document.body.appendChild(banner);
}

function _removeDisconnectBanner() {
  const banner = document.getElementById('bridge-disconnect-banner');
  if (banner) banner.remove();
}

async function connectBridge() {
  const status = document.getElementById('bridge-status');
  let hasObservedInitialStatus = false;

  // Listen for connection state changes globally
  bridge.onStatusChange((connected) => {
    if (!connected && !hasObservedInitialStatus) {
      hasObservedInitialStatus = true;
      return;
    }
    hasObservedInitialStatus = true;

    if (connected) {
      _removeDisconnectBanner();
      // Update title screen status if visible
      if (status) {
        status.textContent = 'Ready.';
        status.className = 'connected';
      }
    } else {
      _createDisconnectBanner();
      addLog('Bridge disconnected!');
      if (status) {
        status.textContent = 'Bridge disconnected - reconnecting...';
        status.className = 'error';
      }
    }
  });

  try {
    await bridge.connect();
    addLog('Ready to kill');
  } catch (err) {
    status.textContent = 'The dungeon is unreachable. Start the server.';
    status.className = 'error';
    addLog('Server offline');
  }
}

// ── Full Black Transition ──────────────────────────────
// True black overlay → label on black → fade out to next state.
// No blue tint, no jump cuts, fully opaque black between states.
function _fullBlackTransition(labelText, onComplete) {
  // Create a true black overlay that covers everything
  let overlay = document.getElementById('transition-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'transition-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100000;
      background: #000; display: flex; align-items: center;
      justify-content: center; flex-direction: column; gap: 16px;
      opacity: 0; pointer-events: all;
      transition: opacity 0.6s ease-in-out;
    `;
    document.body.appendChild(overlay);
  }

  if (!document.getElementById('seal-spin-style')) {
    const s = document.createElement('style');
    s.id = 'seal-spin-style';
    s.textContent = '@keyframes sealSpin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  }

  // Phase 1: Fade overlay to black
  overlay.innerHTML = '';
  overlay.style.opacity = '0';
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });

  // Phase 2: Once fully black, show label + spinner
  setTimeout(() => {
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 28px; height: 28px; border-radius: 50%;
      border: 2px solid #1a1a30; border-top-color: #d4af37;
      animation: sealSpin 0.7s linear infinite;
    `;
    const label = document.createElement('div');
    label.textContent = labelText;
    label.style.cssText = `
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px; color: #606078; letter-spacing: 2px;
      opacity: 0; transition: opacity 0.4s ease-out;
    `;
    overlay.appendChild(spinner);
    overlay.appendChild(label);

    // Fade label in gently
    requestAnimationFrame(() => { label.style.opacity = '1'; });

    // Phase 3: Hold, then fire callback behind the black overlay
    setTimeout(() => {
      onComplete();

      // Phase 4: Fade overlay away to reveal new content
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 650);
      }, 300);
    }, 1400);
  }, 650);
}

// ── Seal Your Fate Transition (descend into dungeon) ──
function _sealTransition(onComplete) {
  const titleScreen = document.getElementById('title-screen');

  // 1. Stagger-fade all title screen elements
  const elements = [
    titleScreen.querySelector('.tagline'),
    titleScreen.querySelector('#descend-btn'),
    titleScreen.querySelector('#bridge-status'),
    ...titleScreen.querySelectorAll('.form-group'),
    titleScreen.querySelector('.subtitle'),
    titleScreen.querySelector('h1'),
  ].filter(Boolean);

  const charOptions = titleScreen.querySelectorAll('.char-option');

  elements.forEach((el, i) => {
    el.style.transition = `opacity 0.25s ease-in ${i * 0.06}s, transform 0.3s ease-in ${i * 0.06}s`;
    el.style.opacity = '0';
    el.style.transform = 'scale(0.95) translateY(8px)';
  });

  charOptions.forEach((el, i) => {
    el.style.transition = `opacity 0.4s ease-in ${0.2 + i * 0.08}s, transform 0.4s ease-in ${0.2 + i * 0.08}s`;
    el.style.opacity = '0';
    el.style.transform = 'scale(0.8)';
  });

  // 2. After elements fade, do the full black transition
  setTimeout(() => {
    _fullBlackTransition('Descending...', onComplete);
  }, 700);
}

// ── Launch Game ────────────────────────────────
function launchGame(domain, projectPath) {
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  document.getElementById('sfx-control').style.display = 'none';

  addLog(`Hunting: ${domain}`);
  addLog(`Source: ${projectPath}`);
  addLog(`CLI: ${getSelectedRuntime().toUpperCase()}`);

  const dpr = window.GAME_DPR;
  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: Math.round(800 * dpr),
    height: Math.round(600 * dpr),
    pixelArt: false,
    roundPixels: false,
    backgroundColor: '#0a0a1a',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BootScene, GateScene, SummoningScene, DungeonHallScene, BattleScene, VictoryScene]
  };

  game = new Phaser.Game(config);
  game.dpr = dpr;
  game.domain = domain;
  game.projectPath = projectPath;
  game.characterConfig = window.selectedCharacter
    ? { ...window.selectedCharacter, runtime: getSelectedRuntime() }
    : null;
  game.addLog = addLog;
  game.showLoading = showLoadingIndicator;
  game.hideLoading = hideLoadingIndicator;
}

// ── Quest timer: visibility-aware pause/resume ─────────────
// When the user Alt-Tabs, minimizes, closes the lid, or switches tabs,
// we stop counting toward "TIME IN THE DARK" on the final ledger.
// Resumes as soon as the tab is visible again. One listener, lives as
// long as the page. DungeonHall stamps the start; Summoning resets on
// a new audit; the final victory sequence reads the accumulated total.
document.addEventListener('visibilitychange', () => {
  if (!game || game._questStartMs == null) return;
  if (document.visibilityState === 'hidden') {
    // Bank the visible session so far
    if (game._questVisibleSince) {
      game._questActiveMs = (game._questActiveMs || 0) + (Date.now() - game._questVisibleSince);
      game._questVisibleSince = null;
    }
  } else if (document.visibilityState === 'visible') {
    // Start a new visible session
    game._questVisibleSince = Date.now();
  }
});

// ── Title Screen Events ────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Init animated systems
  initActivityLog();
  initKnightSprite();

  addLog('Waiting');

  // ── SFX Volume Control ─────────────────────
  const sfxToggle = document.getElementById('sfx-toggle');
  const sfxVolume = document.getElementById('sfx-volume');
  let sfxMuted = false;
  let sfxPrevVol = SFX.getVolume();

  // Load saved preference
  try {
    const saved = localStorage.getItem('sfx_volume');
    if (saved !== null) {
      const v = parseFloat(saved);
      SFX.setVolume(v);
      sfxVolume.value = Math.round(v * 100);
      if (v === 0) { sfxMuted = true; sfxToggle.classList.add('muted'); sfxToggle.textContent = '\uD83D\uDD07'; }
    }
  } catch (_) {}

  sfxVolume.addEventListener('input', () => {
    const v = parseInt(sfxVolume.value) / 100;
    SFX.setVolume(v);
    sfxMuted = v === 0;
    sfxToggle.classList.toggle('muted', sfxMuted);
    sfxToggle.textContent = sfxMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
    sfxPrevVol = v || sfxPrevVol;
    try { localStorage.setItem('sfx_volume', String(v)); } catch (_) {}
  });

  sfxToggle.addEventListener('click', () => {
    sfxMuted = !sfxMuted;
    if (sfxMuted) {
      sfxPrevVol = SFX.getVolume() || sfxPrevVol || 0.35;
      SFX.setVolume(0);
      sfxVolume.value = 0;
      sfxToggle.textContent = '\uD83D\uDD07';
    } else {
      SFX.setVolume(sfxPrevVol);
      sfxVolume.value = Math.round(sfxPrevVol * 100);
      sfxToggle.textContent = '\uD83D\uDD0A';
    }
    sfxToggle.classList.toggle('muted', sfxMuted);
    try { localStorage.setItem('sfx_volume', String(SFX.getVolume())); } catch (_) {}
  });

  const domainInput = document.getElementById('domain-input');
  const pathInput = document.getElementById('path-input');
  const btn = document.getElementById('descend-btn');
  const errorArea = document.getElementById('validation-errors');

  // Remember the last domain + project folder the user descended with,
  // so they don't have to retype them every launch. Keys are namespaced
  // so they don't collide with the audit cache.
  const LS_DOMAIN_KEY = 'seo_dungeon_last_domain';
  const LS_PATH_KEY = 'seo_dungeon_last_path';
  try {
    const savedDomain = localStorage.getItem(LS_DOMAIN_KEY);
    const savedPath = localStorage.getItem(LS_PATH_KEY);
    if (savedDomain && savedDomain.trim()) domainInput.value = savedDomain;
    if (savedPath && savedPath.trim()) pathInput.value = savedPath;
  } catch (_) { /* localStorage blocked or unavailable - use HTML defaults */ }

  // ── Validation helpers ──────────────────────
  function cleanDomain(raw) {
    let d = raw.trim();
    d = d.replace(/^https?:\/\//i, '');
    d = d.replace(/\/+$/, '');
    return d;
  }

  function isDomainValid(raw) {
    const d = cleanDomain(raw);
    return d.length > 0 && d.includes('.');
  }

  function isPathValid(raw) {
    return raw.trim().length > 0;
  }

  function updateButtonState() {
    const domainOk = isDomainValid(domainInput.value);
    const pathOk = isPathValid(pathInput.value);
    btn.disabled = !(domainOk && pathOk && bridge.connected);
    // Clear error area when both valid
    if (domainOk && pathOk) {
      errorArea.textContent = bridge.connected ? '' : 'Bridge server not connected';
    }
  }

  // Re-check button state when bridge connection changes
  bridge.onStatusChange(() => updateButtonState());

  // ── Live validation on input ────────────────
  domainInput.addEventListener('input', () => {
    const val = domainInput.value.trim();
    if (val.length === 0) {
      domainInput.classList.remove('valid', 'invalid');
    } else if (isDomainValid(val)) {
      domainInput.classList.add('valid');
      domainInput.classList.remove('invalid');
    } else {
      domainInput.classList.add('invalid');
      domainInput.classList.remove('valid');
    }
    updateButtonState();
  });

  pathInput.addEventListener('input', () => {
    const val = pathInput.value.trim();
    if (val.length === 0) {
      pathInput.classList.remove('valid', 'invalid');
    } else {
      pathInput.classList.add('valid');
      pathInput.classList.remove('invalid');
    }
    updateButtonState();
  });

  // Show red border when user leaves an empty path field
  pathInput.addEventListener('blur', () => {
    if (pathInput.value.trim().length === 0) {
      pathInput.classList.add('invalid');
      pathInput.classList.remove('valid');
    }
  });

  // Show red border when user leaves domain with no dot
  domainInput.addEventListener('blur', () => {
    const val = domainInput.value.trim();
    if (val.length > 0 && !isDomainValid(val)) {
      domainInput.classList.add('invalid');
      domainInput.classList.remove('valid');
    } else if (val.length === 0) {
      domainInput.classList.remove('valid', 'invalid');
    }
  });

  // ── Launch with validation ──────────────────
  const launch = () => {
    const errors = [];
    if (!isDomainValid(domainInput.value)) {
      errors.push('Enter a valid domain');
      domainInput.classList.add('invalid');
      domainInput.classList.remove('valid');
    }
    if (!isPathValid(pathInput.value)) {
      errors.push('Project folder is required');
      pathInput.classList.add('invalid');
      pathInput.classList.remove('valid');
    }
    if (errors.length > 0) {
      errorArea.textContent = errors.join(' · ');
      return;
    }
    errorArea.textContent = '';
    btn.disabled = true;
    SFX.play('menuConfirm');
    const domain = cleanDomain(domainInput.value);
    const path = pathInput.value.trim();
    // Persist the successful inputs so next launch restores them.
    try {
      localStorage.setItem(LS_DOMAIN_KEY, domain);
      localStorage.setItem(LS_PATH_KEY, path);
    } catch (_) { /* ignore quota or disabled storage */ }
    _sealTransition(() => launchGame(domain, path));
  };

  btn.addEventListener('click', launch);
  btn.addEventListener('mouseenter', () => { if (!btn.disabled) SFX.play('menuHover'); });
  domainInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch(); });
  pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch(); });

  // Set initial validation state from pre-filled values
  updateButtonState();
  if (domainInput.value.trim() && isDomainValid(domainInput.value)) {
    domainInput.classList.add('valid');
  }
  if (pathInput.value.trim()) {
    pathInput.classList.add('valid');
  }

  connectBridge();
  setTimeout(() => domainInput.focus(), 300);

  // ── Ledger Terminal (one-shot Codex turns) ─────
  const logInput = document.getElementById('log-input');
  const logInputBar = document.getElementById('log-input-bar');
  const logCancel = document.getElementById('log-cancel');
  let lastEscTime = 0;
  let ledgerRunning = false;

  let interactiveTimeout = null;
  let lastStreamTime = 0;

  const resetLoadingState = () => {
    ledgerRunning = false;
    logInputBar.classList.remove('running');
    hideLoadingIndicator();
    if (interactiveTimeout) { clearTimeout(interactiveTimeout); interactiveTimeout = null; }
  };

  // Watchdog: if no stream data arrives for 30s, assume it's done/dead
  const startWatchdog = () => {
    if (interactiveTimeout) clearTimeout(interactiveTimeout);
    interactiveTimeout = setTimeout(() => {
      if (ledgerRunning) {
        resetLoadingState();
      }
    }, 30000);
  };

  const sendLedgerCommand = (text) => {
    if (!text.trim()) return;
    if (!bridge.connected) { addLog('Bridge not connected.'); return; }
    logInput.value = '';
    logInput.style.height = 'auto'; // reset textarea height

    // If we're in a battle, route through doAttack so everything is synchronized
    if (game) {
      const battleScene = game.scene.getScene('Battle');
      if (battleScene && battleScene.scene.isActive() && battleScene.isPlayerTurn && !battleScene.battleOver) {
        battleScene.doAttack(text);
        return;
      }
    }

    // Outside battle - neutral chat. Pass-through to Codex in the user's
    // project dir. No demon anchoring; the user can ask anything.
    logInputBar.classList.add('running');
    showLoadingIndicator();
    addLog('> ' + text);
    ledgerRunning = true;
    lastStreamTime = Date.now();
    startWatchdog();

    const projectPath = document.getElementById('path-input')?.value?.trim() || '.';
    const profile = getProfileKey(window.selectedCharacter?.profile || window.selectedCharacter?.model);
    const runtime = window.selectedCharacter?.runtime || getSelectedRuntime();

    (async () => {
      try {
        const result = await bridge.chat(text, projectPath, profile, runtime, (chunk) => {
          lastStreamTime = Date.now();
          if (interactiveTimeout) clearTimeout(interactiveTimeout);
          startWatchdog();
          const clean = chunk.replace(/[\n\r]+/g, ' ').trim();
          if (clean.length > 0) addLog(clean);
        });
        if (result?.data?.summary) addLog(result.data.summary);
      } catch (err) {
        if (err.message !== 'Cancelled by user') {
          addLog('Error: ' + (err.message || 'unknown'));
        }
      } finally {
        resetLoadingState();
      }
    })();
  };

  // Auto-resize textarea as user types - push log content up
  const logContent = document.getElementById('log-content');
  const autoResize = () => {
    logInput.style.height = 'auto';
    logInput.style.height = Math.min(logInput.scrollHeight, 120) + 'px';
    logInput.style.overflowY = logInput.scrollHeight > 120 ? 'auto' : 'hidden';
    // Keep log scrolled to bottom as input grows
    if (logContent) logContent.scrollTop = logContent.scrollHeight;
  };
  logInput.addEventListener('input', autoResize);

  logInput.addEventListener('keydown', (e) => {
    // Enter submits, Shift+Enter adds newline
    if (e.key === 'Enter' && !e.shiftKey && logInput.value.trim()) {
      e.preventDefault();
      sendLedgerCommand(logInput.value);
      logInput.style.height = 'auto'; // reset height after send
    }
    if (e.key === 'Escape') {
      const now = Date.now();
      if (now - lastEscTime < 500 && ledgerRunning) {
        bridge.cancelLedger();
        addLog('Interrupted.');
        logInputBar.classList.remove('running');
        ledgerRunning = false;
        hideLoadingIndicator();
      }
      lastEscTime = now;
    }
  });

  // Global Escape handler - double-tap cancels any active agent operation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const now = Date.now();
      if (now - lastEscTime < 500) {
        // Cancel neutral ledger activity
        if (ledgerRunning) {
          bridge.cancelLedger();
          addLog('Interrupted.');
          logInputBar.classList.remove('running');
          ledgerRunning = false;
          hideLoadingIndicator();
        }
        // Cancel active battle attack
        if (game) {
          const battleScene = game.scene.getScene('Battle');
          if (battleScene && battleScene._activeRequestId) {
            bridge.cancel(battleScene._activeRequestId);
          }
        }
        // Cancel active audit
        if (bridge.activeAuditId) {
          bridge.cancel(bridge.activeAuditId);
          addLog('Audit cancelled.');
        }
      }
      lastEscTime = now;
    }
  });

  logCancel.addEventListener('click', () => {
    if (ledgerRunning) {
      bridge.cancelLedger();
      addLog('Interrupted.');
      logInputBar.classList.remove('running');
      ledgerRunning = false;
      hideLoadingIndicator();
    }
    // Also cancel battle/audit
    if (game) {
      const battleScene = game.scene.getScene('Battle');
      if (battleScene && battleScene._activeRequestId) {
        bridge.cancel(battleScene._activeRequestId);
      }
    }
    if (bridge.activeAuditId) {
      bridge.cancel(bridge.activeAuditId);
      addLog('Audit cancelled.');
    }
  });

  // ── Dev shortcut: ?battle=1 skips to battle with first cached demon ──
  const params = new URLSearchParams(window.location.search);
  if (params.get('battle')) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('seo_dungeon_audit_'));
    if (keys.length > 0) {
      let cached; try { cached = JSON.parse(localStorage.getItem(keys[0])); } catch (_) {}
      if (cached?.auditData?.issues?.length) {
        const issueIdx = parseInt(params.get('issue') || '0', 10);
        const issue = cached.auditData.issues[issueIdx] || cached.auditData.issues[0];
        addLog(`DEV: jumping to battle - ${issue.title}`);
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        const dpr = window.GAME_DPR;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: 'game-container',
          width: Math.round(800 * dpr), height: Math.round(600 * dpr),
          pixelArt: false, roundPixels: false,
          backgroundColor: '#0a0a1a',
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
          scene: [BootScene, GateScene, SummoningScene, DungeonHallScene, BattleScene, VictoryScene]
        });
        game.dpr = dpr;
        game.domain = cached.domain;
        game.auditData = cached.auditData;
        game.characterConfig = window.selectedCharacter || {
          profile: getProfileKey(cached.profile || cached.model),
          model: getProfileKey(cached.profile || cached.model),
          runtime: cached.runtime || getSelectedRuntime()
        };
        game.addLog = addLog;
        game.showLoading = showLoadingIndicator;
        game.hideLoading = hideLoadingIndicator;
        // After boot, jump straight to battle
        game.events.on('ready', () => {
          game.scene.start('Boot');
          // Wait for Boot to finish loading assets, then override to Battle
          game.scene.getScene('Boot').events.on('create', () => {
            game.scene.getScene('Boot').time.delayedCall(500, () => {
              game.scene.start('Battle', { issue });
            });
          });
        });
      }
    }
  }
});
