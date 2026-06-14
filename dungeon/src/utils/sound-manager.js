/**
 * SoundManager - procedural sound effects using Web Audio API.
 * No audio files needed. All sounds are synthesized on the fly.
 *
 * Usage:
 *   import { SFX } from '../utils/sound-manager.js';
 *   SFX.play('menuSelect');
 */

let ctx = null;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Master volume (0-1)
let masterVolume = 0.35;

function gain(value) {
  const c = getCtx();
  const g = c.createGain();
  g.gain.value = value * masterVolume;
  g.connect(c.destination);
  return g;
}

function osc(type, freq, duration, vol = 0.3, detune = 0) {
  const c = getCtx();
  const o = c.createOscillator();
  const g = gain(vol);
  o.type = type;
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  o.connect(g);
  o.start(c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  o.stop(c.currentTime + duration + 0.05);
  return { osc: o, gain: g };
}

function noise(duration, vol = 0.1) {
  const c = getCtx();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = gain(vol);
  // Bandpass for colored noise
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 0.5;
  src.connect(filter);
  filter.connect(g);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  src.start(c.currentTime);
  src.stop(c.currentTime + duration);
}

// ═══════════════════════════════════════════════════
//  SOUND DEFINITIONS
// ═══════════════════════════════════════════════════

const sounds = {

  // ── Menu / UI ──────────────────────────────────
  menuSelect: () => {
    osc('square', 660, 0.08, 0.15);
    setTimeout(() => osc('square', 880, 0.08, 0.12), 40);
  },

  menuConfirm: () => {
    osc('square', 523, 0.06, 0.15);
    setTimeout(() => osc('square', 659, 0.06, 0.13), 50);
    setTimeout(() => osc('square', 784, 0.1, 0.12), 100);
  },

  menuBack: () => {
    osc('square', 440, 0.06, 0.12);
    setTimeout(() => osc('square', 330, 0.1, 0.1), 50);
  },

  menuHover: () => {
    osc('sine', 600, 0.04, 0.08);
  },

  textType: () => {
    osc('square', 440 + Math.random() * 80, 0.03, 0.06);
  },

  // ── Battle ─────────────────────────────────────
  swordSlash: () => {
    noise(0.15, 0.2);
    osc('sawtooth', 200, 0.1, 0.15);
    setTimeout(() => {
      noise(0.08, 0.15);
      osc('sawtooth', 150, 0.08, 0.1);
    }, 60);
  },

  hit: () => {
    noise(0.06, 0.25);
    osc('square', 120, 0.12, 0.2);
    osc('sine', 80, 0.15, 0.15);
  },

  criticalHit: () => {
    noise(0.1, 0.3);
    osc('square', 100, 0.15, 0.25);
    setTimeout(() => osc('sawtooth', 60, 0.2, 0.2), 50);
    setTimeout(() => noise(0.08, 0.15), 100);
  },

  defend: () => {
    osc('triangle', 300, 0.15, 0.15);
    osc('sine', 600, 0.2, 0.1);
    setTimeout(() => osc('triangle', 400, 0.12, 0.1), 80);
  },

  shieldBlock: () => {
    osc('square', 200, 0.08, 0.2);
    noise(0.05, 0.15);
    osc('sine', 500, 0.15, 0.08);
  },

  demonAttack: () => {
    osc('sawtooth', 80, 0.2, 0.2);
    noise(0.08, 0.15);
    setTimeout(() => osc('square', 100, 0.1, 0.15), 80);
  },

  takeDamage: () => {
    osc('square', 200, 0.05, 0.2);
    setTimeout(() => osc('square', 150, 0.05, 0.18), 50);
    setTimeout(() => osc('square', 100, 0.1, 0.15), 100);
  },

  channelStart: () => {
    osc('sine', 330, 0.3, 0.08);
    osc('sine', 440, 0.4, 0.06);
    osc('sine', 550, 0.5, 0.05);
  },

  channelComplete: () => {
    osc('sine', 440, 0.1, 0.12);
    setTimeout(() => osc('sine', 554, 0.1, 0.1), 80);
    setTimeout(() => osc('sine', 659, 0.15, 0.1), 160);
    setTimeout(() => osc('sine', 880, 0.2, 0.08), 250);
  },

  // ── Encounter / Transition ─────────────────────
  encounterStart: () => {
    osc('square', 220, 0.1, 0.15);
    setTimeout(() => osc('square', 277, 0.1, 0.12), 120);
    setTimeout(() => osc('square', 330, 0.15, 0.12), 240);
    setTimeout(() => osc('square', 440, 0.2, 0.1), 380);
  },

  doorOpen: () => {
    noise(0.3, 0.08);
    osc('sine', 100, 0.4, 0.1);
    setTimeout(() => osc('sine', 120, 0.3, 0.08), 150);
  },

  footstep: () => {
    noise(0.04, 0.06);
    osc('sine', 60 + Math.random() * 20, 0.05, 0.04);
  },

  // ── Victory / Defeat ──────────────────────────
  victory: () => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => osc('square', freq, 0.15, 0.12), i * 120);
    });
    setTimeout(() => {
      osc('triangle', 1047, 0.4, 0.1);
      osc('sine', 1047, 0.4, 0.08);
    }, 500);
  },

  defeat: () => {
    osc('square', 294, 0.2, 0.15);
    setTimeout(() => osc('square', 262, 0.2, 0.12), 200);
    setTimeout(() => osc('square', 220, 0.25, 0.12), 400);
    setTimeout(() => osc('square', 196, 0.4, 0.1), 600);
  },

  vanquish: () => {
    noise(0.15, 0.2);
    osc('sawtooth', 150, 0.1, 0.2);
    setTimeout(() => {
      osc('square', 440, 0.08, 0.15);
      osc('sine', 880, 0.15, 0.1);
    }, 100);
    setTimeout(() => {
      osc('square', 660, 0.1, 0.12);
      osc('sine', 1320, 0.2, 0.08);
    }, 200);
    setTimeout(() => noise(0.2, 0.1), 300);
  },

  demonDeath: () => {
    osc('sawtooth', 200, 0.1, 0.2);
    setTimeout(() => osc('sawtooth', 150, 0.15, 0.15), 80);
    setTimeout(() => osc('sawtooth', 100, 0.2, 0.12), 180);
    setTimeout(() => noise(0.3, 0.1), 250);
    setTimeout(() => osc('sine', 60, 0.4, 0.1), 300);
  },

  xpGain: () => {
    const freqs = [523, 587, 659, 784];
    freqs.forEach((f, i) => {
      setTimeout(() => osc('sine', f, 0.08, 0.1), i * 60);
    });
  },

  lootDrop: () => {
    osc('triangle', 1200, 0.05, 0.1);
    setTimeout(() => osc('triangle', 1600, 0.05, 0.08), 60);
    setTimeout(() => osc('triangle', 2000, 0.08, 0.08), 120);
  },

  // ── Dungeon Ambience ──────────────────────────
  torchCrackle: () => {
    noise(0.03, 0.03);
  },

  demonRowHover: () => {
    osc('sine', 200, 0.06, 0.05);
    osc('triangle', 400, 0.04, 0.03);
  },

  sceneTransition: () => {
    osc('sine', 200, 0.3, 0.1);
    osc('sine', 300, 0.3, 0.06);
    setTimeout(() => {
      osc('sine', 250, 0.3, 0.08);
      osc('sine', 350, 0.3, 0.05);
    }, 150);
  },

  // ── Summoning / Loading ────────────────────────
  summoningPulse: () => {
    osc('sine', 110, 0.6, 0.06);
    osc('sine', 165, 0.6, 0.04);
  },

  auditComplete: () => {
    osc('triangle', 440, 0.1, 0.12);
    setTimeout(() => osc('triangle', 554, 0.1, 0.1), 100);
    setTimeout(() => osc('triangle', 659, 0.1, 0.1), 200);
    setTimeout(() => osc('triangle', 880, 0.2, 0.08), 300);
  },

  ledgerReady: () => {
    osc('triangle', 392, 0.09, 0.07);
    setTimeout(() => osc('sine', 523, 0.12, 0.06), 75);
    setTimeout(() => osc('triangle', 659, 0.16, 0.05), 150);
  },

  flee: () => {
    osc('square', 400, 0.06, 0.12);
    setTimeout(() => osc('square', 350, 0.06, 0.1), 60);
    setTimeout(() => osc('square', 300, 0.06, 0.08), 120);
    setTimeout(() => osc('square', 250, 0.08, 0.06), 180);
  },

  spellFizzle: () => {
    noise(0.15, 0.1);
    osc('sine', 300, 0.1, 0.1);
    setTimeout(() => osc('sine', 200, 0.15, 0.06), 80);
    setTimeout(() => noise(0.1, 0.05), 150);
  },

  logExpand: () => {
    osc('sine', 500, 0.06, 0.08);
    setTimeout(() => osc('sine', 700, 0.06, 0.06), 40);
  },

  logClose: () => {
    osc('sine', 700, 0.06, 0.06);
    setTimeout(() => osc('sine', 500, 0.06, 0.08), 40);
  },
};

// ═══════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════

export const SFX = {
  play(name) {
    try {
      if (sounds[name]) sounds[name]();
    } catch (e) {
      // Silently ignore audio errors - never break gameplay
    }
  },

  setVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v));
  },

  getVolume() {
    return masterVolume;
  },

  /** List available sound names (for debugging) */
  list() {
    return Object.keys(sounds);
  }
};
