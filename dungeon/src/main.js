import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { SummoningScene } from './scenes/SummoningScene.js';
import { DungeonHallScene } from './scenes/DungeonHallScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { VictoryScene } from './scenes/VictoryScene.js';
import { GateScene } from './scenes/GateScene.js';
import { bridge } from './utils/ws.js';
import { initKnightSprite } from './knight-sprite.js';
import { initActivityLog, addLog, showLoadingIndicator, hideLoadingIndicator, flushLogQueue } from './activity-log.js';
import { SFX } from './utils/sound-manager.js';
import { getDangerousBypassEnabled, getProfileKey, getSelectedRuntime } from './profile-config.js';

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

function refreshGameLayout() {
  if (game?.scale?.refresh) {
    requestAnimationFrame(() => game?.scale?.refresh());
  }
}

function initResponsiveTitleStage() {
  const gameArea = document.getElementById('game-area');
  if (!gameArea) return;

  const updateTitleScale = () => {
    const rect = gameArea.getBoundingClientRect();
    const titleScale = Math.min(rect.width / 960, rect.height / 900);
    const characterScale = Math.min(rect.width / 900, rect.height / 820);
    const clampedTitle = Math.min(Math.max(titleScale, 0.62), 1.08);
    const clampedCharacters = Math.min(Math.max(characterScale, 0.58), 1.34);
    document.body.style.setProperty('--title-scale', clampedTitle.toFixed(3));
    document.body.style.setProperty('--character-scale', clampedCharacters.toFixed(3));
  };

  updateTitleScale();

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(updateTitleScale);
    observer.observe(gameArea);
  } else {
    window.addEventListener('resize', updateTitleScale);
  }
}

function initLedgerControls() {
  const panel = document.getElementById('log-panel');
  const resizer = document.getElementById('ledger-resizer');
  const hideBtn = document.getElementById('ledger-toggle');
  const showBtn = document.getElementById('ledger-open-toggle');
  if (!panel || !resizer || !hideBtn || !showBtn) return;

  const WIDTH_KEY = 'seo_dungeon_ledger_width';
  const HIDDEN_KEY = 'seo_dungeon_ledger_hidden';

  const clampWidth = (value) => {
    const viewport = window.innerWidth || 1200;
    const minGameWidth = Math.min(640, Math.max(420, viewport * 0.42));
    const maxWidth = Math.max(280, Math.min(760, viewport - minGameWidth));
    return Math.round(Math.min(Math.max(value, 280), maxWidth));
  };

  let currentWidth = clampWidth(window.innerWidth * 0.3333);

  const applyWidth = (value, persist = true, refresh = true) => {
    const width = clampWidth(value);
    currentWidth = width;
    document.body.style.setProperty('--ledger-width', `${width}px`);
    if (persist) {
      try { localStorage.setItem(WIDTH_KEY, String(width)); } catch (_) {}
    }
    if (refresh) refreshGameLayout();
  };

  const setHidden = (hidden, captureVisibleWidth = true) => {
    if (hidden) {
      if (captureVisibleWidth) {
        const width = panel.getBoundingClientRect().width;
        if (width > 2) currentWidth = clampWidth(width);
      }
      document.body.classList.add('ledger-hidden');
    } else {
      document.body.classList.remove('ledger-hidden');
      applyWidth(currentWidth, false, false);
    }
    hideBtn.setAttribute('aria-expanded', String(!hidden));
    showBtn.setAttribute('aria-expanded', String(!hidden));
    try { localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0'); } catch (_) {}
    refreshGameLayout();
  };

  try {
    const savedWidth = parseInt(localStorage.getItem(WIDTH_KEY) || '', 10);
    if (Number.isFinite(savedWidth)) currentWidth = clampWidth(savedWidth);
    applyWidth(currentWidth, false, false);
    setHidden(localStorage.getItem(HIDDEN_KEY) === '1', false);
  } catch (_) {
    applyWidth(currentWidth, false, false);
    setHidden(false);
  }

  hideBtn.addEventListener('click', () => setHidden(true));
  showBtn.addEventListener('click', () => setHidden(false));

  let startX = 0;
  let startWidth = 0;
  let activePointerId = null;

  resizer.addEventListener('pointerdown', (event) => {
    if (document.body.classList.contains('ledger-hidden')) return;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    document.body.classList.add('ledger-resizing');
    resizer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  resizer.addEventListener('pointermove', (event) => {
    if (activePointerId !== event.pointerId) return;
    applyWidth(startWidth + (startX - event.clientX), false);
  });

  const endResize = (event) => {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    document.body.classList.remove('ledger-resizing');
    try { resizer.releasePointerCapture(event.pointerId); } catch (_) {}
    const finalWidth = panel.getBoundingClientRect().width;
    if (finalWidth > 0) applyWidth(finalWidth, true);
  };

  resizer.addEventListener('pointerup', endResize);
  resizer.addEventListener('pointercancel', endResize);

  window.addEventListener('resize', () => {
    if (document.body.classList.contains('ledger-hidden')) return;
    applyWidth(currentWidth, false, false);
    refreshGameLayout();
  });
}

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
    titleScreen.querySelector('#danger-mode-toggle'),
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
  if (getSelectedRuntime() === 'codex') {
    addLog(`Codex mode: ${getDangerousBypassEnabled() ? 'YOLO bypass' : 'standard sandbox'}`);
  }

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
    ? { ...window.selectedCharacter, runtime: getSelectedRuntime(), dangerousBypass: getDangerousBypassEnabled() }
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
  initResponsiveTitleStage();
  initLedgerControls();
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
  const openDomainBtn = document.getElementById('open-domain-btn');
  const openFolderBtn = document.getElementById('open-folder-btn');
  const btn = document.getElementById('descend-btn');
  const errorArea = document.getElementById('validation-errors');

  // Remember the last domain + project folder the user descended with,
  // so they don't have to retype them every launch. Keys are namespaced
  // so they don't collide with the audit cache.
  const LS_DOMAIN_KEY = 'seo_dungeon_last_domain';
  const LS_PATH_KEY = 'seo_dungeon_last_path';
  const DEFAULT_PROJECT_PATH = pathInput?.defaultValue || '';
  const staleDefaultPaths = new Set([
    'd:\\seodungeon',
    'd:/seodungeon',
    'e:\\claude-seo-dungeon-website',
    'e:/claude-seo-dungeon-website'
  ]);
  const isStaleDefaultPath = (value) => staleDefaultPaths.has(String(value || '').trim().toLowerCase());
  try {
    const savedDomain = localStorage.getItem(LS_DOMAIN_KEY);
    const savedPath = localStorage.getItem(LS_PATH_KEY);
    if (savedDomain && savedDomain.trim()) domainInput.value = savedDomain;
    if (savedPath && savedPath.trim()) {
      pathInput.value = isStaleDefaultPath(savedPath) && DEFAULT_PROJECT_PATH
        ? DEFAULT_PROJECT_PATH
        : savedPath;
    }
  } catch (_) { /* localStorage blocked or unavailable - use HTML defaults */ }

  const persistTitleInputs = () => {
    try {
      const domain = domainInput.value.trim();
      const projectPath = pathInput.value.trim();
      if (domain) localStorage.setItem(LS_DOMAIN_KEY, domain);
      else localStorage.removeItem(LS_DOMAIN_KEY);
      if (projectPath) localStorage.setItem(LS_PATH_KEY, projectPath);
      else localStorage.removeItem(LS_PATH_KEY);
    } catch (_) {}
  };

  // ── Validation helpers ──────────────────────
  function cleanDomain(raw) {
    let d = normalizeKnownDomainAlias(raw);
    d = d.replace(/^https?:\/\//i, '');
    d = d.replace(/\/+$/, '');
    return d;
  }

  function normalizeKnownDomainAlias(raw) {
    const trimmed = raw.trim();
    const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (key === 'seodungeon' || key === 'dungeonseo') {
      return 'seodungeon.com';
    }
    return trimmed;
  }

  function isDomainValid(raw) {
    if (!raw.trim()) return false;
    try {
      normalizeWebsiteUrl(raw);
      return true;
    } catch (_) {
      return false;
    }
  }

  function isPathValid(raw) {
    return raw.trim().length > 0;
  }

  function normalizeWebsiteUrl(raw) {
    const trimmed = normalizeKnownDomainAlias(raw);
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!/^https?:$/i.test(url.protocol) || !url.hostname.includes('.')) {
      throw new Error('Invalid website URL');
    }
    return url.href;
  }

  function openWebsiteUrl(url) {
    if (!openDomainBtn) return false;
    openDomainBtn.href = url;
    return true;
  }

  function setAnchorButtonDisabled(anchor, disabled) {
    if (!anchor) return;
    anchor.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    anchor.tabIndex = disabled ? -1 : 0;
  }

  function updateButtonState() {
    const domainOk = isDomainValid(domainInput.value);
    const pathOk = isPathValid(pathInput.value);
    const yoloOk = getDangerousBypassEnabled();
    btn.disabled = !(domainOk && pathOk && yoloOk && bridge.connected);
    if (openDomainBtn) {
      setAnchorButtonDisabled(openDomainBtn, !domainOk);
      if (domainOk) {
        try { openDomainBtn.href = normalizeWebsiteUrl(domainInput.value); } catch (_) {}
      } else {
        openDomainBtn.removeAttribute('href');
      }
    }
    if (openFolderBtn) openFolderBtn.disabled = !bridge.connected;
    if (domainOk && pathOk) {
      errorArea.textContent = yoloOk && !bridge.connected ? 'Bridge server not connected' : '';
    }
  }

  // Re-check button state when bridge connection changes
  bridge.onStatusChange(() => updateButtonState());
  window.addEventListener('seo-dungeon-dangerous-bypass-change', () => updateButtonState());

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
    persistTitleInputs();
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
    persistTitleInputs();
    updateButtonState();
  });

  openDomainBtn?.addEventListener('click', (event) => {
    const raw = domainInput.value.trim();
    if (!isDomainValid(raw)) {
      event.preventDefault();
      return;
    }
    let url;
    try {
      url = normalizeWebsiteUrl(raw);
    } catch (_) {
      event.preventDefault();
      addLog('Invalid website URL.');
      return;
    }
    persistTitleInputs();
    openWebsiteUrl(url);
    addLog(`Opening website: ${url}`);
  });

  openFolderBtn?.addEventListener('click', async () => {
    const projectPath = pathInput.value.trim();
    persistTitleInputs();
    if (!bridge.connected) {
      addLog('Bridge not connected.');
      return;
    }
    openFolderBtn.disabled = true;
    try {
      addLog(projectPath ? `Opening folder: ${projectPath}` : 'Choosing project folder...');
      const result = await bridge.openFolder(projectPath);
      const folderPath = String(result?.data?.path || projectPath).trim();
      const displayPath = folderPath.replace(/\\/g, '/');
      if (result?.data?.action === 'selected') {
        if (projectPath) addLog('Saved folder was unavailable; chose a new project folder.');
        pathInput.value = folderPath;
        pathInput.classList.add('valid');
        pathInput.classList.remove('invalid');
        persistTitleInputs();
        addLog(`Selected folder: ${displayPath}`);
      } else {
        addLog(`Opened folder: ${displayPath}`);
      }
    } catch (err) {
      addLog(`Could not open folder: ${err.message || 'unknown error'}`);
    } finally {
      updateButtonState();
    }
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
    if (!getDangerousBypassEnabled()) {
      errors.push('Arm YOLO Mode');
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
  const promptQueuePanel = document.getElementById('prompt-queue-panel');
  const promptQueueTitle = document.getElementById('prompt-queue-title');
  const promptQueueList = document.getElementById('prompt-queue-list');
  const logStop = document.getElementById('log-stop');
  const promptQueueSteer = document.getElementById('prompt-queue-steer');
  const promptQueueClear = document.getElementById('prompt-queue-clear');
  const promptEditModal = document.getElementById('prompt-edit-modal');
  const promptEditText = document.getElementById('prompt-edit-text');
  const promptEditSave = document.getElementById('prompt-edit-save');
  const promptEditCancel = document.getElementById('prompt-edit-cancel');
  const promptEditRemove = document.getElementById('prompt-edit-remove');
  let lastEscTime = 0;
  let ledgerRunning = false;
  let promptQueueId = 0;
  let queueDrainTimer = null;
  let queueHold = false;
  const suppressedDrainIds = new Set();
  let selectedPromptId = null;
  let editingPromptId = null;
  let draggedPromptId = null;
  const promptQueue = [];

  let interactiveTimeout = null;
  let lastStreamTime = 0;

  const resetLoadingState = () => {
    ledgerRunning = false;
    logInputBar.classList.remove('running');
    hideLoadingIndicator();
    if (interactiveTimeout) { clearTimeout(interactiveTimeout); interactiveTimeout = null; }
    renderPromptQueue();
    updatePromptControls();
  };

  // Watchdog: if no stream data arrives for 30s, assume it's done/dead
  const startWatchdog = () => {
    if (interactiveTimeout) clearTimeout(interactiveTimeout);
    interactiveTimeout = setTimeout(() => {
      if (ledgerRunning) {
        resetLoadingState();
        scheduleQueueDrain();
      }
    }, 30000);
  };

  const truncatePrompt = (text, max = 120) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
  };

  const getBattleScene = () => {
    if (!game) return null;
    const battleScene = game.scene.getScene('Battle');
    if (!battleScene || !battleScene.scene?.isActive()) return null;
    return battleScene;
  };

  const isBattleBusy = () => {
    const battleScene = getBattleScene();
    return Boolean(
      battleScene &&
      !battleScene.battleOver &&
      (!battleScene.isPlayerTurn || battleScene._activeRequestId)
    );
  };

  const isAgentBusy = () => Boolean(
    ledgerRunning ||
    bridge.activeLedgerId ||
    bridge.activeAuditId ||
    bridge.activeFixId ||
    bridge.activeCommitId ||
    bridge.activeNarrationId ||
    isBattleBusy()
  );

  function findPromptIndex(id) {
    return promptQueue.findIndex((entry) => entry.id === id);
  }

  function ensurePromptSelection() {
    if (promptQueue.length === 0) {
      selectedPromptId = null;
      return;
    }
    if (findPromptIndex(selectedPromptId) < 0) {
      selectedPromptId = promptQueue[0].id;
    }
  }

  function removeQueuedPrompt(id, { announce = true } = {}) {
    const idx = findPromptIndex(id);
    if (idx < 0) return null;
    const [removed] = promptQueue.splice(idx, 1);
    if (selectedPromptId === id) {
      selectedPromptId = promptQueue[idx]?.id || promptQueue[idx - 1]?.id || promptQueue[0]?.id || null;
    }
    if (announce) addLog('Removed queued prompt.');
    renderPromptQueue();
    updatePromptControls();
    return removed;
  }

  function renderPromptQueue() {
    const hasQueue = promptQueue.length > 0;
    const busy = isAgentBusy();
    ensurePromptSelection();
    promptQueuePanel?.classList.toggle('open', hasQueue || busy);
    promptQueuePanel?.classList.toggle('running', busy);
    promptQueuePanel?.classList.toggle('holding', queueHold && hasQueue);
    if (promptQueueTitle) {
      promptQueueTitle.textContent = queueHold && hasQueue
        ? 'Held Queue'
        : hasQueue
          ? 'Queued'
          : busy
            ? 'Running'
            : 'Queued';
    }
    logInputBar?.classList.toggle('agent-busy', busy);
    if (!promptQueueList) return;
    promptQueueList.innerHTML = '';

    promptQueue.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `prompt-queue-item${item.id === selectedPromptId ? ' selected' : ''}`;
      row.title = 'Click to select. Double-click to edit. Drag to reorder.';
      row.dataset.id = String(item.id);
      row.draggable = true;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-selected', item.id === selectedPromptId ? 'true' : 'false');

      const rank = document.createElement('span');
      rank.className = 'prompt-queue-rank';
      rank.textContent = String(index + 1).padStart(2, '0');

      const text = document.createElement('span');
      text.className = 'prompt-queue-text';
      text.textContent = truncatePrompt(item.text, 180);

      const actions = document.createElement('span');
      actions.className = 'prompt-queue-row-actions';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'prompt-queue-edit';
      edit.textContent = 'Edit';
      edit.title = 'Edit queued prompt';
      edit.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectedPromptId = item.id;
        renderPromptQueue();
        openPromptEditor(item.id);
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'prompt-queue-remove';
      remove.textContent = '×';
      remove.title = 'Remove queued prompt';
      remove.setAttribute('aria-label', 'Remove queued prompt');
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeQueuedPrompt(item.id);
      });

      actions.append(edit, remove);
      row.append(rank, text, actions);
      row.addEventListener('click', () => {
        selectedPromptId = item.id;
        renderPromptQueue();
        updatePromptControls();
      });
      row.addEventListener('dblclick', () => openPromptEditor(item.id));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          selectedPromptId = item.id;
          steerSelectedPrompt();
        } else if (event.key.toLowerCase() === 'e') {
          event.preventDefault();
          openPromptEditor(item.id);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          removeQueuedPrompt(item.id);
        }
      });
      row.addEventListener('dragstart', (event) => {
        draggedPromptId = item.id;
        selectedPromptId = item.id;
        row.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(item.id));
      });
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (draggedPromptId && draggedPromptId !== item.id) row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('drag-over');
        reorderPrompt(draggedPromptId, item.id);
      });
      row.addEventListener('dragend', () => {
        draggedPromptId = null;
        row.classList.remove('dragging', 'drag-over');
      });

      promptQueueList.appendChild(row);
    });
  }

  function updatePromptControls() {
    ensurePromptSelection();
    const busy = isAgentBusy();
    if (logStop) logStop.disabled = !busy;
    if (promptQueueSteer) promptQueueSteer.disabled = promptQueue.length === 0 || selectedPromptId == null;
    if (promptQueueClear) promptQueueClear.disabled = promptQueue.length === 0;
  }

  function enqueuePrompt(text, { front = false } = {}) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const item = { id: ++promptQueueId, text: clean, createdAt: Date.now() };
    if (front) promptQueue.unshift(item);
    else promptQueue.push(item);
    selectedPromptId = item.id;
    addLog(front ? 'Prompt returned to front of queue.' : `Prompt queued. ${promptQueue.length} waiting.`);
    renderPromptQueue();
    updatePromptControls();
  }

  function reorderPrompt(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const from = findPromptIndex(draggedId);
    const to = findPromptIndex(targetId);
    if (from < 0 || to < 0) return;
    const [item] = promptQueue.splice(from, 1);
    const adjustedTo = from < to ? to - 1 : to;
    promptQueue.splice(adjustedTo, 0, item);
    selectedPromptId = item.id;
    renderPromptQueue();
    updatePromptControls();
  }

  function openPromptEditor(id) {
    const idx = findPromptIndex(id);
    if (idx < 0 || !promptEditModal || !promptEditText) return;
    editingPromptId = id;
    promptEditText.value = promptQueue[idx].text;
    promptEditModal.classList.add('open');
    promptEditModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      promptEditText.focus();
      promptEditText.setSelectionRange(promptEditText.value.length, promptEditText.value.length);
    }, 50);
  }

  function closePromptEditor() {
    editingPromptId = null;
    promptEditModal?.classList.remove('open');
    promptEditModal?.setAttribute('aria-hidden', 'true');
  }

  function savePromptEditor() {
    const idx = findPromptIndex(editingPromptId);
    if (idx < 0 || !promptEditText) {
      closePromptEditor();
      return;
    }
    const clean = promptEditText.value.trim();
    if (!clean) {
      removeQueuedPrompt(editingPromptId);
      closePromptEditor();
      return;
    }
    promptQueue[idx].text = clean;
    selectedPromptId = promptQueue[idx].id;
    addLog('Updated queued prompt.');
    closePromptEditor();
    renderPromptQueue();
    updatePromptControls();
  }

  function cancelActiveBridgeRequests() {
    const cancelledIds = [];
    const ids = [
      bridge.activeLedgerId,
      bridge.activeAuditId,
      bridge.activeFixId,
      bridge.activeCommitId,
      bridge.activeNarrationId
    ].filter(Boolean);
    for (const id of ids) {
      bridge.cancel(id);
      cancelledIds.push(id);
    }
    const battleScene = getBattleScene();
    if (battleScene?._activeRequestId) {
      bridge.cancel(battleScene._activeRequestId);
      cancelledIds.push(battleScene._activeRequestId);
    }
    return cancelledIds;
  }

  function stopActiveAgent({ announce = true, holdQueue = true } = {}) {
    const hadBusyState = isAgentBusy();
    queueHold = holdQueue && promptQueue.length > 0;
    const cancelledIds = cancelActiveBridgeRequests();
    cancelledIds.forEach((id) => suppressedDrainIds.add(id));
    flushLogQueue();
    if (hadBusyState || cancelledIds.length > 0 || ledgerRunning) {
      resetLoadingState();
      if (announce) addLog(queueHold ? 'Stopped. Queue held.' : 'Stopped.', { immediate: true });
    } else if (announce) {
      addLog('Nothing active to stop.', { immediate: true });
    }
    renderPromptQueue();
    updatePromptControls();
  }

  async function steerSelectedPrompt() {
    ensurePromptSelection();
    const idx = findPromptIndex(selectedPromptId);
    if (idx < 0) return;
    const [selected] = promptQueue.splice(idx, 1);
    const wasHeld = queueHold;
    if (isAgentBusy()) {
      queueHold = wasHeld && promptQueue.length > 0;
      selectedPromptId = promptQueue[idx]?.id || promptQueue[idx - 1]?.id || promptQueue[0]?.id || null;
      renderPromptQueue();
      updatePromptControls();
      try {
        await bridge.steer(selected.text);
        addLog('> ' + selected.text, { immediate: true });
        addLog('Steered active turn.');
      } catch (err) {
        promptQueue.unshift(selected);
        selectedPromptId = selected.id;
        addLog('Could not steer active turn: ' + (err.message || 'unknown'));
        addLog('Prompt returned to front of queue.');
      }
      renderPromptQueue();
      updatePromptControls();
      return;
    }
    queueHold = wasHeld && promptQueue.length > 0;
    selectedPromptId = promptQueue[0]?.id || null;
    renderPromptQueue();
    updatePromptControls();
    addLog(wasHeld ? 'Submitted held prompt.' : 'Submitted queued prompt.');
    executeLedgerCommand(selected.text, { fromQueue: true, preserveQueueHold: queueHold });
  }

  function scheduleQueueDrain() {
    if (queueDrainTimer) clearTimeout(queueDrainTimer);
    queueDrainTimer = setTimeout(() => {
      queueDrainTimer = null;
      drainPromptQueue();
    }, 250);
  }

  function drainPromptQueue() {
    updatePromptControls();
    if (!promptQueue.length || queueHold || isAgentBusy() || !bridge.connected) {
      renderPromptQueue();
      return;
    }
    const item = promptQueue.shift();
    if (selectedPromptId === item.id) selectedPromptId = promptQueue[0]?.id || null;
    renderPromptQueue();
    executeLedgerCommand(item.text, { fromQueue: true });
  }

  function clearInput() {
    logInput.value = '';
    logInput.style.height = 'auto';
    logInput.style.overflowY = 'hidden';
    autoResize();
    updatePromptControls();
  }

  const executeLedgerCommand = (text, { fromQueue = false, preserveQueueHold = false } = {}) => {
    if (!text.trim()) return;
    if (queueDrainTimer) {
      clearTimeout(queueDrainTimer);
      queueDrainTimer = null;
    }
    if (!bridge.connected) {
      addLog('Bridge not connected. Prompt kept in queue.');
      enqueuePrompt(text, { front: fromQueue });
      return;
    }

    // If we're in a battle, route through doAttack so everything is synchronized
    const battleScene = getBattleScene();
    if (battleScene && battleScene.isPlayerTurn && !battleScene.battleOver) {
      Promise.resolve(battleScene.doAttack(text)).finally(() => {
        updatePromptControls();
        scheduleQueueDrain();
      });
      return;
    }

    // Outside battle - neutral chat. Pass-through to Codex in the user's
    // project dir. No demon anchoring; the user can ask anything.
    if (fromQueue && !preserveQueueHold) queueHold = false;
    logInputBar.classList.add('running');
    showLoadingIndicator();
    addLog('> ' + text, { immediate: true });
    showLoadingIndicator();
    ledgerRunning = true;
    renderPromptQueue();
    updatePromptControls();
    lastStreamTime = Date.now();
    startWatchdog();

    const projectPath = document.getElementById('path-input')?.value?.trim() || '.';
    const profile = getProfileKey(window.selectedCharacter?.profile || window.selectedCharacter?.model);
    const runtime = window.selectedCharacter?.runtime || getSelectedRuntime();
    let ledgerRequestId = null;

    (async () => {
      try {
        const pendingResult = bridge.chat(text, projectPath, profile, runtime, (chunk) => {
          lastStreamTime = Date.now();
          if (interactiveTimeout) clearTimeout(interactiveTimeout);
          startWatchdog();
          const clean = chunk.replace(/[\n\r]+/g, ' ').trim();
          if (clean.length > 0) addLog(clean);
        });
        ledgerRequestId = bridge.activeLedgerId;
        const result = await pendingResult;
        if (result?.data?.summary) addLog(result.data.summary);
      } catch (err) {
        if (err.message !== 'Cancelled by user') {
          addLog('Error: ' + (err.message || 'unknown'));
          if (fromQueue) enqueuePrompt(text, { front: true });
        }
      } finally {
        flushLogQueue();
        resetLoadingState();
        if (ledgerRequestId && suppressedDrainIds.delete(ledgerRequestId)) {
          renderPromptQueue();
          updatePromptControls();
        } else {
          scheduleQueueDrain();
        }
      }
    })();
  };

  const submitLedgerInput = () => {
    const text = logInput.value.trim();
    if (!text) return;
    clearInput();
    if (isAgentBusy()) {
      enqueuePrompt(text);
      return;
    }
    executeLedgerCommand(text);
  };

  // Auto-resize textarea as user types - push log content up
  const logContent = document.getElementById('log-content');
  const getMaxLogInputHeight = () => Math.min(400, Math.max(120, Math.floor(window.innerHeight * 0.5) - 28));
  const autoResize = () => {
    const maxInputHeight = getMaxLogInputHeight();
    logInput.style.height = 'auto';
    logInput.style.height = Math.min(logInput.scrollHeight, maxInputHeight) + 'px';
    logInput.style.overflowY = logInput.scrollHeight > maxInputHeight ? 'auto' : 'hidden';
    // Keep log scrolled to bottom as input grows
    if (logContent) logContent.scrollTop = logContent.scrollHeight;
  };
  logInput.addEventListener('input', autoResize);
  logInput.addEventListener('input', updatePromptControls);
  window.addEventListener('resize', autoResize);
  autoResize();
  renderPromptQueue();
  updatePromptControls();

  logInput.addEventListener('keydown', (e) => {
    // Enter submits, Shift+Enter adds newline
    if (e.key === 'Enter' && !e.shiftKey && logInput.value.trim()) {
      e.preventDefault();
      submitLedgerInput();
      autoResize();
    }
    if (e.key === 'Escape') {
      const now = Date.now();
      if (now - lastEscTime < 500 && isAgentBusy()) {
        stopActiveAgent({ announce: true });
      }
      lastEscTime = now;
    }
  });

  logStop?.addEventListener('click', () => stopActiveAgent());
  promptQueueSteer?.addEventListener('click', () => steerSelectedPrompt());
  promptQueueClear?.addEventListener('click', () => {
    if (!promptQueue.length) return;
    promptQueue.splice(0, promptQueue.length);
    selectedPromptId = null;
    queueHold = false;
    addLog('Queue cleared.');
    renderPromptQueue();
    updatePromptControls();
  });
  promptQueueList?.addEventListener('dragover', (event) => event.preventDefault());
  promptQueueList?.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!draggedPromptId || event.target.closest?.('.prompt-queue-item')) return;
    const from = findPromptIndex(draggedPromptId);
    if (from >= 0) {
      const [item] = promptQueue.splice(from, 1);
      promptQueue.push(item);
      selectedPromptId = item.id;
      renderPromptQueue();
      updatePromptControls();
    }
  });
  promptEditSave?.addEventListener('click', () => savePromptEditor());
  promptEditCancel?.addEventListener('click', () => closePromptEditor());
  promptEditRemove?.addEventListener('click', () => {
    removeQueuedPrompt(editingPromptId);
    closePromptEditor();
  });
  promptEditModal?.querySelector('.prompt-edit-backdrop')?.addEventListener('click', () => closePromptEditor());
  promptEditText?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      savePromptEditor();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePromptEditor();
    }
  });
  window.addEventListener('seo-dungeon-agent-settled', () => {
    renderPromptQueue();
    updatePromptControls();
    scheduleQueueDrain();
  });
  bridge.onStatusChange((connected) => {
    renderPromptQueue();
    updatePromptControls();
    if (connected && promptQueue.length && !queueHold) {
      scheduleQueueDrain();
    }
  });

  // Global Escape handler - double-tap cancels any active agent operation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const now = Date.now();
      if (now - lastEscTime < 500) {
        stopActiveAgent({ announce: true });
      }
      lastEscTime = now;
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
          runtime: cached.runtime || getSelectedRuntime(),
          dangerousBypass: getDangerousBypassEnabled()
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
