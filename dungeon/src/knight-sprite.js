/**
 * Character select sprites for the title screen.
 * Crops out transparent padding and displays characters at proper size.
 */
import { SFX } from './utils/sound-manager.js';
import {
  RUNTIME_LABELS,
  getDangerousBypassEnabled,
  getProfileLabel,
  getSelectedRuntime,
  setDangerousBypassEnabled,
  setSelectedRuntime
} from './profile-config.js';

export const CHARACTERS = {
  warrior: {
    name: 'warrior',
    profile: 'deep',
    idlePath: 'assets/luizmelo/warrior/sprites/Idle.png',
    runPath: 'assets/luizmelo/warrior/sprites/Run.png',
    attackPath: 'assets/luizmelo/warrior/sprites/Attack1.png',
    hitPath: 'assets/luizmelo/warrior/sprites/Take Hit.png',
    deathPath: 'assets/luizmelo/warrior/sprites/Death.png',
    frameW: 162, frameH: 162,
    idleFrames: 10, runFrames: 8, attackFrames: 7, hitFrames: 3, deathFrames: 7,
    cropX: 42, cropY: 20, cropW: 80, cropH: 130,
    groundY: 145,  // Y in sprite where feet touch ground (idle)
    runGroundY: 100, // Y in run sprite where feet touch ground
    // Extra animations for variety
    extraAnims: [
      { key: 'char_attack2', path: 'assets/luizmelo/warrior/sprites/Attack2.png', frames: 7 },
      { key: 'char_attack3', path: 'assets/luizmelo/warrior/sprites/Attack3.png', frames: 8 },
      { key: 'char_jump', path: 'assets/luizmelo/warrior/sprites/Jump.png', frames: 3 }
    ]
  },
  samurai: {
    name: 'samurai',
    profile: 'balanced',
    idlePath: 'assets/luizmelo/samurai/sprites/Idle.png',
    runPath: 'assets/luizmelo/samurai/sprites/Run.png',
    attackPath: 'assets/luizmelo/samurai/sprites/Attack1.png',
    hitPath: 'assets/luizmelo/samurai/sprites/Take Hit.png',
    deathPath: 'assets/luizmelo/samurai/sprites/Death.png',
    frameW: 200, frameH: 200,
    idleFrames: 8, runFrames: 8, attackFrames: 6, hitFrames: 4, deathFrames: 6,
    cropX: 48, cropY: 30, cropW: 100, cropH: 140,
    groundY: 173,  // Y in sprite where feet touch ground (idle)
    runGroundY: 121, // Y in run sprite where feet touch ground
    extraAnims: [
      { key: 'char_attack2', path: 'assets/luizmelo/samurai/sprites/Attack2.png', frames: 6 },
      { key: 'char_jump', path: 'assets/luizmelo/samurai/sprites/Jump.png', frames: 2 }
    ]
  },
  knight: {
    name: 'knight',
    profile: 'fast',
    idlePath: 'assets/luizmelo/warrior-pack-2/player1/Idle.png',
    runPath: 'assets/luizmelo/warrior-pack-2/player1/Run.png',
    attackPath: 'assets/luizmelo/warrior-pack-2/player1/Attack2.png',
    hitPath: 'assets/luizmelo/warrior-pack-2/player1/Take Hit.png',
    deathPath: 'assets/luizmelo/warrior-pack-2/player1/Death.png',
    frameW: 180, frameH: 180,
    idleFrames: 11, runFrames: 8, attackFrames: 7, hitFrames: 4, deathFrames: 11,
    cropX: 40, cropY: 20, cropW: 110, cropH: 140,
    groundY: 166,  // Y in sprite where feet touch ground (idle)
    runGroundY: 114, // Y in run sprite where feet touch ground
    extraAnims: [
      { key: 'char_jump', path: 'assets/luizmelo/warrior-pack-2/player1/Jump.png', frames: 3 }
    ]
  }
};

// All canvases share the same fixed size so feet align on the same ground plane
const CANVAS_W = 200;
const CANVAS_H = 280;
const GROUND_LINE = 278; // Y pixel in canvas where all feet land
const FPS = 8;

const animState = {};

function setSelected(charKey) {
  window.selectedCharacter = { ...CHARACTERS[charKey] };
  window.selectedCharacter.runtime = getSelectedRuntime();
  window.selectedCharacter.dangerousBypass = getDangerousBypassEnabled();
  SFX.play('menuConfirm');
  document.querySelectorAll('.char-option').forEach(el => {
    const isTarget = el.dataset.char === charKey;
    el.classList.toggle('selected', isTarget);
    if (isTarget) _selectionBurst(el);
  });
}

function initDangerousModeToggle() {
  const button = document.getElementById('danger-mode-toggle');
  if (!button) return;

  let active = getDangerousBypassEnabled();
  const applyMode = (enabled, playSound = false) => {
    active = setDangerousBypassEnabled(enabled);
    const title = button.querySelector('.danger-title');
    const copy = button.querySelector('.danger-copy');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.title = active
      ? 'Codex launches with --dangerously-bypass-approvals-and-sandbox'
      : 'Codex launches with the standard SEO Dungeon sandbox';
    if (title) title.textContent = active ? 'YOLO Mode Armed' : 'Arm YOLO Mode';
    if (copy) copy.textContent = active ? 'dangerous bypass active' : 'required to enter';
    if (window.selectedCharacter) window.selectedCharacter.dangerousBypass = active;
    if (playSound) SFX.play('menuConfirm');
  };

  applyMode(active, false);
  button.addEventListener('click', () => applyMode(!active, true));
  button.addEventListener('mouseenter', () => SFX.play('menuHover'));
}

function initRuntimePicker() {
  const buttons = [...document.querySelectorAll('.runtime-option[data-runtime]')];
  if (buttons.length === 0) return;

  const applyRuntime = (runtime, playSound = false) => {
    const selectedRuntime = setSelectedRuntime(runtime);
    buttons.forEach((button) => {
      const isSelected = button.dataset.runtime === selectedRuntime;
      button.classList.toggle('selected', isSelected);
      button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
    if (window.selectedCharacter) window.selectedCharacter.runtime = selectedRuntime;
    refreshProfileLabels();
    if (playSound) SFX.play('menuConfirm');
    return selectedRuntime;
  };

  let activeRuntime = applyRuntime(getSelectedRuntime(), false);
  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const nextRuntime = button.dataset.runtime;
      if (nextRuntime === activeRuntime) return;
      if (nextRuntime !== 'codex') {
        const accepted = await showRuntimeWarning(nextRuntime);
        if (!accepted) {
          applyRuntime('codex', false);
          activeRuntime = 'codex';
          return;
        }
      }
      activeRuntime = applyRuntime(nextRuntime, true);
    });
    button.addEventListener('mouseenter', () => SFX.play('menuHover'));
  });
}

function showRuntimeWarning(runtime) {
  const modal = document.getElementById('runtime-warning-modal');
  if (!modal) return Promise.resolve(true);

  const runtimeName = RUNTIME_LABELS[runtime]?.name || runtime;
  const nameEl = document.getElementById('runtime-warning-name');
  const check = document.getElementById('runtime-warning-check');
  const cancel = document.getElementById('runtime-warning-cancel');
  const proceed = document.getElementById('runtime-warning-proceed');
  const backdrop = modal.querySelector('.runtime-warning-backdrop');
  if (!check || !cancel || !proceed) return Promise.resolve(true);

  if (nameEl) nameEl.textContent = runtimeName;
  check.checked = false;
  proceed.disabled = true;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    const cleanup = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      check.removeEventListener('input', onCheck);
      cancel.removeEventListener('click', onCancel);
      proceed.removeEventListener('click', onProceed);
      backdrop?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeyDown);
    };

    const finish = (accepted) => {
      cleanup();
      resolve(accepted);
    };

    const onCheck = () => {
      proceed.disabled = !check.checked;
    };
    const onCancel = () => finish(false);
    const onProceed = () => {
      if (check.checked) finish(true);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish(false);
    };

    check.addEventListener('input', onCheck);
    cancel.addEventListener('click', onCancel);
    proceed.addEventListener('click', onProceed);
    backdrop?.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeyDown);
    setTimeout(() => check.focus(), 50);
  });
}

function refreshProfileLabels() {
  const runtime = getSelectedRuntime();
  for (const [charKey, char] of Object.entries(CHARACTERS)) {
    const labelEl = document.querySelector(`.char-option[data-char="${charKey}"] .char-model`);
    const detailEl = document.querySelector(`.char-option[data-char="${charKey}"] .char-profile-detail`);
    const profile = getProfileLabel(char.profile, runtime);
    if (labelEl) labelEl.textContent = profile.label;
    if (detailEl) detailEl.textContent = profile.detail;
  }
}

function _selectionBurst(el) {
  // Brief white flash overlay
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: absolute; inset: 0; border-radius: 8px;
    background: radial-gradient(circle, rgba(212,175,55,0.25) 0%, transparent 70%);
    pointer-events: none; z-index: 10;
    animation: charFlash 0.4s ease-out forwards;
  `;
  el.style.position = 'relative';
  el.appendChild(flash);
  setTimeout(() => flash.remove(), 500);

  // Emit gold sparkle particles
  const rect = el.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height * 0.45;

  for (let i = 0; i < 12; i++) {
    const spark = document.createElement('div');
    const angle = (i / 12) * Math.PI * 2;
    const dist = 40 + Math.random() * 60;
    const size = 2 + Math.random() * 4;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    spark.style.cssText = `
      position: absolute; left: ${cx}px; top: ${cy}px;
      width: ${size}px; height: ${size}px; border-radius: 50%;
      background: #d4af37; pointer-events: none; z-index: 11;
      opacity: 1; transition: all 0.5s ease-out;
    `;
    el.appendChild(spark);

    requestAnimationFrame(() => {
      spark.style.transform = `translate(${dx}px, ${dy}px)`;
      spark.style.opacity = '0';
    });
    setTimeout(() => spark.remove(), 600);
  }

  // Subtle card-level pulse. Sprites stay canvas-fit so narrow layouts never
  // clip differently per character.
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.025)' },
      { transform: 'scale(1)' },
    ],
    { duration: 180, easing: 'ease-out' }
  );
}

function setupCharCanvas(charKey) {
  const char = CHARACTERS[charKey];
  const canvas = document.getElementById(`char-${charKey}`);
  if (!canvas) return;

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const img = new Image();
  img.src = char.idlePath;

  animState[charKey] = { img, ctx, loaded: false, frame: 0, tick: 0 };
  img.onload = () => {
    animState[charKey].source = computeVisibleSourceBounds(img, char);
    animState[charKey].loaded = true;
  };
}

function computeVisibleSourceBounds(img, char) {
  const sample = document.createElement('canvas');
  sample.width = img.naturalWidth || img.width;
  sample.height = img.naturalHeight || img.height;
  const sampleCtx = sample.getContext('2d');
  sampleCtx.imageSmoothingEnabled = false;
  sampleCtx.drawImage(img, 0, 0);

  const data = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
  let minX = char.cropW;
  let minY = char.cropH;
  let maxX = -1;
  let maxY = -1;

  for (let frame = 0; frame < char.idleFrames; frame++) {
    const baseX = frame * char.frameW + char.cropX;
    for (let y = 0; y < char.cropH; y++) {
      for (let x = 0; x < char.cropW; x++) {
        const px = baseX + x;
        const py = char.cropY + y;
        if (px < 0 || py < 0 || px >= sample.width || py >= sample.height) continue;
        const alpha = data[(py * sample.width + px) * 4 + 3];
        if (alpha > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: char.cropX, y: char.cropY, w: char.cropW, h: char.cropH };
  }

  const pad = 4;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(char.cropW - 1, maxX + pad);
  const bottom = Math.min(char.cropH - 1, maxY + pad);
  return {
    x: char.cropX + x,
    y: char.cropY + y,
    w: right - x + 1,
    h: bottom - y + 1,
  };
}

function measureCanvasLayout(canvas) {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  if (canvas.width !== cssW || canvas.height !== cssH) {
    canvas.width = cssW;
    canvas.height = cssH;
    canvas.getContext('2d').imageSmoothingEnabled = false;
  }
  return { cssW, cssH };
}

function animateAll() {
  const interval = Math.round(60 / FPS);

  for (const charKey of Object.keys(CHARACTERS)) {
    const state = animState[charKey];
    if (!state || !state.loaded) continue;

    const char = CHARACTERS[charKey];
    const canvas = state.ctx.canvas;
    const { cssW, cssH } = measureCanvasLayout(canvas);
    state.tick++;

    if (state.tick % interval === 0) {
      state.frame = (state.frame + 1) % char.idleFrames;
    }

    state.ctx.clearRect(0, 0, cssW, cssH);

    const source = state.source || { x: char.cropX, y: char.cropY, w: char.cropW, h: char.cropH };
    const labelReserve = Math.max(4, Math.round(cssH * 0.02));
    const availableW = cssW * 0.94;
    const availableH = Math.max(1, cssH - labelReserve);
    const fitScale = Math.min(availableW / source.w, availableH / source.h);
    const drawW = Math.round(source.w * fitScale);
    const drawH = Math.round(source.h * fitScale);
    const drawX = Math.round((cssW - drawW) / 2);
    const drawY = Math.round(cssH - drawH - labelReserve);

    // Draw cropped sprite centered and bottom-aligned inside the shared
    // viewport. Every character uses the same box, so ledger resizing cannot
    // clip one sprite differently from the others.
    state.ctx.drawImage(
      state.img,
      state.frame * char.frameW + source.x, source.y, source.w, source.h,
      drawX, drawY, drawW, drawH
    );
  }

  requestAnimationFrame(animateAll);
}

export function initKnightSprite() {
  initRuntimePicker();
  initDangerousModeToggle();
  refreshProfileLabels();
  setSelected('warrior');

  for (const charKey of Object.keys(CHARACTERS)) {
    setupCharCanvas(charKey);
  }

  document.querySelectorAll('.char-option').forEach(el => {
    el.addEventListener('click', () => {
      setSelected(el.dataset.char);
    });
    el.addEventListener('mouseenter', () => {
      SFX.play('menuHover');
    });
  });

  animateAll();
}
