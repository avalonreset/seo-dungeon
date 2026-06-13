/**
 * Character select sprites for the title screen.
 * Crops out transparent padding and displays characters at proper size.
 */
import { SFX } from './utils/sound-manager.js';
import { getProfileLabel, getSelectedRuntime, setSelectedRuntime } from './profile-config.js';

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
  SFX.play('menuConfirm');
  document.querySelectorAll('.char-option').forEach(el => {
    const isTarget = el.dataset.char === charKey;
    el.classList.toggle('selected', isTarget);
    if (isTarget) _selectionBurst(el);
  });
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
  };

  applyRuntime(getSelectedRuntime(), false);
  buttons.forEach((button) => {
    button.addEventListener('click', () => applyRuntime(button.dataset.runtime, true));
    button.addEventListener('mouseenter', () => SFX.play('menuHover'));
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

  // Subtle scale bounce on the canvas
  const canvas = el.querySelector('canvas');
  if (canvas) {
    const style = getComputedStyle(el);
    const lift = style.getPropertyValue('--char-y').trim() || '12px';
    const scale = style.getPropertyValue('--char-scale').trim() || '2';
    const selectedScale = style.getPropertyValue('--char-selected-scale').trim() || '2.15';
    canvas.style.transition = 'transform 0.15s ease-out';
    canvas.style.transform = `translateY(${lift}) scale(${selectedScale})`;
    setTimeout(() => {
      canvas.style.transform = `translateY(${lift}) scale(${scale})`;
    }, 150);
  }
}

function setupCharCanvas(charKey) {
  const char = CHARACTERS[charKey];
  const canvas = document.getElementById(`char-${charKey}`);
  if (!canvas) return;

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.width = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const img = new Image();
  img.src = char.idlePath;

  // Calculate scale: fit character so top doesn't clip above canvas
  const feetOffsetInCrop = char.groundY - char.cropY;
  const maxScale = GROUND_LINE / feetOffsetInCrop;
  const scale = Math.min(maxScale, 2.2); // cap at 2.2x

  const drawW = Math.round(char.cropW * scale);
  const drawH = Math.round(char.cropH * scale);
  const feetOffsetScaled = Math.round(feetOffsetInCrop * scale);
  const drawY = GROUND_LINE - feetOffsetScaled;
  const drawX = Math.round((CANVAS_W - drawW) / 2);

  animState[charKey] = { img, ctx, loaded: false, frame: 0, tick: 0, drawX, drawY, drawW, drawH };
  img.onload = () => { animState[charKey].loaded = true; };
}

function animateAll() {
  const interval = Math.round(60 / FPS);

  for (const charKey of Object.keys(CHARACTERS)) {
    const state = animState[charKey];
    if (!state || !state.loaded) continue;

    const char = CHARACTERS[charKey];
    state.tick++;

    if (state.tick % interval === 0) {
      state.frame = (state.frame + 1) % char.idleFrames;
    }

    state.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw cropped sprite, bottom-aligned to ground line
    state.ctx.drawImage(
      state.img,
      state.frame * char.frameW + char.cropX, char.cropY, char.cropW, char.cropH,
      state.drawX, state.drawY, state.drawW, state.drawH
    );
  }

  requestAnimationFrame(animateAll);
}

export function initKnightSprite() {
  initRuntimePicker();
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
