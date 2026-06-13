import { COLORS, FONTS } from '../utils/colors.js';
import { bridge } from '../utils/ws.js';
import { DESCENT_MESSAGES, TICKER_IDLE_MESSAGES, TICKER_FAILURE_MESSAGES, LEDGER_FAILURE_MESSAGES } from '../utils/flavor-text.js';
import { SFX } from '../utils/sound-manager.js';
import { getProfileKey, getSelectedRuntime } from '../profile-config.js';

/**
 * Summoning scene - Castlevania-style side-scroller.
 * Knight runs RIGHT through a torchlit stone corridor while the audit runs.
 * Parallax scrolling: far wall, main wall with torch brackets, cobblestone floor.
 * Transitions to DungeonHall once audit completes.
 */
export class SummoningScene extends Phaser.Scene {
  constructor() {
    super('Summoning');
  }

  init(data) {
    this.domain = data.domain;
    this.projectPath = data.projectPath;
  }

  create() {
    const dpr = this.game.dpr || window.GAME_DPR;
    this.cameras.main.setZoom(dpr);
    this.cameras.main.scrollX = 400 * (1 - dpr);
    this.cameras.main.scrollY = 300 * (1 - dpr);

    const W = 800;
    const H = 600;
    const cx = W / 2;

    this.cameras.main.setBackgroundColor(0x05050f);
    this.cameras.main.fadeIn(800, 0, 0, 0);

    // Scroll speeds (pixels per second) - leftward
    this.farWallSpeed = 60;
    this.mainWallSpeed = 120;
    this.floorSpeed = 170;

    // ── Far Wall (darkest, slowest parallax layer) ─────────────
    this._generateFarWallTexture();
    this.farWallTile = this.add.tileSprite(0, 0, W, 440, 'farwall_tile')
      .setOrigin(0, 0)
      .setDepth(0);

    // ── Main Wall with Torch Brackets ──────────────────────────
    this._generateMainWallTexture();
    this.mainWallTile = this.add.tileSprite(0, 0, W, 440, 'mainwall_tile')
      .setOrigin(0, 0)
      .setDepth(1);

    // ── Stone Floor (fastest scroll, cobblestone) ──────────────
    this._generateFloorTexture();
    this.floorTile = this.add.tileSprite(0, 440, W, 160, 'floor_tile')
      .setOrigin(0, 0)
      .setDepth(2);

    // Floor top edge - dark line separating wall from floor
    const floorEdge = this.add.graphics().setDepth(3);
    floorEdge.fillStyle(0x000000, 0.7);
    floorEdge.fillRect(0, 438, W, 4);
    floorEdge.fillStyle(0x1a1a0e, 0.5);
    floorEdge.fillRect(0, 436, W, 2);

    // Torch glows removed - torches are baked into the wall tile

    // ── Embers drifting LEFT and UP ────────────────────────────
    this._createEmbers(W, H);

    // ── Dust Motes ─────────────────────────────────────────────
    this._createDustMotes(W, H);

    // ── Character (centered, faces right, running) ──────────────
    // Floor edge is at Y=440. Use runGroundY (actual pixel-scanned foot position
    // in the run sprite) to place feet exactly on the floor line.
    const cfg = this.game.characterConfig;
    const scale = 2.5;
    const floorY = 438;
    const feetY = cfg.runGroundY || cfg.groundY;
    const originY = feetY / cfg.frameH;
    this.knight = this.add.sprite(300, floorY, 'char_run')
      .setOrigin(0.5, originY)
      .setScale(scale)
      .setDepth(10)
      .play('char_run_anim');

    // ── Title Text ─────────────────────────────────────────────
    const titleText = this.add.text(cx, 38, 'DESCENDING INTO THE DUNGEON', {
      fontFamily: '"JetBrains Mono", monospace',
      fontStyle: '600',
      fontSize: '22px',
      color: '#d4af37',
      letterSpacing: 6,
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setAlpha(0).setDepth(55);

    this.tweens.add({
      targets: titleText,
      alpha: 1,
      duration: 1500,
      ease: 'Sine.easeIn'
    });

    // Subtle gold glow underneath title
    const titleGlow = this.add.text(cx, 38, 'DESCENDING INTO THE DUNGEON', {
      fontFamily: '"JetBrains Mono", monospace',
      fontStyle: '600',
      fontSize: '22px',
      color: '#ff9900',
      letterSpacing: 6,
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(54);

    this.tweens.add({
      targets: titleGlow,
      alpha: { from: 0, to: 0.25 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // ── Domain Name Display ────────────────────────────────────
    const domainText = this.add.text(cx, 70, this.domain, {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '16px',
      color: '#88bbff',
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(55);

    this.tweens.add({
      targets: domainText,
      alpha: { from: 0.7, to: 1 },
      duration: 2000,
      yoyo: true,
      repeat: -1
    });

    // ── Status Message ─────────────────────────────────────────
    this.messageText = this.add.text(cx, 470, DESCENT_MESSAGES[0], {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '15px',
      color: '#66cccc',
      letterSpacing: 1,
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(55);

    this.messageGlow = this.add.text(cx, 470, DESCENT_MESSAGES[0], {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '15px',
      color: '#44aaaa',
      letterSpacing: 1,
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(54).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD);

    // ── Stream / Activity Ticker (single-line, typewriter, queued) ────
    // Width is constrained; messages are truncated to fit one line.
    // A queue processes messages sequentially with type-in / hold / type-out.
    this.streamText = this.add.text(cx, 495, '', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
      color: '#9a88cc',
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(55).setAlpha(0.95);

    // Blinking cursor that follows the ticker text
    this.streamCursor = this.add.text(cx, 495, '\u2583', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
      color: '#d4af37',
      resolution: window.GAME_DPR
    }).setOrigin(0, 0.5).setDepth(56).setAlpha(0);

    // Ticker queue state
    this._tickerQueue = [];
    this._tickerBusy = false;
    this._tickerCurrent = '';

    // Blink the cursor always (low opacity when idle, full when typing)
    this.tweens.add({
      targets: this.streamCursor,
      alpha: { from: 0.25, to: 0.9 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // ── Demon Counter ──────────────────────────────────────────
    this.demonCounter = this.add.text(cx, 516, '', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
      color: '#cc4444',
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(55);

    // ── Log area ───────────────────────────────────────────────
    this.logTexts = [];
    this.logY = 535;

    // ── Progress Bar ───────────────────────────────────────────
    this._createProgressBar(cx);

    // ── Vignette Overlay ───────────────────────────────────────
    this._drawVignette(W, H);

    // ── Atmospheric Messages - shuffled bag, organic pacing, varied FX ──
    this.flavorMessages = DESCENT_MESSAGES;
    this._flavorBag = [];         // refilled & reshuffled when empty
    this._flavorBaseX = cx;       // remember center for transitions
    this._flavorBaseY = 470;
    this._scheduleNextFlavorMessage(1800); // first transition in 1.8s

    // ── Abandon Scroll (cancel audit and return to title) ──────
    this._createAbandonScroll(W);

    // Track stream activity
    this.streamChunks = 0;
    // Flag flips true when the first real stream chunk arrives, halting
    // the idle gothic-phrase rotation below.
    this._tickerStreamed = false;
    // Start a gothic idle rotation until real stream data arrives
    this._scheduleIdleTickerMessage(900);

    // Start audit
    this.runAudit();
  }

  _scheduleIdleTickerMessage(delay) {
    this.time.delayedCall(delay, () => this._playIdleTickerMessage());
  }

  _playIdleTickerMessage() {
    // Stop once real stream data takes over
    if (this._tickerStreamed) return;
    if (!this.streamText || !this.streamText.active) return;
    // Don't trample any real message that might already be in flight
    if (this._tickerBusy || this._tickerQueue.length > 0) {
      this._scheduleIdleTickerMessage(1200);
      return;
    }
    const pick = TICKER_IDLE_MESSAGES[Math.floor(Math.random() * TICKER_IDLE_MESSAGES.length)];
    this._enqueueTickerMessage(pick);
    // Vary the cadence organically
    const next = 2400 + Math.floor(Math.random() * 1800);
    this._scheduleIdleTickerMessage(next);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEXTURE GENERATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Seeded pseudo-random for consistent tile generation.
   */
  _seededRand(seed) {
    let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  /**
   * Far wall - very dark, subtle bricks, no detail. Provides depth behind main wall.
   */
  _generateFarWallTexture() {
    const TW = 400;
    const TH = 440;
    const g = this.make.graphics({ add: false });

    // Very dark base
    g.fillStyle(0x08081a, 1);
    g.fillRect(0, 0, TW, TH);

    const brickW = 48;
    const brickH = 24;
    const rows = Math.ceil(TH / brickH) + 1;
    const cols = Math.ceil(TW / brickW) + 1;

    for (let row = 0; row < rows; row++) {
      const offset = (row % 2) * (brickW / 2);
      for (let col = -1; col < cols; col++) {
        const bx = col * brickW + offset;
        const by = row * brickH;
        if (by >= TH) continue;

        const seed = row * 100 + col;
        const variation = Math.floor((this._seededRand(seed) - 0.5) * 4);
        const base = 0x0a + variation;
        const finalColor = (Math.max(4, base) << 16) | (Math.max(4, base) << 8) | Math.max(8, base + 6);

        g.fillStyle(finalColor, 0.6);
        g.fillRect(bx + 1, by + 1, brickW - 2, brickH - 2);

        // Mortar
        g.fillStyle(0x040410, 0.5);
        g.fillRect(bx, by, brickW, 1);
        g.fillRect(bx, by, 1, brickH);
      }
    }

    g.generateTexture('farwall_tile', TW, TH);
    g.destroy();
  }

  /**
   * Main wall - stone bricks with torch brackets baked in every ~180px.
   * 400px wide tile, torches at x=90 and x=270 (so every 180px when tiled).
   */
  _generateMainWallTexture() {
    const TW = 400;
    const TH = 440;
    const g = this.make.graphics({ add: false });

    // Base dark fill
    g.fillStyle(0x0e0e1c, 1);
    g.fillRect(0, 0, TW, TH);

    // Draw stone bricks
    const brickW = 64;
    const brickH = 32;
    const rows = Math.ceil(TH / brickH) + 1;
    const cols = Math.ceil(TW / brickW) + 1;

    const brickColors = [0x0e0e1c, 0x121228, 0x161630];

    for (let row = 0; row < rows; row++) {
      const offset = (row % 2) * (brickW / 2);
      for (let col = -1; col < cols; col++) {
        const bx = col * brickW + offset;
        const by = row * brickH;
        if (by >= TH) continue;

        const seed = row * 100 + col;
        const baseColor = brickColors[Math.floor(this._seededRand(seed) * 3)];

        const br = ((baseColor >> 16) & 0xff) + Math.floor((this._seededRand(seed + 1) - 0.5) * 6);
        const bg = ((baseColor >> 8) & 0xff) + Math.floor((this._seededRand(seed + 2) - 0.5) * 6);
        const bb = (baseColor & 0xff) + Math.floor((this._seededRand(seed + 3) - 0.5) * 8);
        const finalColor = (Math.max(0, br) << 16) | (Math.max(0, bg) << 8) | Math.max(0, bb);

        g.fillStyle(finalColor, 0.95);
        g.fillRect(bx + 1, by + 1, brickW - 2, brickH - 2);

        // Mortar
        g.fillStyle(0x060610, 0.9);
        g.fillRect(bx, by, brickW, 1);
        g.fillRect(bx, by, 1, brickH);

        // Highlight
        g.fillStyle(0x1e1e38, 0.35);
        g.fillRect(bx + 2, by + 2, brickW - 4, 1);
        g.fillRect(bx + 2, by + 2, 1, brickH - 4);

        // Random imperfections
        if (this._seededRand(seed + 10) < 0.15) {
          g.fillStyle(0x08080e, 0.5);
          const dx = 4 + Math.floor(this._seededRand(seed + 11) * (brickW - 14));
          const dy = 4 + Math.floor(this._seededRand(seed + 12) * (brickH - 14));
          const dw = 3 + Math.floor(this._seededRand(seed + 13) * 6);
          const dh = 2 + Math.floor(this._seededRand(seed + 14) * 3);
          g.fillRect(bx + dx, by + dy, dw, dh);
        }
      }
    }

    // Bake torch brackets into the wall at x=90 and x=270 (every ~180px)
    const torchXPositions = [90, 270];
    const torchY = 240; // wall-height for brackets

    torchXPositions.forEach((tx) => {
      // Iron mounting plate
      g.fillStyle(0x2a2018, 1);
      g.fillRect(tx - 6, torchY + 10, 12, 22);
      g.fillStyle(0x3a3028, 1);
      g.fillRect(tx - 5, torchY + 11, 10, 20);

      // Bracket arm extending outward
      g.fillStyle(0x3a3028, 1);
      g.fillRect(tx - 3, torchY + 6, 6, 6);

      // Cup/holder at top
      g.fillStyle(0x4a3828, 1);
      g.fillRect(tx - 7, torchY + 2, 14, 6);
      g.fillStyle(0x3a2818, 1);
      g.fillRect(tx - 6, torchY + 3, 12, 4);

      // Mounting bolts
      g.fillStyle(0x606050, 1);
      g.fillRect(tx - 4, torchY + 14, 2, 2);
      g.fillRect(tx + 2, torchY + 14, 2, 2);

      // Flame shape baked into tile (orange/yellow)
      // Outer flame glow
      g.fillStyle(0xff4400, 0.15);
      g.fillEllipse(tx, torchY - 8, 18, 22);

      // Mid flame
      g.fillStyle(0xff8822, 0.3);
      g.fillEllipse(tx, torchY - 10, 11, 15);

      // Inner bright core
      g.fillStyle(0xffcc44, 0.5);
      g.fillEllipse(tx, torchY - 8, 6, 9);

      // Tip
      g.fillStyle(0xffee88, 0.4);
      g.fillEllipse(tx, torchY - 16, 3, 6);

      // Warm light cast on nearby wall bricks
      g.fillStyle(0xff6622, 0.04);
      g.fillCircle(tx, torchY - 4, 60);
      g.fillStyle(0xff8833, 0.03);
      g.fillCircle(tx, torchY - 4, 40);
    });

    g.generateTexture('mainwall_tile', TW, TH);
    g.destroy();
  }

  /**
   * Floor texture - dark cobblestone, horizontally tileable.
   */
  _generateFloorTexture() {
    const TW = 400;
    const TH = 160;
    const g = this.make.graphics({ add: false });

    // Dark base
    g.fillStyle(0x0c0c0a, 1);
    g.fillRect(0, 0, TW, TH);

    // Cobblestones - irregular rounded rectangles
    const stoneW = 40;
    const stoneH = 36;
    const rows = Math.ceil(TH / stoneH) + 1;
    const cols = Math.ceil(TW / stoneW) + 1;

    for (let row = 0; row < rows; row++) {
      const offset = (row % 2) * (stoneW / 2);
      for (let col = -1; col < cols; col++) {
        const seed = row * 50 + col + 7777;
        const bx = col * stoneW + offset + Math.floor((this._seededRand(seed + 5) - 0.5) * 6);
        const by = row * stoneH + Math.floor((this._seededRand(seed + 6) - 0.5) * 4);
        if (by >= TH) continue;

        const variation = Math.floor(this._seededRand(seed) * 6);
        const base = 0x10 + variation;
        const finalColor = (base << 16) | (base << 8) | (base - 2);

        // Stone face
        g.fillStyle(finalColor, 0.9);
        g.fillRect(bx + 2, by + 2, stoneW - 4, stoneH - 4);

        // Dark gap between stones
        g.fillStyle(0x060604, 0.8);
        g.fillRect(bx, by, stoneW, 2);
        g.fillRect(bx, by, 2, stoneH);

        // Subtle top highlight
        g.fillStyle(0x1e1e1a, 0.25);
        g.fillRect(bx + 3, by + 3, stoneW - 6, 1);

        // Wear marks
        if (this._seededRand(seed + 20) < 0.2) {
          g.fillStyle(0x080806, 0.4);
          const dx = 5 + Math.floor(this._seededRand(seed + 21) * (stoneW - 12));
          const dy = 5 + Math.floor(this._seededRand(seed + 22) * (stoneH - 12));
          g.fillRect(bx + dx, by + dy, 4, 2);
        }
      }
    }

    // Top edge of floor - slightly lighter line for definition
    g.fillStyle(0x1a1a14, 0.6);
    g.fillRect(0, 0, TW, 2);

    g.generateTexture('floor_tile', TW, TH);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════════
  // VISUAL HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Torch glow circles at fixed screen positions that pulse.
   * Placed at wall-height (y: ~250), spaced across the screen.
   * Since the wall scrolls behind them, it creates the illusion of passing torches.
   */
  _createTorchGlows(W) {
    const glowPositions = [
      { x: 160, y: 250 },
      { x: 450, y: 250 },
      { x: 740, y: 250 },
    ];

    glowPositions.forEach((pos, idx) => {
      const glowOuter = this.add.circle(pos.x, pos.y, 90, 0xff6622, 0.04).setDepth(4);
      const glowMid = this.add.circle(pos.x, pos.y, 55, 0xff8833, 0.06).setDepth(4);
      const glowInner = this.add.circle(pos.x, pos.y, 28, 0xffaa44, 0.1).setDepth(4);

      [glowOuter, glowMid, glowInner].forEach((glow, gi) => {
        this.tweens.add({
          targets: glow,
          alpha: glow.alpha * 1.8,
          scaleX: { from: 0.85, to: 1.2 },
          scaleY: { from: 0.85, to: 1.2 },
          duration: 350 + idx * 90 + gi * 70,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      });
    });
  }

  /**
   * Embers drift LEFT and UP - matching the side-scroll direction.
   */
  _createEmbers(W, H) {
    for (let i = 0; i < 30; i++) {
      const startX = Phaser.Math.Between(0, W + 100);
      const startY = Phaser.Math.Between(200, H - 50);
      const size = Phaser.Math.FloatBetween(1, 1.5);
      const isRed = Phaser.Math.Between(0, 2) === 0;
      const color = isRed ? 0xff3322 : 0xf08020;
      const ember = this.add.circle(startX, startY, size, color, 0.7).setDepth(15);

      this.tweens.add({
        targets: ember,
        x: startX - Phaser.Math.Between(200, 500),
        y: startY - Phaser.Math.Between(60, 200),
        alpha: 0,
        scaleX: { from: 1, to: 0.3 },
        scaleY: { from: 1, to: 0.3 },
        duration: Phaser.Math.Between(2500, 5500),
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000),
        ease: 'Sine.easeOut',
        onRepeat: (tween, target) => {
          target.x = Phaser.Math.Between(W, W + 200);
          target.y = Phaser.Math.Between(200, H - 50);
          target.alpha = 0.7;
        }
      });
    }
  }

  /**
   * Dust motes - slow gentle drift.
   */
  _createDustMotes(W, H) {
    for (let i = 0; i < 15; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(80, 420);
      const mote = this.add.circle(x, y, 0.5, 0x888888, 0.15).setDepth(12);

      this.tweens.add({
        targets: mote,
        x: x + Phaser.Math.Between(-80, -20),
        y: y + Phaser.Math.Between(-25, 25),
        alpha: { from: 0.05, to: 0.2 },
        duration: Phaser.Math.Between(5000, 9000),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        ease: 'Sine.easeInOut'
      });
    }
  }

  /**
   * Progress bar at bottom - dark track, blue-to-gold gradient fill, shimmer, centered percentage.
   */
  _createProgressBar(cx) {
    const barY = 570;
    const barW = 600;
    const barH = 18;
    const barX = cx - barW / 2;

    // Outer border
    const frame = this.add.graphics().setDepth(55);
    frame.fillStyle(0x2a2a3a, 1);
    frame.fillRoundedRect(barX - 4, barY - barH / 2 - 4, barW + 8, barH + 8, 4);
    frame.lineStyle(1, 0x3a3a50, 0.6);
    frame.strokeRoundedRect(barX - 4, barY - barH / 2 - 4, barW + 8, barH + 8, 4);

    // Inner track (dark recessed)
    frame.fillStyle(0x0a0a14, 1);
    frame.fillRoundedRect(barX, barY - barH / 2, barW, barH, 2);

    // Progress fill graphics
    this.progressGfx = this.add.graphics().setDepth(56);
    this.progressBarConfig = { x: barX, y: barY, w: barW, h: barH };
    this.progressValue = 0;

    // Shimmer position tracker
    this.shimmerX = 0;

    // Percentage text centered on bar
    this.progressPctText = this.add.text(cx, barY, '0%', {
      fontFamily: '"JetBrains Mono", monospace',
      fontStyle: 'bold',
      fontSize: '14px',
      color: '#ffffff',
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(58).setAlpha(0.9);
  }

  _drawProgressFill(pct) {
    const { x, y, w, h } = this.progressBarConfig;
    const fillW = Math.max(0, w * Math.min(pct, 1));

    this.progressGfx.clear();

    if (fillW <= 0) return;

    // Main gradient fill (deep blue to gold)
    const steps = Math.ceil(fillW / 4);
    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(steps - 1, 1);
      const r = Math.floor(0x1a + (0xd4 - 0x1a) * t);
      const gv = Math.floor(0x33 + (0xaf - 0x33) * t);
      const b = Math.floor(0x88 + (0x37 - 0x88) * t);
      const col = (r << 16) | (gv << 8) | b;
      this.progressGfx.fillStyle(col, 1);
      const sx = x + i * 4;
      const sw = Math.min(4, fillW - i * 4);
      this.progressGfx.fillRect(sx, y - h / 2 + 1, sw, h - 2);
    }

    // Bright top highlight
    this.progressGfx.fillStyle(0xffffff, 0.12);
    this.progressGfx.fillRect(x, y - h / 2 + 1, fillW, 3);

    // Animated shimmer streak
    const shimmerPos = x + (this.shimmerX % (w + 80)) - 40;
    if (shimmerPos < x + fillW) {
      for (let s = 0; s < 50; s++) {
        const sx = shimmerPos + s;
        if (sx >= x && sx < x + fillW) {
          const intensity = 1 - Math.abs(s - 25) / 25;
          this.progressGfx.fillStyle(0xffffff, intensity * 0.3);
          this.progressGfx.fillRect(sx, y - h / 2 + 1, 1, h - 2);
        }
      }
    }

    // Bottom shadow
    this.progressGfx.fillStyle(0x000000, 0.2);
    this.progressGfx.fillRect(x, y + h / 2 - 3, fillW, 2);
  }

  /**
   * Vignette darkening at all 4 edges.
   */
  _drawVignette(W, H) {
    const g = this.add.graphics().setDepth(50);

    // Top edge
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0x000000, 0.05);
      g.fillRect(0, 0, W, 40 - i * 3);
    }
    // Bottom edge
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0x000000, 0.05);
      g.fillRect(0, H - 40 + i * 3, W, 40 - i * 3);
    }
    // Left edge
    for (let i = 0; i < 10; i++) {
      g.fillStyle(0x000000, 0.04);
      g.fillRect(0, 0, 50 - i * 4, H);
    }
    // Right edge
    for (let i = 0; i < 10; i++) {
      g.fillStyle(0x000000, 0.04);
      g.fillRect(W - 50 + i * 4, 0, 50 - i * 4, H);
    }

    // Corner vignettes
    const vignetteSize = 180;
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.03);
      g.fillTriangle(0, 0, vignetteSize - i * 18, 0, 0, vignetteSize - i * 18);
    }
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.03);
      g.fillTriangle(W, 0, W - vignetteSize + i * 18, 0, W, vignetteSize - i * 18);
    }
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.03);
      g.fillTriangle(0, H, vignetteSize - i * 18, H, 0, H - vignetteSize + i * 18);
    }
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.03);
      g.fillTriangle(W, H, W - vignetteSize + i * 18, H, W, H - vignetteSize + i * 18);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UPDATE LOOP - scroll all parallax layers LEFT + animate shimmer
  // ═══════════════════════════════════════════════════════════════

  update(time, delta) {
    const dt = delta / 1000;

    // ── Sound effect timers ───────────────────────────────────
    // Footsteps - every ~350ms while the knight runs
    this._footstepTimer = (this._footstepTimer || 0) + delta;
    if (this._footstepTimer > 350) {
      this._footstepTimer = 0;
      SFX.play('footstep');
    }

    // Torch crackle - every ~1.5s for ambient atmosphere
    this._torchTimer = (this._torchTimer || 0) + delta;
    if (this._torchTimer > 1500) {
      this._torchTimer = 0;
      SFX.play('torchCrackle');
    }

    // Summoning pulse - every ~2.5s for the mystical hum
    this._pulseTimer = (this._pulseTimer || 0) + delta;
    if (this._pulseTimer > 2500) {
      this._pulseTimer = 0;
      SFX.play('summoningPulse');
    }

    // Scroll far wall LEFT (slowest)
    if (this.farWallTile) {
      this.farWallTile.tilePositionX += this.farWallSpeed * dt;
    }

    // Scroll main wall LEFT (medium)
    if (this.mainWallTile) {
      this.mainWallTile.tilePositionX += this.mainWallSpeed * dt;
    }

    // Scroll floor LEFT (fastest)
    if (this.floorTile) {
      this.floorTile.tilePositionX += this.floorSpeed * dt;
    }

    // Knight glow removed - was dead code

    // Animate shimmer across progress bar
    this.shimmerX = (this.shimmerX || 0) + delta * 0.08;
    this._drawProgressFill(this.progressValue);
  }

  // ═══════════════════════════════════════════════════════════════
  // AUDIT LOGIC (preserved from original)
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  //  STREAM TICKER - single-line typewriter with queue
  //  Keeps the middle-of-screen activity readout to one dynamic line
  //  with type-in + hold + type-out animation. Full verbosity lives
  //  in the Guild Ledger on the right; this is the cinematic readout.
  // ═══════════════════════════════════════════════════════════════

  // Cleaner message formatting: strip noisy prefixes and shorten paths.
  _formatTickerMessage(raw) {
    if (!raw) return '';
    let m = String(raw).trim();
    // Drop environment-var noise like "PYTHONIOENCODING=utf-8 python ..."
    m = m.replace(/\b[A-Z_]+=[^\s]+\s+/g, '');
    // Collapse runs of whitespace
    m = m.replace(/\s+/g, ' ').trim();
    // Shorten very long absolute paths to their filename
    m = m.replace(/([/\\])[^\s]*[/\\]([^\s/\\]+\.[a-z]{1,6})/gi, '$1...$1$2');
    // Final hard truncate to one visible line
    const MAX = 72;
    if (m.length > MAX) m = m.slice(0, MAX - 1) + '\u2026';
    return m;
  }

  _enqueueTickerMessage(raw) {
    const msg = this._formatTickerMessage(raw);
    if (!msg) return;
    // De-dupe identical back-to-back messages
    if (this._tickerQueue.length && this._tickerQueue[this._tickerQueue.length - 1] === msg) return;
    this._tickerQueue.push(msg);
    // Cap queue to keep up with fast streams (drop oldest)
    while (this._tickerQueue.length > 8) this._tickerQueue.shift();
    if (!this._tickerBusy) this._runTickerLoop();
  }

  _runTickerLoop() {
    if (!this.streamText || !this.streamText.active) { this._tickerBusy = false; return; }
    if (this._tickerQueue.length === 0) {
      this._tickerBusy = false;
      this._positionTickerCursor('');
      return;
    }
    this._tickerBusy = true;
    const next = this._tickerQueue.shift();
    this._tickerCurrent = next;
    this._typeIn(next, () => {
      // Dynamic hold: longer when queue is calm so the user has time to
      // actually read the line. Shorter when stream is backed up so we
      // don't stall behind it.
      const q = this._tickerQueue.length;
      const hold = q >= 4 ? 320 : q >= 2 ? 640 : 1100;
      this.time.delayedCall(hold, () => {
        this._typeOut(() => {
          this.time.delayedCall(60, () => this._runTickerLoop());
        });
      });
    });
  }

  // Fast chunked type-in: reveal 3-5 chars per tick so a ~20-char line
  // completes in roughly 4 frames (~65ms) instead of 20+ frames. Still
  // reads as "typing" because the burst pattern is visible, but doesn't
  // hog the hold window. ~5-6x faster than the single-char stepper.
  _typeIn(text, done) {
    if (!this.streamText || !this.streamText.active) return;
    const t = this.streamText;
    this.tweens.killTweensOf(t);
    t.setText('');
    t.setAlpha(1);
    if (this._streamTextBaseY != null) t.setY(this._streamTextBaseY);
    this._restartCursorBlink();
    let i = 0;
    const step = () => {
      if (!t || !t.active) return;
      const chunk = 3 + Math.floor(Math.random() * 3); // 3-5 chars
      i = Math.min(i + chunk, text.length);
      t.setText(text.slice(0, i));
      this._positionTickerCursor(t.text);
      if (i >= text.length) {
        if (done) done();
        return;
      }
      // ~4-10ms - effectively one frame at 60fps, maybe two
      this.time.delayedCall(4 + Math.random() * 6, step);
    };
    step();
  }

  // Varied exit animations - width-preserving so the line never visually
  // contracts back into the center (which reads as disorienting
  // expand/contract oscillation against the type-in). Picks one of three
  // tasteful options per cycle:
  //   • fade-drift (most common): text softens to 0 with 3px drop
  //   • dissolve:   chars corrupt to glyphs then clear in shuffled order
  //   • wipe:       solid block sweeps left→right eating the text
  _typeOut(done) {
    if (!this.streamText || !this.streamText.active) { if (done) done(); return; }
    if (!this.streamText.text || this.streamText.text.length === 0) {
      if (done) done();
      return;
    }
    const roll = Math.random();
    if (roll < 0.50) return this._exitFade(done);
    if (roll < 0.82) return this._exitDissolve(done);
    return this._exitWipe(done);
  }

  _exitFade(done) {
    const t = this.streamText;
    const c = this.streamCursor;
    if (this._streamTextBaseY == null) this._streamTextBaseY = t.y;
    const baseY = this._streamTextBaseY;
    this.tweens.killTweensOf(t);
    if (c && c.active) this.tweens.killTweensOf(c);
    // Text: alpha to 0 with small downward drift and color desat at tail
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: baseY + 3,
      duration: 260,
      ease: 'Sine.easeIn',
      onUpdate: (tw) => {
        if (tw.progress > 0.55) t.setColor('#7a6090');
      },
      onComplete: () => {
        t.setText('');
        t.setAlpha(1);
        t.setColor('#b890d8');
        t.setY(baseY);
        this._positionTickerCursor('');
        if (done) done();
      }
    });
    // Cursor fades with it, then resumes blinking on next typeIn
    if (c && c.active) {
      this.tweens.add({
        targets: c,
        alpha: 0,
        duration: 220,
        ease: 'Sine.easeIn'
      });
    }
  }

  _exitDissolve(done) {
    const t = this.streamText;
    const original = t.text;
    const len = original.length;
    const chars = original.split('');
    const order = [];
    for (let i = 0; i < len; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const glyphs = ['·', '▪', '▫', '░', '▓', '∴', '‥'];
    const stepDelay = Math.max(5, Math.min(14, 200 / Math.max(len, 1)));
    const clearDelay = 50;
    let toFinish = len;
    if (len === 0) { if (done) done(); return; }
    for (let step = 0; step < len; step++) {
      const idx = order[step];
      const tCorrupt = step * stepDelay;
      const tClear   = tCorrupt + clearDelay;
      this.time.delayedCall(tCorrupt, () => {
        if (!t || !t.active) return;
        if (chars[idx] === ' ') return;
        chars[idx] = glyphs[Math.floor(Math.random() * glyphs.length)];
        t.setText(chars.join(''));
      });
      this.time.delayedCall(tClear, () => {
        if (!t || !t.active) return;
        chars[idx] = ' ';
        t.setText(chars.join(''));
        toFinish -= 1;
        if (toFinish <= 0) {
          t.setText('');
          this._positionTickerCursor('');
          if (done) done();
        }
      });
    }
  }

  _exitWipe(done) {
    const t = this.streamText;
    const original = t.text;
    const len = original.length;
    if (len === 0) { if (done) done(); return; }
    const chars = original.split('');
    const stepDelay = Math.max(8, Math.min(16, 200 / len));
    let i = 0;
    const tick = () => {
      if (!t || !t.active) return;
      if (i > len) {
        t.setText('');
        this._positionTickerCursor('');
        if (done) done();
        return;
      }
      // Show a leading block head at position i; everything before it
      // is cleared to spaces; everything after is the original text.
      // When i reaches len, last step clears the block and we finish.
      const prefix = ' '.repeat(Math.min(i, len));
      const head = i < len ? '▓' : '';
      const suffix = i < len ? original.slice(i + 1) : '';
      t.setText(prefix + head + suffix);
      i += 1;
      this.time.delayedCall(stepDelay, tick);
    };
    tick();
  }

  _restartCursorBlink() {
    const c = this.streamCursor;
    if (!c || !c.active) return;
    this.tweens.killTweensOf(c);
    c.setAlpha(0.5);
    this.tweens.add({
      targets: c,
      alpha: { from: 0.25, to: 0.9 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  _positionTickerCursor(text) {
    if (!this.streamCursor || !this.streamCursor.active) return;
    if (!this.streamText || !this.streamText.active) return;
    // Place the cursor just after the last character of centered text
    const halfWidth = this.streamText.width / 2;
    this.streamCursor.setX(this.streamText.x + halfWidth + 2);
  }

  _setTickerFinalState(msg) {
    // Used for terminal states ("no demons", "silent") - clear queue,
    // set text directly, and hide the cursor so nothing blinks after.
    this._tickerQueue.length = 0;
    this._tickerBusy = false;
    if (this.streamText && this.streamText.active) {
      this.streamText.setText(this._formatTickerMessage(msg));
    }
    if (this.streamCursor && this.streamCursor.active) {
      this.streamCursor.setAlpha(0);
      this.tweens.killTweensOf(this.streamCursor);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  FLAVOR MESSAGES - shuffled bag, variable timing, varied FX
  // ═══════════════════════════════════════════════════════════════

  _nextFlavorMessage() {
    if (!this._flavorBag || this._flavorBag.length === 0) {
      // Refill from the master list and Fisher-Yates shuffle
      this._flavorBag = this.flavorMessages.slice();
      for (let i = this._flavorBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = this._flavorBag[i];
        this._flavorBag[i] = this._flavorBag[j];
        this._flavorBag[j] = tmp;
      }
    }
    return this._flavorBag.pop();
  }

  _scheduleNextFlavorMessage(delay) {
    if (!this.messageText || !this.messageText.active) return;
    this.time.delayedCall(delay, () => this._cycleFlavorMessage());
  }

  _cycleFlavorMessage() {
    if (!this.messageText || !this.messageText.active) return;
    const msg = this._nextFlavorMessage();
    // Pick an exit effect for the OUTGOING message, then swap & pick an
    // entry effect for the incoming one. Exit & entry are independent so
    // we get combinations like fade-out / slide-in, drift-out / dissolve-in.
    const effects = ['fade', 'slide-left', 'slide-right', 'rise', 'sink', 'glitch', 'dissolve', 'typewriter'];
    const entry = effects[Math.floor(Math.random() * effects.length)];
    const exit  = effects[Math.floor(Math.random() * effects.length)];
    // Organic hold time: mostly 2200-4400ms, occasionally up to 5500ms.
    const hold = 2200 + Math.floor(Math.random() * 2200)
               + (Math.random() < 0.15 ? Math.floor(Math.random() * 1100) : 0);

    this._exitFlavor(exit, () => {
      this.messageText.setText(msg);
      this.messageGlow.setText(msg);
      // Reset position and alpha before entry effect places/reveals
      this.messageText.setPosition(this._flavorBaseX, this._flavorBaseY).setAlpha(0);
      this.messageGlow.setPosition(this._flavorBaseX, this._flavorBaseY).setAlpha(0);
      // Restore default colors (terminal states override these)
      this.messageText.setColor('#66cccc');
      this.messageGlow.setColor('#44aaaa');
      SFX.play('textType');
      this._enterFlavor(entry, () => {
        this._scheduleNextFlavorMessage(hold);
      });
    });
  }

  _exitFlavor(kind, done) {
    if (!this.messageText || !this.messageText.active) { if (done) done(); return; }
    // If current message is already invisible (first cycle), skip exit
    if (this.messageText.alpha <= 0.02) { if (done) done(); return; }
    const dur = 380 + Math.floor(Math.random() * 300);
    const targets = [this.messageText, this.messageGlow];
    this.tweens.killTweensOf(targets);
    switch (kind) {
      case 'slide-left':
        this.tweens.add({ targets, x: this._flavorBaseX - 80, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
      case 'slide-right':
        this.tweens.add({ targets, x: this._flavorBaseX + 80, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
      case 'rise':
        this.tweens.add({ targets, y: this._flavorBaseY - 16, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
      case 'sink':
        this.tweens.add({ targets, y: this._flavorBaseY + 14, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
      case 'glitch':
        this._glitchOut(done, dur);
        return;
      case 'dissolve':
        this._dissolveOut(done, dur);
        return;
      case 'typewriter':
        this._typewriterOut(done);
        return;
      case 'fade':
      default:
        this.tweens.add({ targets, alpha: 0, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
    }
  }

  _enterFlavor(kind, done) {
    if (!this.messageText || !this.messageText.active) { if (done) done(); return; }
    const dur = 520 + Math.floor(Math.random() * 380);
    const targets = [this.messageText, this.messageGlow];
    switch (kind) {
      case 'slide-left':
        this.messageText.setX(this._flavorBaseX + 80);
        this.messageGlow.setX(this._flavorBaseX + 80);
        this.tweens.add({ targets: this.messageText, x: this._flavorBaseX, alpha: 1,   duration: dur, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.messageGlow, x: this._flavorBaseX, alpha: 0.3, duration: dur, ease: 'Sine.easeOut', onComplete: done });
        return;
      case 'slide-right':
        this.messageText.setX(this._flavorBaseX - 80);
        this.messageGlow.setX(this._flavorBaseX - 80);
        this.tweens.add({ targets: this.messageText, x: this._flavorBaseX, alpha: 1,   duration: dur, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.messageGlow, x: this._flavorBaseX, alpha: 0.3, duration: dur, ease: 'Sine.easeOut', onComplete: done });
        return;
      case 'rise':
        this.messageText.setY(this._flavorBaseY + 16);
        this.messageGlow.setY(this._flavorBaseY + 16);
        this.tweens.add({ targets: this.messageText, y: this._flavorBaseY, alpha: 1,   duration: dur, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.messageGlow, y: this._flavorBaseY, alpha: 0.3, duration: dur, ease: 'Sine.easeOut', onComplete: done });
        return;
      case 'sink':
        this.messageText.setY(this._flavorBaseY - 14);
        this.messageGlow.setY(this._flavorBaseY - 14);
        this.tweens.add({ targets: this.messageText, y: this._flavorBaseY, alpha: 1,   duration: dur, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.messageGlow, y: this._flavorBaseY, alpha: 0.3, duration: dur, ease: 'Sine.easeOut', onComplete: done });
        return;
      case 'glitch':
        this._glitchIn(done);
        return;
      case 'dissolve':
        this._dissolveIn(done);
        return;
      case 'typewriter':
        this._typewriterIn(done);
        return;
      case 'fade':
      default:
        this.tweens.add({ targets: this.messageText, alpha: 1,   duration: dur, ease: 'Sine.easeIn' });
        this.tweens.add({ targets: this.messageGlow, alpha: 0.3, duration: dur, ease: 'Sine.easeIn', onComplete: done });
        return;
    }
  }

  // Glitch: rapid alpha flickers before settling
  _glitchIn(done) {
    if (!this.messageText || !this.messageText.active) { if (done) done(); return; }
    const flickers = 5 + Math.floor(Math.random() * 3);
    let i = 0;
    const tick = () => {
      if (!this.messageText || !this.messageText.active) return;
      i += 1;
      const on = i % 2 === 0;
      this.messageText.setAlpha(on ? 0.2 + Math.random() * 0.8 : 0);
      this.messageGlow.setAlpha(on ? 0.1 + Math.random() * 0.25 : 0);
      if (i >= flickers) {
        this.tweens.add({ targets: this.messageText, alpha: 1,   duration: 260, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.messageGlow, alpha: 0.3, duration: 260, ease: 'Sine.easeOut', onComplete: done });
        return;
      }
      this.time.delayedCall(40 + Math.random() * 60, tick);
    };
    tick();
  }

  _glitchOut(done, dur) {
    if (!this.messageText || !this.messageText.active) { if (done) done(); return; }
    const flickers = 4 + Math.floor(Math.random() * 3);
    let i = 0;
    const tick = () => {
      if (!this.messageText || !this.messageText.active) return;
      i += 1;
      this.messageText.setAlpha(Math.random() < 0.5 ? 0 : 0.6 + Math.random() * 0.3);
      this.messageGlow.setAlpha(Math.random() < 0.5 ? 0 : 0.15 + Math.random() * 0.15);
      if (i >= flickers) {
        this.tweens.add({ targets: [this.messageText, this.messageGlow], alpha: 0, duration: Math.max(200, dur - 200), onComplete: done });
        return;
      }
      this.time.delayedCall(35 + Math.random() * 60, tick);
    };
    tick();
  }

  // Dissolve: partial alpha via scaled particles (approximate by jittering alpha + position)
  _dissolveIn(done) {
    if (!this.messageText || !this.messageText.active) { if (done) done(); return; }
    let a = 0;
    const target = 1;
    const tick = () => {
      if (!this.messageText || !this.messageText.active) return;
      a += 0.08 + Math.random() * 0.12;
      if (a >= target) {
        this.messageText.setAlpha(target);
        this.messageGlow.setAlpha(0.3);
        if (done) done();
        return;
      }
      this.messageText.setAlpha(Math.min(a, target) * (0.6 + Math.random() * 0.4));
      this.messageGlow.setAlpha(Math.min(a, target) * 0.3);
      this.time.delayedCall(32 + Math.random() * 28, tick);
    };
    tick();
  }

  _dissolveOut(done, dur) {
    if (!this.messageText || !this.messageText.active) { if (done) done(); return; }
    let a = this.messageText.alpha;
    const tick = () => {
      if (!this.messageText || !this.messageText.active) return;
      a -= 0.08 + Math.random() * 0.1;
      if (a <= 0) {
        this.messageText.setAlpha(0);
        this.messageGlow.setAlpha(0);
        if (done) done();
        return;
      }
      this.messageText.setAlpha(a * (0.5 + Math.random() * 0.5));
      this.messageGlow.setAlpha(Math.max(0, a * 0.3));
      this.time.delayedCall(28 + Math.random() * 24, tick);
    };
    tick();
  }

  // Typewriter: character-by-character reveal/erase of the TEXT ONLY;
  // the glow layer rides along on alpha so it doesn't compete.
  _typewriterIn(done) {
    if (!this.messageText || !this.messageText.active) { if (done) done(); return; }
    const full = this.messageText.text;
    this.messageText.setAlpha(1);
    this.messageGlow.setAlpha(0);
    this.messageText.setText('');
    let i = 0;
    const step = () => {
      if (!this.messageText || !this.messageText.active) return;
      i += 1;
      this.messageText.setText(full.slice(0, i));
      if (i >= full.length) {
        this.tweens.add({ targets: this.messageGlow, alpha: 0.3, duration: 220, onComplete: done });
        return;
      }
      this.time.delayedCall(18 + Math.random() * 18, step);
    };
    step();
  }

  _typewriterOut(done) {
    if (!this.messageText || !this.messageText.active) { if (done) done(); return; }
    let current = this.messageText.text;
    this.messageGlow.setAlpha(0);
    const step = () => {
      if (!this.messageText || !this.messageText.active) return;
      if (current.length === 0) { if (done) done(); return; }
      current = current.slice(0, -1);
      this.messageText.setText(current);
      this.time.delayedCall(14 + Math.random() * 12, step);
    };
    step();
  }

  addLog(msg) {
    this.logTexts.forEach(t => t.y -= 18);
    if (this.logTexts.length > 2) {
      const old = this.logTexts.shift();
      old.destroy();
    }
    const text = this.add.text(400, this.logY, `> ${msg}`, {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '12px',
      color: '#667788',
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(55).setAlpha(0.7);
    this.logTexts.push(text);
  }

  setProgress(pct) {
    const clamped = Math.min(pct, 1);
    this.progressValue = clamped;
    this.progressPctText.setText(Math.floor(clamped * 100) + '%');
  }

  /**
   * Abandon Scroll - a dark rune in the corner that kills the audit and returns to title.
   */
  _createAbandonScroll(W) {
    const scrollX = W - 50;
    const scrollY = 30;

    // Draw a small arcane rune / scroll icon using graphics
    const rune = this.add.graphics().setDepth(60);

    // Outer circle - dim blood red
    rune.lineStyle(1.5, 0x661111, 0.6);
    rune.strokeCircle(scrollX, scrollY, 16);

    // Inner glyph - an X mark (rune of severance)
    rune.lineStyle(2, 0x992222, 0.7);
    rune.lineBetween(scrollX - 7, scrollY - 7, scrollX + 7, scrollY + 7);
    rune.lineBetween(scrollX + 7, scrollY - 7, scrollX - 7, scrollY + 7);

    // Small dots at cardinal points
    rune.fillStyle(0x882222, 0.5);
    rune.fillCircle(scrollX, scrollY - 16, 2);
    rune.fillCircle(scrollX, scrollY + 16, 2);
    rune.fillCircle(scrollX - 16, scrollY, 2);
    rune.fillCircle(scrollX + 16, scrollY, 2);

    // Label text (hidden by default, shown on hover)
    const label = this.add.text(scrollX, scrollY + 28, 'Sever the link', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '10px',
      color: '#882222',
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    // Invisible hit area for interaction
    const hitZone = this.add.zone(scrollX, scrollY, 44, 44)
      .setInteractive({ useHandCursor: true })
      .setDepth(61);

    // Hover effects
    hitZone.on('pointerover', () => {
      rune.clear();
      rune.lineStyle(1.5, 0xaa2222, 0.9);
      rune.strokeCircle(scrollX, scrollY, 16);
      rune.lineStyle(2, 0xdd3333, 1);
      rune.lineBetween(scrollX - 7, scrollY - 7, scrollX + 7, scrollY + 7);
      rune.lineBetween(scrollX + 7, scrollY - 7, scrollX - 7, scrollY + 7);
      rune.fillStyle(0xcc3333, 0.8);
      rune.fillCircle(scrollX, scrollY - 16, 2);
      rune.fillCircle(scrollX, scrollY + 16, 2);
      rune.fillCircle(scrollX - 16, scrollY, 2);
      rune.fillCircle(scrollX + 16, scrollY, 2);
      label.setAlpha(1);
    });

    hitZone.on('pointerout', () => {
      rune.clear();
      rune.lineStyle(1.5, 0x661111, 0.6);
      rune.strokeCircle(scrollX, scrollY, 16);
      rune.lineStyle(2, 0x992222, 0.7);
      rune.lineBetween(scrollX - 7, scrollY - 7, scrollX + 7, scrollY + 7);
      rune.lineBetween(scrollX + 7, scrollY - 7, scrollX - 7, scrollY + 7);
      rune.fillStyle(0x882222, 0.5);
      rune.fillCircle(scrollX, scrollY - 16, 2);
      rune.fillCircle(scrollX, scrollY + 16, 2);
      rune.fillCircle(scrollX - 16, scrollY, 2);
      rune.fillCircle(scrollX + 16, scrollY, 2);
      label.setAlpha(0);
    });

    // Click - sever the connection and abort the audit
    hitZone.on('pointerdown', () => {
      this.aborted = true;
      bridge.cancelAll();
      if (this.game.addLog) this.game.addLog('The link is severed.');
      this.cameras.main.fadeOut(600, 30, 0, 0);
      this.time.delayedCall(600, () => {
        window.returnToTitle();
      });
    });
  }

  async runAudit() {
    if (this.auditRunning) return; // Guard against double-audit
    this.auditRunning = true;
    this.aborted = false;

    // Fresh quest - wipe the end-of-quest timer state. DungeonHall
    // stamps the real start when the player first enters the hall;
    // main.js's visibilitychange listener handles pause/resume.
    this.game._questStartMs = null;
    this.game._questActiveMs = 0;
    this.game._questVisibleSince = null;

    // Three-phase progress model calibrated from real audits:
    //
    // Phase 1: Setup & Agent Launch (0-25%)
    //   First ~20 events: skill invocation, tool searches, initial fetches,
    //   agent spawn messages. Every event is worth a lot here.
    //
    // Phase 2: Agent Work (25-80%)
    //   Bulk of the audit - agents running bash, fetch, read, grep commands.
    //   ~100-250 events depending on site. Logarithmic curve so it moves
    //   steadily but slows as it approaches the ceiling.
    //
    // Phase 3: Completion (80-100%)
    //   Agent completion signals, consolidation, JSON output.
    //
    let totalEvents = 0;
    let completeReceived = false;
    let agentsLaunched = 0;
    let agentsCompleted = 0;

    const updateProgress = () => {
      if (completeReceived) {
        this.setProgress(0.92);
        return;
      }

      // Phase 1: first 20 events ramp quickly to 25%
      // Each early event is worth ~1.25% (feels responsive immediately)
      const setupProgress = Math.min(totalEvents / 20, 1) * 0.25;

      // Phase 2: events 20+ fill 25%-80% on a log curve
      // log(1) = 0, log(~150) ≈ 5 - normalized to 0-1 range
      const workEvents = Math.max(totalEvents - 20, 0);
      const workProgress = workEvents > 0
        ? Math.min(Math.log(1 + workEvents) / Math.log(180), 1) * 0.55
        : 0;

      // Phase 3: agent completions add bonus on top (up to 12%)
      const completionBonus = Math.min(agentsCompleted / 8, 1) * 0.12;

      const raw = Math.min(setupProgress + workProgress + completionBonus, 0.90);
      this.setProgress(raw);
    };

    // Accumulate all streamed text so we can extract partial results on failure
    let streamedText = '';

    try {
      if (this.game.showLoading) this.game.showLoading();
      const model = getProfileKey(this.game.characterConfig?.profile || this.game.characterConfig?.model);
      const runtime = this.game.characterConfig?.runtime || getSelectedRuntime();
      const result = await bridge.audit(this.domain, this.projectPath, (streamData) => {
        this.streamChunks++;
        const clean = streamData.replace(/[\n\r]+/g, ' ').trim();
        if (clean.length > 0) {
          streamedText += clean + '\n';
          // Stop the gothic idle rotation once real data arrives
          this._tickerStreamed = true;
          this._enqueueTickerMessage(clean);
          if (this.game.addLog) this.game.addLog(clean);

          totalEvents++;

          if (clean === '[Complete]') {
            completeReceived = true;
          }

          // Detect agent launches
          if (/^\[Agent\]/i.test(clean)) {
            agentsLaunched++;
          }

          // Detect agent completions
          if (/audit complete|agent complete|agents?\s+remaining/i.test(clean)) {
            agentsCompleted++;
          }

          updateProgress();
        }

        // Contextual status messages
        const phase = completeReceived ? 'Assembling results...'
          : agentsCompleted > 0 ? `${agentsCompleted} agents returned`
          : agentsLaunched > 0 ? `${agentsLaunched} agents deployed`
          : totalEvents > 3 ? 'Initializing audit...'
          : totalEvents > 0 ? 'Connecting...'
          : 'Summoning...';
        this.demonCounter.setText(phase);
      }, model, runtime);

      if (this.aborted) return; // User cancelled - don't transition
      this.setProgress(1);

      if (this.game.hideLoading) this.game.hideLoading();
      const auditData = result.data || result;
      this._handleAuditResult(auditData, true);

    } catch (err) {
      if (this.game.hideLoading) this.game.hideLoading();
      if (this.aborted) return; // User cancelled - don't handle error
      console.error('Audit error:', err);
      if (this.game.addLog) this.game.addLog('ERROR: ' + err.message);

      // Try to extract partial results from whatever streamed in
      const partial = this._extractPartialIssues(streamedText);
      if (partial && partial.issues && partial.issues.length > 0) {
        this.addLog(`Interrupted - ${partial.issues.length} demons found before failure`);
        this._handleAuditResult(partial, false);
      } else {
        // Truly nothing came back - gothic copy only, no tech-speak
        const pickLedger = LEDGER_FAILURE_MESSAGES[Math.floor(Math.random() * LEDGER_FAILURE_MESSAGES.length)];
        const pickTicker = TICKER_FAILURE_MESSAGES[Math.floor(Math.random() * TICKER_FAILURE_MESSAGES.length)];
        this.addLog(pickLedger);
        this.messageText.setText('The dungeon is silent.');
        this.messageText.setColor('#cc4444');
        this._setTickerFinalState(pickTicker);
        this.demonCounter.setText('');
      }
    }
  }

  /**
   * Handle a successful or partial audit result - cache it and transition.
   */
  _handleAuditResult(auditData, cacheResult = false) {
    if (!auditData || !auditData.issues || auditData.issues.length === 0) {
      this.addLog('Audit completed but found no issues');
      this.messageText.setText('The dungeon is empty.');
      this.messageText.setColor('#60d060');
      this._setTickerFinalState('No SEO issues detected.');
      this.demonCounter.setText('');
      // Show a "Return to Guild" button so the user isn't stranded
      this._showEmptyDungeonReturn();
      return;
    }

    this.game.auditData = auditData;

    // Only cache fully successful audits - not partial/interrupted results
    if (cacheResult) {
      try {
        const modelKey = getProfileKey(this.game.characterConfig?.profile || this.game.characterConfig?.model);
        const runtime = this.game.characterConfig?.runtime || getSelectedRuntime();
        localStorage.setItem(`seo_dungeon_audit_${this.domain}_${runtime}_${modelKey}`, JSON.stringify({
          domain: this.domain,
          profile: modelKey,
          model: modelKey,
          runtime,
          timestamp: Date.now(),
          auditData: auditData
        }));
      } catch (e) { /* localStorage full or unavailable */ }
    }

    const revealMsg = 'The dungeon reveals itself...';
    this.messageText.setText(revealMsg);
    this.messageText.setColor('#f0c040');
    this.messageGlow.setText(revealMsg);
    this.messageGlow.setColor('#cc8800');
    this._setTickerFinalState('');
    this.demonCounter.setText(`${auditData.issues.length} demons detected! Score: ${auditData.score}/100`);
    this.demonCounter.setColor('#f0c040');

    // Dramatic pause before transition
    SFX.play('auditComplete');
    this.cameras.main.flash(300, 200, 50, 50);
    this.time.delayedCall(2000, () => {
      SFX.play('sceneTransition');
      this.cameras.main.fadeOut(1000, 0, 0, 0);
      this.time.delayedCall(1000, () => {
        this.scene.start('DungeonHall');
      });
    });
  }

  /**
   * Show a Return-to-Guild button when the audit finds zero issues,
   * so the user isn't stuck on the Summoning screen.
   */
  _showEmptyDungeonReturn() {
    const W = 800, H = 600;
    const btnY = H - 120;
    const btnBg = this.add.rectangle(W / 2, btnY, 260, 44, 0x1a1a2e, 0.95).setDepth(200);
    btnBg.setStrokeStyle(2, 0xd4af37);
    const btnText = this.add.text(W / 2, btnY, 'Return to Guild', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
      color: '#d4af37',
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(201);
    btnBg.setInteractive({ useHandCursor: true });
    btnText.setInteractive({ useHandCursor: true });
    const goBack = () => {
      if (typeof window.returnToTitle === 'function') window.returnToTitle();
    };
    btnBg.on('pointerdown', goBack);
    btnText.on('pointerdown', goBack);
  }

  /**
   * Try to extract issue data from partial/interrupted stream text.
   * Looks for JSON fragments containing issue arrays.
   */
  _extractPartialIssues(text) {
    if (!text || text.length < 20) return null;
    try {
      // Look for a JSON block with issues array
      const jsonMatch = text.match(/\{[\s\S]*"issues"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.issues && Array.isArray(parsed.issues) && parsed.issues.length > 0) {
          parsed.issues = parsed.issues.map((issue, i) => ({
            id: issue.id || i + 1,
            severity: issue.severity || 'medium',
            title: issue.title || 'Unknown Issue',
            description: issue.description || 'No description',
            category: issue.category || 'General',
            hp: issue.hp || 50
          }));
          parsed.domain = parsed.domain || this.domain;
          parsed.score = parsed.score || 50;
          parsed.totalIssues = parsed.issues.length;
          return parsed;
        }
      }
    } catch (e) {
      // JSON incomplete - expected for interrupted audits
    }
    return null;
  }

  delay(ms) {
    return new Promise(resolve => this.time.delayedCall(ms, resolve));
  }
}
