import { COLORS } from '../utils/colors.js';
import { HALL_MESSAGES } from '../utils/flavor-text.js';
import { SFX } from '../utils/sound-manager.js';
import { pickDemonForIssue, assignAllDemons } from '../demons-manifest.js';

const HEADER_FONT = '"JetBrains Mono", monospace';
const BODY_FONT = 'monospace';

// Row geometry
const ROW_GAP = 10;
const LIST_TOP = 94;
const LIST_BOTTOM = 518;
const LIST_VISIBLE = LIST_BOTTOM - LIST_TOP; // 424px
const HALL_SCROLL_KEY_PREFIX = 'seo_dungeon_hall_scroll';

// Demon sprite scales per severity - bigger = scarier. All demons are
// 0x72 4-frame idle animations at roughly 16x16 → 32x36 native px.
const SPRITE_SCALES = {
  critical: 2.4,  // 32x36 native → ~86px tall (biggest)
  high: 3.2,      // 16x23 native → ~74px tall
  medium: 2.6,    // 16x23 native → ~60px tall
  low: 2.0,       // 16x23 native → ~46px tall
  info: 2.2,      // 16x16 native → ~35px tall (smallest)
};

/**
 * Dungeon Hall -- RPG encounter screen.
 * Demons listed in styled rows; player clicks to engage.
 */
export class DungeonHallScene extends Phaser.Scene {
  constructor() {
    super('DungeonHall');
    this._lastHoveredRow = -1;
    this._lastScrollSfxTime = 0;
  }

  create() {
    const dpr = this.game.dpr || window.GAME_DPR;
    if (typeof window !== 'undefined') {
      window.__seoDungeonHallScene = this;
      window.__seoDungeonHallState = () => ({
        scrollOffset: this.scrollOffset,
        targetScrollOffset: this.targetScrollOffset,
        maxScroll: this.maxHallScroll(),
        savedScroll: this.game._dungeonHallScrollOffset,
        storageKey: this._hallScrollKey
      });
      this.events.once('shutdown', () => {
        if (window.__seoDungeonHallScene === this) {
          window.__seoDungeonHallScene = null;
          window.__seoDungeonHallState = null;
        }
      });
    }
    this.cameras.main.setZoom(dpr);
    this.cameras.main.scrollX = 400 * (1 - dpr);
    this.cameras.main.scrollY = 300 * (1 - dpr);
    this.cameras.main.setBackgroundColor(0x05050e);

    const isFirstVisit = !this.game._dungeonHallVisited;
    this.game._dungeonHallVisited = true;

    if (isFirstVisit) {
      this.cameras.main.fadeIn(1200, 0, 0, 0);
    } else {
      // Blood drip transition for returning from battle
      this.cameras.main.fadeIn(600, 40, 0, 0);
      this._bloodDripTransition();
    }

    const data = this.game.auditData || { issues: [] };

    // ---------- STONE WALL BACKGROUND ----------
    this.drawStoneWalls();

    // ---------- TORCH LIGHTING ----------
    this.torches = [];
    this.drawTorches();

    // ---------- Ambient vignette overlay ----------
    this.drawVignette();

    // ---------- HEADER AREA (fixed, top 90px) ----------
    this.drawHeader(data);

    // ---------- MASK for scrollable area ----------
    const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(0, LIST_TOP, 800, LIST_VISIBLE);
    const geoMask = maskShape.createGeometryMask();

    // ---------- Container for scrollable demon list ----------
    this.demonContainer = this.add.container(0, 0);
    this.demonContainer.setMask(geoMask);

    // ---------- MOMENTUM SCROLLING ----------
    this.scrollOffset = 0;
    this.targetScrollOffset = 0;
    this.scrollVelocity = 0;
    this.isDragging = false;
    this.lastPointerY = 0;
    this._lastHallScrollSaveAt = 0;
    this._hallScrollKey = this._hallScrollStorageKey();

    // Batch-assign demons to every issue with anti-clumping:
    //   - themed match first (prefer unused themed demon)
    //   - rank walk next (preserves hierarchy, starts at issue's rank)
    //   - overflow cycle only if the tier is genuinely exhausted
    // This stamps _demonKey / _demonName on each issue. Both the hall and
    // the Battle scene read those properties so the same demon shows in
    // both places.
    assignAllDemons(data.issues);

    // ---------- Reveal demons one by one ----------
    this.revealDemons(data.issues);

    // ---------- FOOTER AREA (fixed) ----------
    this.drawFooter();
    this.drawInputBlockers();
    this.restoreHallScrollOffset();

    // ---------- Quest timer ----------
    // First entry into the hall stamps the start. Persists on this.game
    // so re-entries after battles don't reset it. A new audit clears it
    // in SummoningScene. Timer is visibility-aware: it pauses when the
    // tab is hidden and resumes on focus (wired in main.js).
    if (!this.game._questStartMs) {
      this.game._questStartMs = Date.now();
      this.game._questActiveMs = 0;
      this.game._questVisibleSince = document.visibilityState === 'visible' ? Date.now() : null;
    }

    // ---------- DUNGEON CLEARED overlay (all demons defeated) ----------
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const remaining = issues.filter(i => !i.defeated && !i.fixed).length;
    if (issues.length > 0 && remaining === 0) {
      this.time.delayedCall(400, () => this._showDungeonClearedOverlay(issues));
    }

    // Mouse wheel
    this.input.on('wheel', (_pointer, _gameObjects, _dx, dy) => {
      this.scrollVelocity = 0;
      this.targetScrollOffset = Phaser.Math.Clamp(
        this.targetScrollOffset - dy * 1.2, -this.maxHallScroll(), 0
      );
      this.saveHallScrollOffset();
      // Throttled scroll sound
      const now = Date.now();
      if (now - this._lastScrollSfxTime > 120) {
        this._lastScrollSfxTime = now;
        SFX.play('menuHover');
      }
    });

    // Touch / click-drag scroll (use worldY for camera-zoom-safe coords)
    this.input.on('pointerdown', (pointer) => {
      if (pointer.worldY > LIST_TOP && pointer.worldY < LIST_BOTTOM) {
        this.isDragging = true;
        this.lastPointerY = pointer.worldY;
        this.scrollVelocity = 0;
      }
    });
    this.input.on('pointermove', (pointer) => {
      if (this.isDragging && pointer.isDown) {
        const dy = pointer.worldY - this.lastPointerY;
        this.targetScrollOffset = Phaser.Math.Clamp(
          this.targetScrollOffset + dy, -this.maxHallScroll(), 0
        );
        this.scrollVelocity = dy;
        this.lastPointerY = pointer.worldY;
      }
    });
    this.input.on('pointerup', () => {
      this.isDragging = false;
      this.saveHallScrollOffset();
    });

    // Smooth scroll with momentum
    this.events.on('update', () => {
      if (!this.isDragging && Math.abs(this.scrollVelocity) > 0.5) {
        this.targetScrollOffset = Phaser.Math.Clamp(
          this.targetScrollOffset + this.scrollVelocity, -this.maxHallScroll(), 0
        );
        this.scrollVelocity *= 0.92; // friction
      } else if (!this.isDragging) {
        this.scrollVelocity = 0;
      }
      this.scrollOffset += (this.targetScrollOffset - this.scrollOffset) * 0.18;
      this.demonContainer.y = this.scrollOffset;
      if (Math.abs(this.targetScrollOffset - (this._lastSavedHallScrollOffset ?? 0)) > 2) {
        this.scheduleHallScrollSave();
      }
    });

    this.events.once('shutdown', () => this.saveHallScrollOffset());
  }

  maxHallScroll() {
    return Math.max(0, (this.totalDemonListHeight || 0) - LIST_VISIBLE + 10);
  }

  _hallScrollStorageKey() {
    const safe = (value) => String(value || 'default')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default';
    const domain = safe(this.game.domain || this.game.auditData?.domain || 'quest');
    const runtime = safe(this.game.characterConfig?.runtime || 'codex');
    const profile = safe(this.game.characterConfig?.profile || this.game.characterConfig?.model || 'balanced');
    return `${HALL_SCROLL_KEY_PREFIX}_${domain}_${runtime}_${profile}`;
  }

  restoreHallScrollOffset() {
    const maxScroll = this.maxHallScroll();
    const memory = this.game._dungeonHallScrollOffsets || {};
    let saved = Number(memory[this._hallScrollKey]);
    if (!Number.isFinite(saved)) {
      try { saved = Number(localStorage.getItem(this._hallScrollKey)); } catch (_) {}
    }
    if (!Number.isFinite(saved)) saved = 0;
    const offset = Phaser.Math.Clamp(saved, -maxScroll, 0);
    this.scrollOffset = offset;
    this.targetScrollOffset = offset;
    this.scrollVelocity = 0;
    if (this.demonContainer) this.demonContainer.y = offset;
    this.game._dungeonHallScrollOffset = offset;
    this._lastSavedHallScrollOffset = offset;
  }

  saveHallScrollOffset() {
    const offset = Phaser.Math.Clamp(
      Number.isFinite(this.targetScrollOffset) ? this.targetScrollOffset : this.scrollOffset,
      -this.maxHallScroll(),
      0
    );
    this.game._dungeonHallScrollOffsets = this.game._dungeonHallScrollOffsets || {};
    this.game._dungeonHallScrollOffsets[this._hallScrollKey] = offset;
    this.game._dungeonHallScrollOffset = offset;
    this._lastSavedHallScrollOffset = offset;
    this._lastHallScrollSaveAt = Date.now();
    try { localStorage.setItem(this._hallScrollKey, String(Math.round(offset))); } catch (_) {}
  }

  scheduleHallScrollSave() {
    const now = Date.now();
    if (now - this._lastHallScrollSaveAt < 250) return;
    this.saveHallScrollOffset();
  }

  drawInputBlockers() {
    // Phaser masks hide rows visually but do not clip input hit areas.
    // Transparent blockers sit above scroll rows and below fixed header/footer
    // controls so hidden row portions cannot be clicked through the chrome.
    this.add.rectangle(400, LIST_TOP / 2, 800, LIST_TOP, 0x000000, 0)
      .setDepth(99)
      .setInteractive();
    this.add.rectangle(400, LIST_BOTTOM + ((600 - LIST_BOTTOM) / 2), 800, 600 - LIST_BOTTOM, 0x000000, 0)
      .setDepth(99)
      .setInteractive();
  }

  normalizeDomainUrl(domain) {
    const raw = String(domain || '').trim();
    if (!raw) return '';
    try {
      const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const url = new URL(candidate);
      if (!url.hostname.includes('.')) return '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  // =====================================================================
  // STONE WALL BACKGROUND
  // =====================================================================
  drawStoneWalls() {
    const g = this.add.graphics();

    // Base dark stone fill
    g.fillStyle(0x0e0e1c);
    g.fillRect(0, 0, 800, 600);

    // Stone brick pattern
    const brickH = 24;
    const brickW = 50;
    for (let row = 0; row < 26; row++) {
      const yy = row * brickH;
      const offset = (row % 2 === 0) ? 0 : brickW * 0.5;
      for (let col = -1; col < 18; col++) {
        const xx = col * brickW + offset;
        const shade = 0x0d0d18 + (((row * 7 + col * 13) % 5) * 0x010102);
        g.fillStyle(shade);
        g.fillRect(xx + 1, yy + 1, brickW - 2, brickH - 2);
      }
      g.lineStyle(1, 0x08080f, 0.6);
      g.lineBetween(0, yy, 800, yy);
    }

    // Vertical mortar lines
    for (let row = 0; row < 26; row++) {
      const yy = row * brickH;
      const offset = (row % 2 === 0) ? 0 : brickW * 0.5;
      g.lineStyle(1, 0x08080f, 0.5);
      for (let col = 0; col < 18; col++) {
        const xx = col * brickW + offset;
        g.lineBetween(xx, yy, xx, yy + brickH);
      }
    }

    // Dark gradient overlay at top and bottom for depth
    for (let i = 0; i < 40; i++) {
      const a = 0.6 * (1 - i / 40);
      g.fillStyle(0x000000, a);
      g.fillRect(0, i, 800, 1);
      g.fillRect(0, 600 - i, 800, 1);
    }

    // Side shadows for corridor depth
    for (let i = 0; i < 60; i++) {
      const a = 0.5 * (1 - i / 60);
      g.fillStyle(0x000000, a);
      g.fillRect(i, 0, 1, 600);
      g.fillRect(800 - i, 0, 1, 600);
    }
  }

  // =====================================================================
  // TORCH LIGHTING
  // =====================================================================
  drawTorches() {
    const torchPositions = [
      { x: 22, y: 150 }, { x: 778, y: 150 },
      { x: 22, y: 320 }, { x: 778, y: 320 },
      { x: 22, y: 490 }, { x: 778, y: 490 }
    ];

    torchPositions.forEach((pos) => {
      const bracket = this.add.graphics();
      bracket.fillStyle(0x5a4030);
      bracket.fillRect(pos.x - 3, pos.y + 4, 6, 14);
      bracket.fillStyle(0x3a2a1a);
      bracket.fillRect(pos.x - 4, pos.y + 2, 8, 4);

      const flame = this.add.graphics();
      this.drawFlame(flame, pos.x, pos.y, 1.0);

      const glow = this.add.graphics();
      this.drawTorchGlow(glow, pos.x, pos.y, 1.0);

      this.torches.push({ flame, glow, x: pos.x, y: pos.y, phase: Math.random() * Math.PI * 2 });
    });

    this.time.addEvent({
      delay: 80,
      loop: true,
      callback: () => {
        this.torches.forEach((t) => {
          t.phase += 0.3 + Math.random() * 0.2;
          const intensity = 0.7 + 0.3 * Math.sin(t.phase);
          t.flame.clear();
          this.drawFlame(t.flame, t.x, t.y, intensity);
          t.glow.clear();
          this.drawTorchGlow(t.glow, t.x, t.y, intensity);
        });
      }
    });

    // Periodic torch crackle ambience
    this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        SFX.play('torchCrackle');
      }
    });
  }

  drawFlame(g, x, y, intensity) {
    g.fillStyle(0xf0a020, intensity);
    g.fillEllipse(x, y - 2, 6 * intensity, 10 * intensity);
    g.fillStyle(0xffe060, intensity * 0.9);
    g.fillEllipse(x, y - 5, 3 * intensity, 6 * intensity);
    g.fillStyle(0xffffff, intensity * 0.5);
    g.fillEllipse(x, y, 2, 3);
  }

  drawTorchGlow(g, x, y, intensity) {
    const layers = [
      { radius: 90, color: 0xf09020, alpha: 0.04 * intensity },
      { radius: 60, color: 0xf0a030, alpha: 0.06 * intensity },
      { radius: 35, color: 0xf0b040, alpha: 0.08 * intensity },
      { radius: 18, color: 0xf0c050, alpha: 0.12 * intensity }
    ];
    layers.forEach((l) => {
      g.fillStyle(l.color, l.alpha);
      g.fillCircle(x, y, l.radius);
    });
  }

  // =====================================================================
  // BLOOD DRIP TRANSITION (returning from battle)
  // =====================================================================
  _bloodDripTransition() {
    const W = 800, H = 600;

    // Blood wash overlay - dark red that fades
    const wash = this.add.rectangle(400, 300, W, H, 0x400000, 0.6).setDepth(2000);
    this.tweens.add({
      targets: wash,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => wash.destroy()
    });

    // Blood drips falling from the top
    const dripCount = 18;
    for (let i = 0; i < dripCount; i++) {
      const x = Phaser.Math.Between(20, W - 20);
      const dripW = Phaser.Math.Between(3, 8);
      const dripH = Phaser.Math.Between(40, 160);
      const delay = Phaser.Math.Between(0, 400);
      const speed = Phaser.Math.Between(600, 1200);

      const drip = this.add.rectangle(x, -dripH, dripW, dripH, 0x8b0000, 0.7).setDepth(1999);
      this.tweens.add({
        targets: drip,
        y: H + dripH,
        duration: speed,
        delay: delay,
        ease: 'Power1',
        onComplete: () => drip.destroy()
      });
    }

    // A few thick blood streaks
    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(50, W - 50);
      const streakW = Phaser.Math.Between(12, 24);
      const delay = Phaser.Math.Between(50, 300);

      const streak = this.add.rectangle(x, -100, streakW, 200, 0x660000, 0.5).setDepth(1998);
      this.tweens.add({
        targets: streak,
        y: H + 200,
        alpha: 0,
        duration: 900,
        delay: delay,
        ease: 'Cubic.easeIn',
        onComplete: () => streak.destroy()
      });
    }
  }

  // VIGNETTE
  // =====================================================================
  drawVignette() {
    const g = this.add.graphics();
    g.setDepth(1000);
    for (let i = 0; i < 120; i++) {
      const a = 0.25 * (1 - i / 120);
      g.fillStyle(0x000000, a);
      g.fillRect(0, i * 2, i, 1);
      g.fillRect(i, 0, 1, i * 2);
      g.fillRect(800 - i, 0, 1, i * 2);
      g.fillRect(0, 600 - i * 2, i, 1);
      g.fillRect(800 - i, 600 - i * 2, i, 1);
    }
  }

  // =====================================================================
  // HEADER (top 90px)
  // =====================================================================
  drawHeader(data) {
    const headerBg = this.add.graphics();
    headerBg.setDepth(100);

    // Solid dark panel
    headerBg.fillStyle(0x050508, 0.97);
    headerBg.fillRect(0, 0, 800, 90);

    // Ornamental bottom border -- double line with gold
    headerBg.lineStyle(1, 0xf0c040, 0.15);
    headerBg.lineBetween(30, 84, 770, 84);
    headerBg.lineStyle(2, 0xf0c040, 0.5);
    headerBg.lineBetween(30, 88, 770, 88);

    // Corner filigree
    headerBg.lineStyle(1, 0xf0c040, 0.35);
    headerBg.lineBetween(30, 88, 30, 74);
    headerBg.lineBetween(770, 88, 770, 74);
    headerBg.lineBetween(30, 74, 38, 74);
    headerBg.lineBetween(770, 74, 762, 74);

    // "THE DUNGEON OF" subtitle
    this.add.text(400, 14, 'THE DUNGEON OF', {
      fontFamily: HEADER_FONT,
      fontSize: '10px',
      color: '#707090',
      letterSpacing: 6,
      resolution: window.GAME_DPR
    }).setOrigin(0.5, 0).setDepth(101);

    // Domain name -- big gold text
    const domainText = this.add.text(400, 32, data.domain.toUpperCase(), {
      fontFamily: HEADER_FONT,
      fontSize: '16px',
      color: COLORS.gold,
      shadow: {
        offsetX: 0, offsetY: 0, color: '#f0c040', blur: 16, fill: true, stroke: true
      },
      resolution: window.GAME_DPR
    }).setOrigin(0.5, 0).setDepth(101);
    domainText.setInteractive({ useHandCursor: true });
    domainText.on('pointerover', () => {
      domainText.setShadow(0, 0, '#ffe680', 20, true, true);
      SFX.play('menuHover');
    });
    domainText.on('pointerout', () => {
      domainText.setShadow(0, 0, '#f0c040', 16, true, true);
    });
    domainText.on('pointerdown', () => {
      const url = this.normalizeDomainUrl(data.domain);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });

    // Decorative swords beside domain
    const hw = domainText.width * 0.5;
    this.add.text(400 - hw - 26, 38, '\u2694', {
      fontFamily: BODY_FONT, fontSize: '16px', color: COLORS.gold, resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(101);
    this.add.text(400 + hw + 26, 38, '\u2694', {
      fontFamily: BODY_FONT, fontSize: '16px', color: COLORS.gold, resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(101);

    // --- SEO SCORE (left) ---
    const scoreColor = data.score >= 70 ? COLORS.green : data.score >= 40 ? COLORS.gold : COLORS.red;
    const scoreGlowHex = data.score >= 70 ? '#40c040' : data.score >= 40 ? '#f0c040' : '#e04040';

    this.add.text(160, 56, 'ORIGINAL SEO SCORE', {
      fontFamily: HEADER_FONT, fontSize: '10px', color: '#606080', resolution: window.GAME_DPR
    }).setOrigin(0.5, 0).setDepth(101);

    const scoreValue = this.add.text(160, 68, `${data.score}/100`, {
      fontFamily: HEADER_FONT,
      fontSize: '14px',
      color: scoreColor,
      shadow: {
        offsetX: 0, offsetY: 0, color: scoreGlowHex, blur: 18, fill: true, stroke: true
      },
      resolution: window.GAME_DPR
    }).setOrigin(0.5, 0).setDepth(101);

    // Pulsing glow on score
    this.tweens.add({
      targets: scoreValue,
      alpha: 0.65,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // --- DEMON COUNT (right) ---
    this.add.text(640, 56, 'DEMONS', {
      fontFamily: HEADER_FONT, fontSize: '10px', color: '#606080', resolution: window.GAME_DPR
    }).setOrigin(0.5, 0).setDepth(101);

    const awaitCount = Array.isArray(data.issues)
      ? data.issues.filter(i => !i.defeated && !i.fixed).length
      : (data.totalIssues || 0);
    this.add.text(640, 68, `${awaitCount} AWAIT`, {
      fontFamily: HEADER_FONT,
      fontSize: '14px',
      color: '#e04040',
      shadow: {
        offsetX: 0, offsetY: 0, color: '#e04040', blur: 12, fill: true, stroke: true
      },
      resolution: window.GAME_DPR
    }).setOrigin(0.5, 0).setDepth(101);

    // --- Divider diamonds in center bottom ---
    this.add.text(400, 56, '\u25C6  \u25C6  \u25C6', {
      fontFamily: BODY_FONT, fontSize: '10px', color: '#303050', resolution: window.GAME_DPR
    }).setOrigin(0.5, 0).setDepth(101);
  }

  // =====================================================================
  // FOOTER
  // =====================================================================
  drawFooter() {
    const footerBg = this.add.graphics();
    footerBg.setDepth(100);
    footerBg.fillStyle(0x050508, 0.97);
    footerBg.fillRect(0, LIST_BOTTOM, 800, 82);

    // Top border
    footerBg.lineStyle(2, 0xf0c040, 0.35);
    footerBg.lineBetween(30, LIST_BOTTOM + 1, 770, LIST_BOTTOM + 1);
    footerBg.lineStyle(1, 0xf0c040, 0.15);
    footerBg.lineBetween(30, LIST_BOTTOM + 5, 770, LIST_BOTTOM + 5);

    // Corner filigree
    footerBg.lineStyle(1, 0xf0c040, 0.35);
    footerBg.lineBetween(30, LIST_BOTTOM + 1, 30, LIST_BOTTOM + 14);
    footerBg.lineBetween(770, LIST_BOTTOM + 1, 770, LIST_BOTTOM + 14);

    // Knight (animated warrior idle sprite)
    const knight = this.add.sprite(90, 558, 'char_idle').setScale(2).setDepth(101).play('char_idle_anim');

    // Knight breathing glow
    const knightGlow = this.add.graphics().setDepth(100);
    knightGlow.fillStyle(0x4080e0, 0.06);
    knightGlow.fillCircle(90, 558, 40);
    this.tweens.add({
      targets: knightGlow,
      alpha: 0.4,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Flavor text - shuffled bag, organic pacing, varied transitions.
    // Matches the philosophy used in the Summoning scene: no repetitive
    // rotation, no mechanical fade - a small motion-graphics system so
    // players can sit and read the world without seeing the same line.
    this._hallBag = [];
    this._hallBaseX = 460;
    this._hallBaseY = 555;
    const firstMsg = this._nextHallMessage();
    const instruction = this.add.text(this._hallBaseX, this._hallBaseY, firstMsg, {
      fontFamily: HEADER_FONT,
      fontSize: '10px',
      color: '#f0c040',
      shadow: {
        offsetX: 0, offsetY: 0, color: '#f0c040', blur: 8, fill: true, stroke: true
      },
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(101);
    this._hallInstruction = instruction;
    // Schedule next cycle with organic delay
    this._scheduleNextHallMessage(3200 + Math.floor(Math.random() * 1400));

    // Scroll hint
    this.add.text(460, 576, '\u25B2 SCROLL TO EXPLORE \u25BC', {
      fontFamily: HEADER_FONT, fontSize: '10px', color: '#404060', resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(101);

    // Return to Guild Hall button (top-right area of footer)
    const returnBtn = this.add.text(740, 558, '\u2190 GUILD HALL', {
      fontFamily: HEADER_FONT, fontSize: '9px', color: '#606078',
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(101).setInteractive({ useHandCursor: true });

    returnBtn.on('pointerover', () => {
      returnBtn.setColor('#d4af37');
      SFX.play('menuHover');
    });
    returnBtn.on('pointerout', () => {
      returnBtn.setColor('#606078');
    });
    returnBtn.on('pointerdown', () => {
      SFX.play('menuConfirm');
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.time.delayedCall(500, () => {
        window.returnToTitle();
      });
    });
  }

  // =====================================================================
  // REVEAL DEMONS
  // =====================================================================
  revealDemons(issues) {
    // Sort by severity: critical first, then high, medium, low, info
    const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const sorted = [...issues].sort((a, b) => {
      return (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
    });
    issues.length = 0;
    issues.push(...sorted);

    // Pre-measure all row heights so we can position dynamically
    const textLeftX = 128;
    const threatX = 660;
    const titleMaxW = threatX - textLeftX - 20;
    const descMaxW = threatX - textLeftX - 10;
    const rowHeights = [];
    const BADGE_H = 20;  // badge line
    const PAD_TOP = 10;
    const PAD_BOTTOM = 30; // room for category tag + padding

    sorted.forEach((issue) => {
      // Measure title height
      const titleM = this.add.text(0, -9999, issue.title, {
        fontFamily: BODY_FONT, fontSize: '14px',
        wordWrap: { width: titleMaxW, useAdvancedWrap: true },
        resolution: window.GAME_DPR
      });
      const titleH = titleM.height;
      titleM.destroy();

      // Measure desc height
      let descH = 0;
      const descText = issue.description || '';
      if (descText) {
        const descM = this.add.text(0, -9999, descText, {
          fontFamily: BODY_FONT, fontSize: '11px',
          wordWrap: { width: descMaxW, useAdvancedWrap: true },
          resolution: window.GAME_DPR
        });
        descH = descM.height;
        descM.destroy();
      }

      const rowH = PAD_TOP + BADGE_H + titleH + (descH > 0 ? descH + 4 : 0) + PAD_BOTTOM;
      rowHeights.push(Math.max(rowH, 80)); // minimum 80px
    });

    // Store cumulative Y positions and total content height
    this.demonRowYs = [];
    this.demonRowHeights = [];
    let cumY = LIST_TOP;
    rowHeights.forEach((h) => {
      this.demonRowYs.push(cumY);
      this.demonRowHeights.push(h);
      cumY += h + ROW_GAP;
    });
    this.totalDemonListHeight = cumY - LIST_TOP;

    sorted.forEach((issue, i) => {
      this.materializeDemon(issue, i);
    });
  }

  // =====================================================================
  // MATERIALIZE A SINGLE DEMON ROW (dynamic height)
  // =====================================================================
  materializeDemon(issue, index) {
    const y = this.demonRowYs[index];
    const rowH = this.demonRowHeights[index];
    const centerY = y + rowH * 0.5;
    const severitySprite = `demon_${issue.severity}_real`;

    const sevPalette = {
      critical: { text: '#ff2040', hex: 0xff2040, glow: '#ff2040', bgTint: 0x2a0810, barStart: 0xff2040, barEnd: 0xcc1030 },
      high:     { text: '#e06020', hex: 0xe06020, glow: '#e06020', bgTint: 0x2a1508, barStart: 0xe06020, barEnd: 0xc04010 },
      medium:   { text: '#f0c040', hex: 0xf0c040, glow: '#f0c040', bgTint: 0x2a2208, barStart: 0xf0c040, barEnd: 0xd0a020 },
      low:      { text: '#40c040', hex: 0x40c040, glow: '#40c040', bgTint: 0x082a10, barStart: 0x40c040, barEnd: 0x309030 },
      info:     { text: '#4080e0', hex: 0x4080e0, glow: '#4080e0', bgTint: 0x08102a, barStart: 0x4080e0, barEnd: 0x3060b0 }
    };
    const sev = sevPalette[issue.severity] || sevPalette.info;

    // Layout constants
    const rowX = 46;
    const rowW = 708;
    const spriteX = 86;
    const textLeftX = 128;
    const threatX = 660;

    // =========================
    // LAYER 0: ROW BACKGROUND (lowest z in container)
    // =========================
    const rowBg = this.add.graphics();
    rowBg.fillStyle(0x10101e, 0);
    rowBg.fillRoundedRect(rowX, y, rowW, rowH, 6);

    const rowBorder = this.add.graphics();

    // =========================
    // LAYER 1: SHADOW BURST PARTICLES
    // =========================
    this.createShadowBurst(spriteX, centerY);

    // =========================
    // LAYER 2: DEMON SPRITE
    // =========================
    // Every demon in the roster is a 0x72 4-frame idle animation.
    // assignAllDemons() already stamped _demonKey/_demonAnimKey on the
    // issue - we just look up, scale to the tier target, and play the
    // anim. No fake scale-breath tweens anywhere; real frame animation
    // carries the "alive" feel.
    const picked = pickDemonForIssue(issue.severity, issue.id, issue);
    issue._demonKey = picked.key;
    issue._demonName = picked.label;
    const baseScale = SPRITE_SCALES[issue.severity] || 1.0;
    const demon = this.add.sprite(spriteX, centerY, picked.frame0Key)
      .setScale(baseScale)
      .setAlpha(1)
      .setFlipX(true);                // face left, toward player perspective
    if (this.anims.exists(picked.animKey)) demon.play(picked.animKey);
    // Subtle vertical bob only - the 4-frame idle handles "breathing."
    this.tweens.add({
      targets: demon, y: centerY - 3,
      duration: 1200 + index * 80, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut', delay: 600,
    });

    const shadow = this.add.ellipse(spriteX, centerY + 18, 22, 6, 0x000000, 0.3);
    this.tweens.add({
      targets: shadow, scaleX: 0.8,
      duration: 1200 + index * 80, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut', delay: 600
    });

    // =========================
    // LAYER 2b: SILHOUETTE + POWER-LEVEL EFFECTS
    // Undefeated demons are blacked out until the user fights them.
    // The effect tier escalates with severity: info is pure silhouette,
    // low/medium add a subtle aura, high adds rising embers, and
    // critical adds a full intense aura + multi-particle swirl.
    // =========================
    const silhouetteLayers = [];
    const isUndefeated = !issue.defeated && !issue.fixed;
    if (isUndefeated) {
      demon.setTint(0x000000);
      this._applySilhouetteEffects(demon, issue, spriteX, centerY, silhouetteLayers);
    }

    // =========================
    // LAYER 3: SEVERITY BADGE (own line above title)
    // =========================
    const sevLabel = issue.severity.toUpperCase();
    const badgePadX = 10;
    const badgeH = 16;
    const badgeY = y + 10;

    const badgeMeasure = this.add.text(0, -9999, sevLabel, {
      fontFamily: HEADER_FONT, fontSize: '9px', resolution: window.GAME_DPR
    });
    const badgeW = badgeMeasure.width + badgePadX * 2;
    badgeMeasure.destroy();

    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(sev.hex, 0.2);
    badgeBg.fillRoundedRect(textLeftX, badgeY, badgeW, badgeH, 8);
    badgeBg.lineStyle(1, sev.hex, 0.5);
    badgeBg.strokeRoundedRect(textLeftX, badgeY, badgeW, badgeH, 8);

    const badge = this.add.text(textLeftX + badgeW * 0.5, badgeY + badgeH * 0.5, sevLabel, {
      fontFamily: HEADER_FONT, fontSize: '9px', color: sev.text,
      shadow: { offsetX: 0, offsetY: 0, color: sev.glow, blur: 6, fill: true, stroke: true },
      resolution: window.GAME_DPR
    }).setOrigin(0.5);

    // =========================
    // LAYER 4: ISSUE TITLE (below badge, full width, no truncation)
    // =========================
    const titleMaxW = threatX - textLeftX - 20;
    const titleY = badgeY + badgeH + 4;
    const title = this.add.text(textLeftX, titleY, issue.title, {
      fontFamily: BODY_FONT, fontSize: '14px', color: '#d8d8e8',
      shadow: { offsetX: 1, offsetY: 1, color: '#000000', blur: 3, fill: true },
      wordWrap: { width: titleMaxW, useAdvancedWrap: true },
      resolution: window.GAME_DPR
    });

    // =========================
    // LAYER 5: DESCRIPTION (below title, full text, no truncation)
    // =========================
    const descText = issue.description || '';
    let desc = null;
    let cat = null;
    let catBg = null;
    if (descText) {
      const descMaxW = threatX - textLeftX - 10;
      const descY = titleY + title.height + 4;
      desc = this.add.text(textLeftX, descY, descText, {
        fontFamily: BODY_FONT, fontSize: '11px', color: '#d0d0e8',
        shadow: { offsetX: 1, offsetY: 1, color: '#000000', blur: 5, fill: true },
        wordWrap: { width: descMaxW, useAdvancedWrap: true },
        resolution: window.GAME_DPR
      });
    }

    // =========================
    // LAYER 6: CATEGORY TAG (bottom-right)
    // =========================
    const catText = issue.category || '';
    if (catText) {
      const catLabel = catText.toUpperCase();
      const catTagW = catLabel.length * 7.5 + 18;
      const catTagX = rowX + rowW - catTagW - 10;
      const catTagY = y + rowH - 24;

      catBg = this.add.graphics();
      catBg._catX = catTagX;
      catBg._catY = catTagY;
      catBg._catW = catTagW;
      catBg.fillStyle(0x070708, 0.88);
      catBg.fillRoundedRect(catTagX, catTagY, catTagW, 18, 9);
      catBg.lineStyle(1, 0x60d8d8, 0.6);
      catBg.strokeRoundedRect(catTagX, catTagY, catTagW, 18, 9);

      cat = this.add.text(catTagX + catTagW * 0.5, catTagY + 9, catLabel, {
        fontFamily: HEADER_FONT, fontSize: '10px', color: '#c0ffff',
        shadow: { offsetX: 0, offsetY: 0, color: '#000000', blur: 4, fill: true },
        resolution: window.GAME_DPR
      }).setOrigin(0.5);
    }

    // =========================
    // LAYER 7: THREAT LEVEL (top-right)
    // =========================
    const threatLabels = {
      critical: 'DEADLY', high: 'DANGEROUS', medium: 'MODERATE',
      low: 'MINOR', info: 'TRIVIAL'
    };
    const threat = this.add.text(rowX + rowW - 14, y + 10, threatLabels[issue.severity] || 'UNKNOWN', {
      fontFamily: HEADER_FONT, fontSize: '11px', color: sev.text,
      letterSpacing: 3,
      shadow: { offsetX: 0, offsetY: 0, color: sev.glow, blur: 8, fill: true, stroke: true },
      resolution: window.GAME_DPR
    }).setOrigin(1, 0);

    // =========================
    // INTERACTIVE HIT AREA (on top for click detection, but invisible)
    // =========================
    const hitArea = this.add.rectangle(400, y + rowH * 0.5, rowW, rowH, 0x000000, 0)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    // =========================
    // HOVER / CLICK - bg redraws BEHIND content via z-order in container
    // =========================
    hitArea.on('pointerover', () => {
      // Throttled hover sound - only plays once per row change
      if (this._lastHoveredRow !== index) {
        this._lastHoveredRow = index;
        SFX.play('demonRowHover');
      }
      rowBg.clear();
      rowBg.fillStyle(sev.bgTint, 0.95);
      rowBg.fillRoundedRect(rowX, y, rowW, rowH, 6);
      rowBorder.clear();
      rowBorder.lineStyle(1.5, 0xf0c040, 0.5);
      rowBorder.strokeRoundedRect(rowX, y, rowW, rowH, 6);
      title.setColor('#ffffff');
      if (desc) { desc.setColor('#ffffff'); desc.setShadow(0, 0, '#000000', 10, true, true); }
      threat.setColor('#ffffff');
      if (cat) { cat.setColor('#ffffff'); cat.setShadow(0, 0, '#000000', 8, true, true); }
      if (catBg) {
        catBg.clear();
        catBg.fillStyle(0x000000, 0.9);
        catBg.fillRoundedRect(catBg._catX, catBg._catY, catBg._catW, 18, 9);
        catBg.lineStyle(1, 0xffffff, 0.7);
        catBg.strokeRoundedRect(catBg._catX, catBg._catY, catBg._catW, 18, 9);
      }
    });
    hitArea.on('pointerout', () => {
      rowBg.clear();
      rowBg.fillStyle(0x08080c, 0.78);
      rowBg.fillRoundedRect(rowX, y, rowW, rowH, 6);
      rowBorder.clear();
      rowBorder.lineStyle(1, 0x2a2418, 0.45);
      rowBorder.strokeRoundedRect(rowX, y, rowW, rowH, 6);
      title.setColor('#d8d8e8');
      if (desc) { desc.setColor('#d0d0e8'); desc.setShadow(1, 1, '#000000', 5, true, false); }
      threat.setColor(sev.text);
      if (cat) { cat.setColor('#c0ffff'); cat.setShadow(0, 0, '#000000', 4, true, false); }
      if (catBg) {
        catBg.clear();
        catBg.fillStyle(0x070708, 0.88);
        catBg.fillRoundedRect(catBg._catX, catBg._catY, catBg._catW, 18, 9);
        catBg.lineStyle(1, 0x60d8d8, 0.6);
        catBg.strokeRoundedRect(catBg._catX, catBg._catY, catBg._catW, 18, 9);
      }
    });
    hitArea.on('pointerdown', () => {
      this.saveHallScrollOffset();
      SFX.play('menuConfirm');
      this.cameras.main.flash(400, 255, 50, 50);
      this.cameras.main.shake(200, 0.006);
      this.time.delayedCall(500, () => {
        SFX.play('encounterStart');
        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.time.delayedCall(600, () => this.scene.start('Battle', { issue }));
      });
    });

    // Row background - instant
    rowBg.clear();
    rowBg.fillStyle(0x12121e, 0.7);
    rowBg.fillRoundedRect(rowX, y, rowW, rowH, 6);
    rowBorder.lineStyle(1, 0x2a2418, 0.45);
    rowBorder.strokeRoundedRect(rowX, y, rowW, rowH, 6);

    // Screen shake for critical (first visit only - gets jarring on repeat)
    if (issue.severity === 'critical' && !this.game._dungeonHallShakeDone) {
      this.game._dungeonHallShakeDone = true;
      this.time.delayedCall(250, () => {
        this.cameras.main.shake(300, 0.004);
        this.cameras.main.flash(150, 60, 0, 0);
      });
    }

    // =========================
    // DEFEATED STATE - cinematic, painterly, deterministic-per-demon
    // =========================
    // No source art has a death pose, so we compose one: blood-red
    // drain of the idle sprite, slump-rotation, blood pool seeping
    // under the body, two or three crimson slash marks forming an X,
    // a ring of blood spatter, and a small "DEFEATED" stamp in the
    // corner. For legacy 0x72 4-frame demons we freeze the animation
    // on a deterministically-picked random frame so every kill shows
    // the demon in a slightly different pose. All randomness is
    // seeded from the issue id - stable across renders, varied across
    // demons. Dimmed row chrome sells "inactive."
    // =========================
    let defeatedLayers = null;
    if (issue.defeated) {
      hitArea.disableInteractive();

      // Stop idle motion - dead demons don't breathe or bob
      this.tweens.killTweensOf(demon);
      this.tweens.killTweensOf(shadow);
      demon.setPosition(spriteX, centerY);

      // Freeze the 0x72 idle animation on a deterministic random frame
      // so every corpse looks slightly different. The slump rotation +
      // blood treatment carries the rest of the variety.
      const seed = this._defeatedSeed(issue);
      const H = (salt) => ((Math.abs(Math.floor((seed + salt) * 2654435761)) % 10000) / 10000);
      if (demon.anims && demon.anims.currentAnim) {
        const frames = demon.anims.currentAnim.frames;
        const idx = Math.floor(H(7) * frames.length) % frames.length;
        demon.anims.stop();
        const pick = frames[idx]?.textureKey || `${picked.framePrefix}${idx}`;
        if (pick) demon.setTexture(pick);
      }

      // Defeated demons stay visible in color. The red lower-corner tint,
      // slump angle, blood pool, and slash layers sell the slain state
      // without turning the sprite back into an unexplored silhouette.
      demon.setTint(0xffffff, 0xf0d0d0, 0xb44a4a, 0x7a1822);
      demon.setAlpha(0.82);
      const slumpDeg = (H(11) * 10) - 5;           // -5° to +5°
      demon.setRotation(slumpDeg * Math.PI / 180);
      shadow.setAlpha(0.12);                        // pool replaces it visually

      // --- Blood pool beneath the body (layered for painterly depth) ---
      const tierPoolScale = {
        info: 0.70, low: 0.85, medium: 1.00, high: 1.18, critical: 1.38
      }[issue.severity] || 1.0;
      const poolCx = spriteX + (H(17) - 0.5) * 4;
      const poolCy = centerY + 18;
      const poolW  = (46 + H(3) * 16) * tierPoolScale;
      const poolH  = (7 + H(5) * 3)  * tierPoolScale;
      const bloodPool = this.add.graphics();
      // Soft outer halo
      bloodPool.fillStyle(0x3a0510, 0.25);
      bloodPool.fillEllipse(poolCx, poolCy, poolW + 14, poolH + 4);
      // Mid pool body
      bloodPool.fillStyle(0x5a0a15, 0.42);
      bloodPool.fillEllipse(poolCx + (H(19) - 0.5) * 3, poolCy, poolW, poolH);
      // Dense inner pool
      bloodPool.fillStyle(0x2a0208, 0.62);
      bloodPool.fillEllipse(poolCx + (H(21) - 0.5) * 3, poolCy - 1, poolW * 0.58, poolH * 0.65);
      // Runoff smear to one side (asymmetric, more organic)
      const runoffDir = H(22) > 0.5 ? 1 : -1;
      bloodPool.fillStyle(0x1a0004, 0.72);
      bloodPool.fillEllipse(poolCx + runoffDir * (4 + H(23) * 12), poolCy + 1, poolW * 0.34, poolH * 0.42);
      // A few drip droplets extending outward
      const dripCount = 2 + Math.floor(H(24) * 3);
      for (let d = 0; d < dripCount; d++) {
        const dAng = (H(25 + d * 3) * Math.PI) + Math.PI; // below the sprite
        const dR = poolW * 0.45 + H(26 + d * 3) * poolW * 0.25;
        const dx = poolCx + Math.cos(dAng) * dR;
        const dy = poolCy + Math.sin(dAng) * dR * 0.4 + 2;
        bloodPool.fillStyle(0x3a0510, 0.55);
        bloodPool.fillCircle(dx, dy, 1.2 + H(27 + d * 3) * 1.8);
      }

      // --- Slash marks across the body (the killing blows) ---
      const slashes = this.add.graphics();
      const sC = spriteX;
      const sR = centerY;
      const slashReach = ({
        info: 20, low: 24, medium: 28, high: 32, critical: 36
      }[issue.severity] || 28);
      const drawSlash = (angleDeg, thickness, coreAlpha, core, glow) => {
        const rad = angleDeg * Math.PI / 180;
        const dx = Math.cos(rad) * slashReach;
        const dy = Math.sin(rad) * slashReach;
        // Wide glow (painterly halo)
        slashes.lineStyle(thickness + 5, glow, coreAlpha * 0.16);
        slashes.lineBetween(sC - dx, sR - dy, sC + dx, sR + dy);
        // Mid
        slashes.lineStyle(thickness + 2, core, coreAlpha * 0.42);
        slashes.lineBetween(sC - dx * 0.95, sR - dy * 0.95, sC + dx * 0.95, sR + dy * 0.95);
        // Core bright stroke - slightly shorter to fake taper at tips
        slashes.lineStyle(thickness, core, coreAlpha);
        slashes.lineBetween(sC - dx * 0.86, sR - dy * 0.86, sC + dx * 0.86, sR + dy * 0.86);
        // Tiny bright hit point at impact center
        slashes.fillStyle(0xf8283a, coreAlpha * 0.85);
        slashes.fillCircle(sC + (H(91) - 0.5) * 6, sR + (H(93) - 0.5) * 4, 1.2);
      };

      // Primary X - two crossing diagonals with slight angle jitter
      const a1 = -48 + (H(31) - 0.5) * 16;
      drawSlash(a1, 2, 0.86, 0xd42030, 0xf04050);
      const a2 =  48 + (H(37) - 0.5) * 16;
      drawSlash(a2, 2, 0.78, 0xb81828, 0xd84050);

      // Bigger tiers get more cuts (more aggressive death)
      if (issue.severity === 'medium' || issue.severity === 'high' || issue.severity === 'critical') {
        const a3 = (H(41) - 0.5) * 40 + (H(43) > 0.5 ? 20 : -20);
        drawSlash(a3, 1.4, 0.55, 0xe02838, 0xf05060);
      }
      if (issue.severity === 'critical') {
        const a4 = 90 + (H(45) - 0.5) * 20;   // near-vertical parting slash
        drawSlash(a4, 1.3, 0.48, 0xc82030, 0xe85060);
      }

      // --- Blood spatter (ring of painterly droplets) ---
      const spatter = this.add.graphics();
      const spatterBase = ({ info: 5, low: 7, medium: 9, high: 12, critical: 16 }[issue.severity] || 8);
      const spatterCount = spatterBase + Math.floor(H(47) * 4);
      for (let i = 0; i < spatterCount; i++) {
        const aa = H(51 + i * 7) * Math.PI * 2;
        const rr = 14 + H(53 + i * 11) * 30;
        const px = sC + Math.cos(aa) * rr;
        const py = sR + Math.sin(aa) * rr * 0.72; // flatten vertically
        const sizeBase = 0.7 + H(59 + i * 13) * 2.4;
        const darkness = H(61 + i * 17);
        const color = darkness < 0.3 ? 0x9a0a1c
                    : darkness < 0.7 ? 0x5a0510
                                     : 0x2a0208;
        spatter.fillStyle(color, 0.65 + H(67 + i * 19) * 0.3);
        spatter.fillCircle(px, py, sizeBase);
        // Every few dots, add a tiny paired satellite drop for splatter feel
        if ((i % 3) === 0) {
          spatter.fillStyle(color, 0.55);
          spatter.fillCircle(px + (H(69 + i) - 0.5) * 5, py + (H(71 + i) - 0.5) * 4, sizeBase * 0.55);
        }
      }
      // A few elongated smears radiating outward
      const smearCount = 2 + Math.floor(H(73) * 3);
      for (let i = 0; i < smearCount; i++) {
        const aa = H(75 + i * 11) * Math.PI * 2;
        const rr = 16 + H(79 + i * 13) * 14;
        const px = sC + Math.cos(aa) * rr;
        const py = sR + Math.sin(aa) * rr * 0.72;
        const len = 3 + H(83 + i * 17) * 5;
        const wid = 1.1 + H(89 + i * 19);
        spatter.fillStyle(0x6a0a15, 0.55);
        spatter.fillEllipse(px, py, len, wid);
      }

      // --- Row chrome: dim to sell "inactive" ---
      rowBg.clear();
      rowBg.fillStyle(0x0a0308, 0.82);
      rowBg.fillRoundedRect(rowX, y, rowW, rowH, 6);
      rowBorder.clear();
      rowBorder.lineStyle(1, 0x3a0a10, 0.55);
      rowBorder.strokeRoundedRect(rowX, y, rowW, rowH, 6);

      // --- Corner DEFEATED stamp ---
      // Gothic, dim, off-white-red. Sits at bottom-left of the row,
      // under the badge column - out of the way of category tag.
      const stampW = 78, stampH = 15;
      const stampX = textLeftX;                  // bottom-left corner
      const stampY = y + rowH - stampH - 6;
      const stampBg = this.add.graphics();
      stampBg.fillStyle(0x180308, 0.72);
      stampBg.fillRoundedRect(stampX, stampY, stampW, stampH, 2);
      stampBg.lineStyle(1, 0x8a1020, 0.85);
      stampBg.strokeRoundedRect(stampX, stampY, stampW, stampH, 2);
      // Two tiny crossed hash marks as a stamp icon
      const stampIcon = this.add.graphics();
      stampIcon.lineStyle(1.2, 0xd02838, 0.95);
      stampIcon.lineBetween(stampX + 4,  stampY + 4,  stampX + 10, stampY + 11);
      stampIcon.lineBetween(stampX + 4,  stampY + 11, stampX + 10, stampY + 4);
      const stampText = this.add.text(stampX + stampW * 0.5 + 7, stampY + stampH * 0.5, 'DEFEATED', {
        fontFamily: HEADER_FONT, fontSize: '10px', color: '#e03040',
        fontStyle: 'bold',
        shadow: { offsetX: 0, offsetY: 0, color: '#600810', blur: 6, fill: true, stroke: true },
        resolution: window.GAME_DPR
      }).setOrigin(0.5);

      defeatedLayers = { bloodPool, slashes, spatter, stampBg, stampIcon, stampText };
    }

    // Add to container - ORDER MATTERS for z-layering:
    // Background layers FIRST (bottom), then all visible content on TOP
    // Silhouette aura layers sit BEHIND the demon sprite so the
    // blacked-out silhouette reads clearly against them. Silhouette
    // particles (embers) sit IN FRONT so they rise past the demon.
    // For defeated demons: blood pool under the demon, slashes and
    // spatter on top, corner stamp above everything.
    const auraLayers     = silhouetteLayers.filter(l => l._silhouette === 'aura');
    const particleLayers = silhouetteLayers.filter(l => l._silhouette === 'particle');

    const children = [rowBg, rowBorder, hitArea, shadow];
    if (defeatedLayers) {
      children.push(defeatedLayers.bloodPool);
      children.push(demon);
      children.push(defeatedLayers.slashes, defeatedLayers.spatter);
    } else {
      children.push(...auraLayers, demon, ...particleLayers);
    }
    children.push(badgeBg, badge, title);
    if (desc) children.push(desc);
    children.push(threat);
    if (catBg) children.push(catBg);
    if (cat) children.push(cat);
    if (defeatedLayers) {
      children.push(defeatedLayers.stampBg, defeatedLayers.stampIcon, defeatedLayers.stampText);
    }
    this.demonContainer.add(children);
  }

  // Deterministic 32-bit seed for per-demon defeated-state variance.
  // Accepts numeric or string issue ids (or falls back to the title).
  _defeatedSeed(issue) {
    if (typeof issue.id === 'number' && Number.isFinite(issue.id)) return Math.abs(issue.id);
    const s = String(issue.id || issue.title || issue._demonKey || '');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // =====================================================================
  // HALL FLAVOR TEXT - shuffled bag, variable timing, varied FX
  // =====================================================================
  _nextHallMessage() {
    if (!this._hallBag || this._hallBag.length === 0) {
      this._hallBag = HALL_MESSAGES.slice();
      for (let i = this._hallBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = this._hallBag[i];
        this._hallBag[i] = this._hallBag[j];
        this._hallBag[j] = tmp;
      }
    }
    return this._hallBag.pop();
  }

  _scheduleNextHallMessage(delay) {
    if (!this._hallInstruction || !this._hallInstruction.active) return;
    this.time.delayedCall(delay, () => this._cycleHallMessage());
  }

  _cycleHallMessage() {
    const t = this._hallInstruction;
    if (!t || !t.active) return;
    const effects = ['fade', 'slide-left', 'slide-right', 'rise', 'sink', 'glitch', 'dissolve', 'typewriter'];
    const entry = effects[Math.floor(Math.random() * effects.length)];
    const exit  = effects[Math.floor(Math.random() * effects.length)];
    // Organic hold: mostly 3000-5000ms, occasionally up to 6500ms
    const hold = 3000 + Math.floor(Math.random() * 2000)
               + (Math.random() < 0.15 ? Math.floor(Math.random() * 1500) : 0);

    this._hallExit(exit, () => {
      if (!t.active) return;
      t.setText(this._nextHallMessage());
      t.setPosition(this._hallBaseX, this._hallBaseY).setAlpha(0);
      this._hallEnter(entry, () => {
        this._scheduleNextHallMessage(hold);
      });
    });
  }

  _hallExit(kind, done) {
    const t = this._hallInstruction;
    if (!t || !t.active) { if (done) done(); return; }
    if (t.alpha <= 0.02) { if (done) done(); return; }
    const dur = 380 + Math.floor(Math.random() * 300);
    this.tweens.killTweensOf(t);
    switch (kind) {
      case 'slide-left':
        this.tweens.add({ targets: t, x: this._hallBaseX - 90, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
      case 'slide-right':
        this.tweens.add({ targets: t, x: this._hallBaseX + 90, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
      case 'rise':
        this.tweens.add({ targets: t, y: this._hallBaseY - 12, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
      case 'sink':
        this.tweens.add({ targets: t, y: this._hallBaseY + 10, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
      case 'glitch':
        this._hallGlitchOut(done);
        return;
      case 'dissolve':
        this._hallDissolveOut(done);
        return;
      case 'typewriter':
        this._hallTypewriterOut(done);
        return;
      case 'fade':
      default:
        this.tweens.add({ targets: t, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
    }
  }

  _hallEnter(kind, done) {
    const t = this._hallInstruction;
    if (!t || !t.active) { if (done) done(); return; }
    const dur = 520 + Math.floor(Math.random() * 380);
    switch (kind) {
      case 'slide-left':
        t.setX(this._hallBaseX + 90);
        this.tweens.add({ targets: t, x: this._hallBaseX, alpha: 1, duration: dur, ease: 'Sine.easeOut', onComplete: done });
        return;
      case 'slide-right':
        t.setX(this._hallBaseX - 90);
        this.tweens.add({ targets: t, x: this._hallBaseX, alpha: 1, duration: dur, ease: 'Sine.easeOut', onComplete: done });
        return;
      case 'rise':
        t.setY(this._hallBaseY + 12);
        this.tweens.add({ targets: t, y: this._hallBaseY, alpha: 1, duration: dur, ease: 'Sine.easeOut', onComplete: done });
        return;
      case 'sink':
        t.setY(this._hallBaseY - 10);
        this.tweens.add({ targets: t, y: this._hallBaseY, alpha: 1, duration: dur, ease: 'Sine.easeOut', onComplete: done });
        return;
      case 'glitch':
        this._hallGlitchIn(done);
        return;
      case 'dissolve':
        this._hallDissolveIn(done);
        return;
      case 'typewriter':
        this._hallTypewriterIn(done);
        return;
      case 'fade':
      default:
        this.tweens.add({ targets: t, alpha: 1, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
    }
  }

  _hallGlitchIn(done) {
    const t = this._hallInstruction;
    if (!t || !t.active) { if (done) done(); return; }
    const flickers = 5 + Math.floor(Math.random() * 3);
    let i = 0;
    const tick = () => {
      if (!t.active) return;
      i += 1;
      t.setAlpha(i % 2 === 0 ? 0.2 + Math.random() * 0.8 : 0);
      if (i >= flickers) {
        this.tweens.add({ targets: t, alpha: 1, duration: 260, onComplete: done });
        return;
      }
      this.time.delayedCall(40 + Math.random() * 60, tick);
    };
    tick();
  }

  _hallGlitchOut(done) {
    const t = this._hallInstruction;
    if (!t || !t.active) { if (done) done(); return; }
    const flickers = 4 + Math.floor(Math.random() * 3);
    let i = 0;
    const tick = () => {
      if (!t.active) return;
      i += 1;
      t.setAlpha(Math.random() < 0.5 ? 0 : 0.6 + Math.random() * 0.3);
      if (i >= flickers) {
        this.tweens.add({ targets: t, alpha: 0, duration: 220, onComplete: done });
        return;
      }
      this.time.delayedCall(35 + Math.random() * 60, tick);
    };
    tick();
  }

  _hallDissolveIn(done) {
    const t = this._hallInstruction;
    if (!t || !t.active) { if (done) done(); return; }
    let a = 0;
    const tick = () => {
      if (!t.active) return;
      a += 0.08 + Math.random() * 0.12;
      if (a >= 1) { t.setAlpha(1); if (done) done(); return; }
      t.setAlpha(Math.min(a, 1) * (0.6 + Math.random() * 0.4));
      this.time.delayedCall(32 + Math.random() * 28, tick);
    };
    tick();
  }

  _hallDissolveOut(done) {
    const t = this._hallInstruction;
    if (!t || !t.active) { if (done) done(); return; }
    let a = t.alpha;
    const tick = () => {
      if (!t.active) return;
      a -= 0.08 + Math.random() * 0.1;
      if (a <= 0) { t.setAlpha(0); if (done) done(); return; }
      t.setAlpha(a * (0.5 + Math.random() * 0.5));
      this.time.delayedCall(28 + Math.random() * 24, tick);
    };
    tick();
  }

  _hallTypewriterIn(done) {
    const t = this._hallInstruction;
    if (!t || !t.active) { if (done) done(); return; }
    const full = t.text;
    t.setAlpha(1);
    t.setText('');
    let i = 0;
    const step = () => {
      if (!t.active) return;
      i += 1;
      t.setText(full.slice(0, i));
      if (i >= full.length) { if (done) done(); return; }
      this.time.delayedCall(16 + Math.random() * 16, step);
    };
    step();
  }

  _hallTypewriterOut(done) {
    const t = this._hallInstruction;
    if (!t || !t.active) { if (done) done(); return; }
    let cur = t.text;
    const step = () => {
      if (!t.active) return;
      if (cur.length === 0) { if (done) done(); return; }
      cur = cur.slice(0, -1);
      t.setText(cur);
      this.time.delayedCall(12 + Math.random() * 12, step);
    };
    step();
  }

  // =====================================================================
  // DUNGEON CLEARED OVERLAY (shown when all demons defeated)
  // =====================================================================
  // =====================================================================
  //  THE HALL GROWS STILL - final victory sequence
  //  Four phases: dim, reckon, tally, choose. Dark, restrained, terse.
  //  No gold confetti, no "YOU WIN", no triumph. You endured, and the
  //  thirteen are still.
  // =====================================================================
  _showDungeonClearedOverlay(allIssues) {
    const W = 800, H = 600;
    const cx = W / 2;

    // Freeze scroll so nothing moves while the sequence plays
    this.scrollVelocity = 0;
    this.targetScrollOffset = this.scrollOffset;

    // ------------------------------------------------------------------
    // Gather the spoils of the quest
    // ------------------------------------------------------------------
    const defeated = allIssues.filter(i => i.defeated || i.fixed);
    const tierCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    let totalXP = 0;
    for (const iss of defeated) {
      tierCount[iss.severity] = (tierCount[iss.severity] || 0) + 1;
      totalXP += (Number(iss.hp) || 0) * 10;
    }
    const total = defeated.length;

    // Quest time in mm:ss - visibility-aware accumulation. Excludes any
    // wall-clock time where the tab was hidden (Alt-Tab, minimize, etc.).
    let activeMs = this.game._questActiveMs || 0;
    if (this.game._questVisibleSince) {
      activeMs += Math.max(0, Date.now() - this.game._questVisibleSince);
    }
    const elapsed = activeMs;
    const mm = Math.floor(elapsed / 60000);
    const ss = Math.floor((elapsed % 60000) / 1000);
    const timeStr = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    // Name awarded - terse, gothic, scaled by total XP (not demon count)
    const name = totalXP >= 3000 ? 'THE UNDYING'
               : totalXP >= 1500 ? 'THE CLEANSER'
               : totalXP >=  500 ? 'THE WARDEN'
                                 : 'THE TRESPASSER';

    // ------------------------------------------------------------------
    // PHASE 1 - the hall grows still (1.5s)
    // A slow veil drops over the hall. The corpses remain visible beneath
    // but washed of colour. No text yet.
    // ------------------------------------------------------------------
    const backdrop = this.add.rectangle(cx, H / 2, W, H, 0x000000, 0).setDepth(500);
    this.tweens.add({ targets: backdrop, alpha: 0.78, duration: 1400, ease: 'Sine.easeIn' });
    SFX.play('doorOpen');

    // A single long drone beat - use summoningPulse to fake a bell
    this.time.delayedCall(400, () => SFX.play('summoningPulse'));
    this.time.delayedCall(1400, () => SFX.play('summoningPulse'));

    // Golden dust motes drifting up from the base of the screen - very
    // sparse, very slow. Not celebration - aftermath.
    for (let i = 0; i < 22; i++) {
      this.time.delayedCall(200 + i * 80, () => {
        const mx = 60 + Math.random() * (W - 120);
        const my = H - 20 + Math.random() * 10;
        const mote = this.add.circle(mx, my, 1 + Math.random() * 1.5, 0xc8a050, 0.55).setDepth(501);
        this.tweens.add({
          targets: mote,
          y: my - (80 + Math.random() * 260),
          x: mx + (Math.random() - 0.5) * 30,
          alpha: 0,
          duration: 4200 + Math.random() * 2000,
          ease: 'Sine.easeOut',
          onComplete: () => mote.destroy(),
        });
      });
    }

    // ------------------------------------------------------------------
    // PHASE 2 - the reckoning (title + subtitle, 2.5s window)
    // Type-in title, no Back.easeOut scale-punch. Just fades, held.
    // ------------------------------------------------------------------
    const titleY = 150;
    const titleText = 'THE HALL IS STILL';
    const title = this.add.text(cx, titleY, '', {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '22px',
      color: '#d4c8b8', letterSpacing: 4,
      shadow: { offsetX: 0, offsetY: 0, color: '#3a1a10', blur: 14, fill: true },
      resolution: window.GAME_DPR,
    }).setOrigin(0.5).setAlpha(0).setDepth(502);

    this.time.delayedCall(1200, () => {
      title.setAlpha(1);
      let i = 0;
      const step = () => {
        if (!title.active) return;
        i += 1;
        title.setText(titleText.slice(0, i));
        if (i < titleText.length) this.time.delayedCall(55, step);
      };
      step();
    });

    const sub = this.add.text(cx, titleY + 34, '', {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '12px',
      color: '#8a7060', letterSpacing: 2,
      resolution: window.GAME_DPR,
    }).setOrigin(0.5).setAlpha(0).setDepth(502);
    this.time.delayedCall(2600, () => {
      sub.setText(`Thirteen shapes undone.   Breath, ended.`);
      this.tweens.add({ targets: sub, alpha: 1, duration: 700 });
    });

    // ------------------------------------------------------------------
    // PHASE 3 - the chronicle (stat tally, ~4s in)
    // Parchment-style ledger. Right-aligned values with dot leaders.
    // ------------------------------------------------------------------
    const ledgerY = 240;
    const ledgerLines = [
      ['DEMONS PUT DOWN',   String(total)],
      ['  CRITICAL',        String(tierCount.critical || 0)],
      ['  HIGH',            String(tierCount.high || 0)],
      ['  MEDIUM',          String(tierCount.medium || 0)],
      ['  LOW',             String(tierCount.low || 0)],
      ['  INFO',            String(tierCount.info || 0)],
      ['',                  ''],  // spacer
      ['EXPERIENCE',        String(totalXP)],
      ['TIME IN THE DARK',  timeStr],
    ];
    const makeLedgerLine = (label, value, y, delay) => {
      if (!label && !value) return null;
      const dots = '.'.repeat(Math.max(3, 44 - label.length - value.length));
      const line = this.add.text(cx, y, `${label} ${dots} ${value}`, {
        fontFamily: '"JetBrains Mono", monospace', fontSize: '12px',
        color: '#b8a890', letterSpacing: 1,
        resolution: window.GAME_DPR,
      }).setOrigin(0.5).setAlpha(0).setDepth(502);
      this.tweens.add({ targets: line, alpha: 1, duration: 420, delay });
      return line;
    };
    const ledgerDelay = 3800;
    ledgerLines.forEach((l, idx) => {
      makeLedgerLine(l[0], l[1], ledgerY + idx * 18, ledgerDelay + idx * 120);
    });

    // The name awarded - separate, emphasized. Blood-red label, pale name.
    const nameLabelY = ledgerY + ledgerLines.length * 18 + 24;
    const nameLabel = this.add.text(cx, nameLabelY, 'WHAT YOU ARE CALLED NOW', {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '10px',
      color: '#8a4050', letterSpacing: 3,
      resolution: window.GAME_DPR,
    }).setOrigin(0.5).setAlpha(0).setDepth(502);
    const nameValue = this.add.text(cx, nameLabelY + 22, name, {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '18px',
      color: '#d4c8b8', fontStyle: 'bold', letterSpacing: 4,
      shadow: { offsetX: 0, offsetY: 0, color: '#5a1020', blur: 10, fill: true },
      resolution: window.GAME_DPR,
    }).setOrigin(0.5).setAlpha(0).setDepth(502);
    const nameDelay = ledgerDelay + ledgerLines.length * 120 + 300;
    this.tweens.add({ targets: nameLabel, alpha: 1, duration: 600, delay: nameDelay });
    this.tweens.add({ targets: nameValue, alpha: 1, duration: 800, delay: nameDelay + 200 });
    this.time.delayedCall(nameDelay + 200, () => SFX.play('xpGain'));

    // ------------------------------------------------------------------
    // PHASE 4 - the choice (two restrained cards at the bottom)
    //   SEEK ANOTHER   |   REMAIN
    // No pulse, no glow. Bone-white text on charcoal. They wait.
    // ------------------------------------------------------------------
    const choiceDelay = nameDelay + 1200;
    const btnY = 510;

    const leftCard  = this._buildFinalCard(cx - 130, btnY, 220, 44, 'SEEK ANOTHER',     'Begin a new hunt.');
    const rightCard = this._buildFinalCard(cx + 130, btnY, 220, 44, 'REMAIN',           'Walk among the dead.');

    [...leftCard.all, ...rightCard.all].forEach((el) => el.setAlpha(0).setDepth(504));
    this.tweens.add({
      targets: [...leftCard.all, ...rightCard.all],
      alpha: 1,
      duration: 900,
      delay: choiceDelay,
      ease: 'Sine.easeOut',
    });

    // Left - SEEK ANOTHER: wipe quest state, back to splash for new audit
    const doSeek = () => {
      SFX.play('menuConfirm');
      // Clear quest persistence so the new audit starts fresh
      this.game._questStartMs = null;
      this.game._questActiveMs = 0;
      this.game._questVisibleSince = null;
      this.cameras.main.fadeOut(900, 0, 0, 0);
      this.time.delayedCall(900, () => {
        if (typeof window.returnToTitle === 'function') window.returnToTitle();
      });
    };
    leftCard.hit.on('pointerdown', doSeek);

    // Right - REMAIN: fade out the overlay but leave a small
    // "LEAVE THE HALL" escape in the top-right so they aren't trapped.
    const doRemain = () => {
      SFX.play('menuHover');
      this.tweens.add({
        targets: [backdrop, title, sub, nameLabel, nameValue,
                  ...leftCard.all, ...rightCard.all,
                  ...this.children.list.filter((c) => c.depth === 502 && c.type === 'Text')],
        alpha: 0,
        duration: 700,
        onComplete: () => {
          backdrop.destroy();
          title.destroy();
          sub.destroy();
          nameLabel.destroy();
          nameValue.destroy();
          [...leftCard.all, ...rightCard.all].forEach((el) => el.destroy && el.destroy());
          this._addLingerEscape();
        },
      });
    };
    rightCard.hit.on('pointerdown', doRemain);
  }

  /**
   * Build one of the two final-choice cards. Returns the set of visual
   * pieces plus the hit-rect so the caller can wire pointer events.
   */
  _buildFinalCard(cx, cy, w, h, label, hint) {
    const bg = this.add.rectangle(cx, cy, w, h, 0x0a0a12, 0.92).setDepth(503);
    bg.setStrokeStyle(1, 0x4a3a30, 0.9);
    const text = this.add.text(cx, cy - 5, label, {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '13px',
      color: '#c8b8a0', letterSpacing: 3, fontStyle: 'bold',
      resolution: window.GAME_DPR,
    }).setOrigin(0.5).setDepth(504);
    const hintText = this.add.text(cx, cy + 11, hint, {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '9px',
      color: '#6a5a50', letterSpacing: 1,
      resolution: window.GAME_DPR,
    }).setOrigin(0.5).setDepth(504);
    const hit = this.add.rectangle(cx, cy, w, h, 0x000000, 0).setInteractive({ useHandCursor: true }).setDepth(505);
    hit.on('pointerover', () => {
      text.setColor('#e8d8c0');
      bg.setStrokeStyle(1.5, 0x8a1020, 0.9);
    });
    hit.on('pointerout', () => {
      text.setColor('#c8b8a0');
      bg.setStrokeStyle(1, 0x4a3a30, 0.9);
    });
    return { bg, text, hintText, hit, all: [bg, text, hintText, hit] };
  }

  /**
   * After REMAIN is clicked, drop a small "LEAVE THE HALL" link in the
   * top-right. The user can walk among the corpses as long as they
   * want, and take this out when they're ready.
   */
  _addLingerEscape() {
    const link = this.add.text(780, 20, 'LEAVE THE HALL', {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '10px',
      color: '#6a5a50', letterSpacing: 2,
      resolution: window.GAME_DPR,
    }).setOrigin(1, 0).setDepth(510).setAlpha(0).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: link, alpha: 1, duration: 800, delay: 300 });
    link.on('pointerover', () => link.setColor('#c8b8a0'));
    link.on('pointerout',  () => link.setColor('#6a5a50'));
    link.on('pointerdown', () => {
      SFX.play('menuConfirm');
      this.game._questStartMs = null;
      this.game._questActiveMs = 0;
      this.game._questVisibleSince = null;
      this.cameras.main.fadeOut(700, 0, 0, 0);
      this.time.delayedCall(700, () => {
        if (typeof window.returnToTitle === 'function') window.returnToTitle();
      });
    });
  }

  // =====================================================================
  // SILHOUETTE + POWER-LEVEL EFFECTS
  // Undefeated demons are blacked out. Each severity tier gets an
  // escalating treatment: nothing for info, a faint aura for low, a
  // pulsing aura for medium, rising embers + aura for high, and a full
  // swirling aura + embers for critical. Each tier has 3 variants keyed
  // off the issue id so the same demon always looks the same on refresh
  // but different demons in the same tier differ.
  // =====================================================================
  _applySilhouetteEffects(demon, issue, x, y, layerSink) {
    const tier = issue.severity || 'medium';
    const variant = this._silhouetteVariant(issue);

    // Color palettes per tier × variant (tasteful, not candy)
    const palette = {
      info:     [0x1a0a20, 0x200a1a, 0x101020],                        // barely there
      low:      [0x3a1a40, 0x40202a, 0x2a1a3a],                        // dim purple-red
      medium:   [0x5a1a20, 0x3a1a4a, 0x4a2a1a],                        // red / purple / ember
      high:     [0x7a1a20, 0x5a2060, 0x7a4020],                        // strong red / violet / amber
      critical: [0xa01a20, 0x7a20a0, 0xb04020],                        // crimson / royal / volcanic
    }[tier];
    const auraColor = palette[variant];

    // Aura strength per tier
    const auraSize   = { info: 0,    low: 30, medium: 40, high: 52, critical: 68 }[tier];
    const auraAlpha  = { info: 0,    low: 0.14, medium: 0.20, high: 0.26, critical: 0.34 }[tier];
    const emberCount = { info: 0,    low: 0,    medium: 1,   high: 2,    critical: 4    }[tier];
    const pulseDur   = { info: 1600, low: 1400, medium: 1200, high: 1000, critical: 900 }[tier];

    // Aura layer (goes behind the demon). Skip entirely for info - pure
    // black silhouette is enough at that tier.
    if (auraSize > 0) {
      const aura = this.add.circle(x, y, auraSize, auraColor, auraAlpha);
      aura.setBlendMode(Phaser.BlendModes.ADD);
      aura._silhouette = 'aura';
      this.tweens.add({
        targets: aura,
        scale: { from: 0.85, to: 1.15 },
        alpha: { from: auraAlpha * 0.55, to: auraAlpha },
        duration: pulseDur + variant * 140,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: variant * 200,
      });
      layerSink.push(aura);

      // Critical gets a second, larger, slower aura halo for extra presence
      if (tier === 'critical') {
        const halo = this.add.circle(x, y, auraSize + 24, auraColor, auraAlpha * 0.45);
        halo.setBlendMode(Phaser.BlendModes.ADD);
        halo._silhouette = 'aura';
        this.tweens.add({
          targets: halo,
          scale: { from: 0.9, to: 1.25 },
          alpha: { from: auraAlpha * 0.2, to: auraAlpha * 0.5 },
          duration: 1600,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          delay: 400,
        });
        layerSink.push(halo);
      }
    }

    // Rising ember particles (sits in front of the demon, drifts upward)
    for (let i = 0; i < emberCount; i++) {
      this._spawnSilhouetteEmber(x, y, auraColor, i, emberCount, layerSink);
    }
  }

  _silhouetteVariant(issue) {
    const id = Number(issue.id) || 0;
    return Math.abs(id * 2654435761) % 3;
  }

  _spawnSilhouetteEmber(x, y, color, index, total, layerSink) {
    const spread = 18;
    const startX = x + (Math.random() - 0.5) * spread;
    const startY = y + 14 + (Math.random() - 0.5) * 4;
    const size = 1.2 + Math.random() * 0.9;
    const ember = this.add.circle(startX, startY, size, color, 0.85);
    ember.setBlendMode(Phaser.BlendModes.ADD);
    ember._silhouette = 'particle';
    layerSink.push(ember);

    const rise = () => {
      if (!ember.active) return;
      const driftX = startX + (Math.random() - 0.5) * 14;
      const riseY  = startY - (24 + Math.random() * 22);
      const dur    = 1800 + Math.random() * 900;
      ember.setPosition(startX, startY);
      ember.setAlpha(0.85);
      ember.setScale(1);
      this.tweens.add({
        targets: ember,
        x: driftX,
        y: riseY,
        alpha: 0,
        scale: 0.5,
        duration: dur,
        delay: (index / Math.max(total, 1)) * 400 + Math.random() * 200,
        ease: 'Sine.easeOut',
        onComplete: rise,
      });
    };
    rise();
  }

  // =====================================================================
  // SHADOW BURST PARTICLES (materialization effect)
  // =====================================================================
  createShadowBurst(x, y) {
    const particleCount = 10;
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const dist = 18 + Math.random() * 12;
      const p = this.add.circle(x, y, 2 + Math.random() * 2, 0x6040a0, 0.8);
      this.demonContainer.add(p);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: 500 + Math.random() * 300,
        ease: 'Power2',
        onComplete: () => p.destroy()
      });
    }

    // Central flash
    const flash = this.add.circle(x, y, 10, 0xa070e0, 0.6);
    this.demonContainer.add(flash);
    this.tweens.add({
      targets: flash,
      scaleX: 2.5, scaleY: 2.5,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => flash.destroy()
    });
  }
}
