import { COLORS } from '../utils/colors.js';
import { bridge } from '../utils/ws.js';
import { ENCOUNTER_MESSAGES, VICTORY_MESSAGES } from '../utils/flavor-text.js';
import { SFX } from '../utils/sound-manager.js';

/**
 * Battle scene - Final Fantasy style turn-based combat.
 * Knight vs SEO Demon. Selecting ATTACK triggers Claude to fix the issue.
 * High-quality 16-bit retro RPG battle screen with dramatic animations.
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.issue = data.issue;
    // Defensive: guard against zero/missing HP so HP-bar math doesn't NaN.
    const hp = Number(data.issue && data.issue.hp);
    const safeHp = Number.isFinite(hp) && hp > 0 ? hp : 50;
    this.demonHp = safeHp;
    this.demonMaxHp = safeHp;
    this.knightHp = 100;
    this.isPlayerTurn = true;
    this.battleOver = false;
    this.selectedMenuItem = 0;
    this.battleLogHistory = [];
    this.battleLogScrollOffset = 0;
  }

  create() {
    const dpr = this.game.dpr || window.GAME_DPR;
    this.cameras.main.setZoom(dpr);
    this.cameras.main.scrollX = 400 * (1 - dpr);
    this.cameras.main.scrollY = 300 * (1 - dpr);
    this.cameras.main.setBackgroundColor(0x000000);

    // ── Dark dungeon background ──────────────────────
    this.drawDungeonBackground();

    // ── Dramatic entrance ────────────────────────────
    this.cameras.main.fadeIn(800, 0, 0, 0);

    // ── Battle arena floor ───────────────────────────
    this.drawBattleFloor();

    // ── Demon side (right) ───────────────────────────
    this.createDemon();

    // ── Knight side (left) ───────────────────────────
    this.createKnight();

    // ── UI Layer ─────────────────────────────────────
    this.createHPDisplays();
    this.createBattleLog();
    this.createCommandMenu();
    this.createIssueDetails();
    this.createStreamText();

    // ── Dramatic entrance animation ──────────────────
    this.playEntranceAnimation();

    // ── Keyboard support ─────────────────────────────
    this.setupKeyboard();

    // ── Cleanup on scene exit ────────────────────────
    this.events.on('shutdown', this.shutdown, this);
  }

  // ═══════════════════════════════════════════════════
  //  BACKGROUND & ENVIRONMENT
  // ═══════════════════════════════════════════════════

  drawDungeonBackground() {
    // Dark stone wall gradient
    const bgGfx = this.add.graphics();

    // Stone wall base
    bgGfx.fillStyle(0x12101a, 1);
    bgGfx.fillRect(0, 0, 800, 360);

    // Stone brick pattern
    for (let row = 0; row < 9; row++) {
      for (let col = -1; col < 17; col++) {
        const offset = (row % 2 === 0) ? 0 : 25;
        const x = col * 50 + offset;
        const y = row * 40;
        const shade = 0x18 + Phaser.Math.Between(-3, 3);
        const color = Phaser.Display.Color.GetColor(shade, shade - 2, shade + 6);
        bgGfx.fillStyle(color, 1);
        bgGfx.fillRect(x + 1, y + 1, 48, 38);
      }
    }

    // Mortar lines (subtle)
    bgGfx.lineStyle(1, 0x0a0a12, 0.6);
    for (let row = 0; row <= 9; row++) {
      bgGfx.lineBetween(0, row * 40, 800, row * 40);
    }
    for (let row = 0; row < 9; row++) {
      const offset = (row % 2 === 0) ? 0 : 25;
      for (let col = -1; col <= 17; col++) {
        const x = col * 50 + offset;
        bgGfx.lineBetween(x, row * 40, x, (row + 1) * 40);
      }
    }

    // Torch glow areas (left and right)
    this.createTorchGlow(100, 80);
    this.createTorchGlow(700, 80);
    this.createTorchGlow(400, 50);

    // Ambient dust motes drifting through the dungeon
    this._spawnDustMotes();

    // Faint embers drifting up from the floor
    this._spawnEmbers();

    // Occasional wisp of fog rolling across the ground
    this._spawnGroundFog();
  }

  _spawnDustMotes() {
    // Spawn a handful of dust particles on a slow loop
    this.time.addEvent({
      delay: 800,
      repeat: -1,
      callback: () => {
        // Keep at most ~12 motes alive at a time
        if (this._dustCount >= 12) return;
        this._dustCount = (this._dustCount || 0) + 1;

        const startX = Phaser.Math.Between(0, 800);
        const startY = Phaser.Math.Between(20, 340);
        const size = Phaser.Math.FloatBetween(0.5, 1.5);
        const alpha = Phaser.Math.FloatBetween(0.08, 0.2);
        const color = Phaser.Utils.Array.GetRandom([0xccccdd, 0xaaaacc, 0x998877]);

        const mote = this.add.circle(startX, startY, size, color, alpha).setDepth(1);

        // Slow, gentle drift - slightly upward and sideways
        const driftX = Phaser.Math.Between(-40, 40);
        const driftY = Phaser.Math.Between(-30, -60);
        const duration = Phaser.Math.Between(4000, 8000);

        this.tweens.add({
          targets: mote,
          x: startX + driftX,
          y: startY + driftY,
          alpha: 0,
          duration: duration,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            mote.destroy();
            this._dustCount = Math.max(0, (this._dustCount || 1) - 1);
          }
        });
      }
    });
  }

  _spawnEmbers() {
    this.time.addEvent({
      delay: 1400,
      repeat: -1,
      callback: () => {
        if (this._emberCount >= 6) return;
        this._emberCount = (this._emberCount || 0) + 1;

        const startX = Phaser.Math.Between(60, 740);
        const startY = Phaser.Math.Between(290, 320);
        const ember = this.add.circle(startX, startY, Phaser.Math.FloatBetween(0.8, 1.2),
          Phaser.Utils.Array.GetRandom([0xff6622, 0xff8844, 0xffaa44]),
          Phaser.Math.FloatBetween(0.15, 0.3)
        ).setDepth(2);

        this.tweens.add({
          targets: ember,
          x: startX + Phaser.Math.Between(-20, 20),
          y: startY - Phaser.Math.Between(60, 140),
          alpha: 0,
          duration: Phaser.Math.Between(3000, 5000),
          ease: 'Sine.easeOut',
          onComplete: () => {
            ember.destroy();
            this._emberCount = Math.max(0, (this._emberCount || 1) - 1);
          }
        });
      }
    });
  }

  _spawnGroundFog() {
    this.time.addEvent({
      delay: 3500,
      repeat: -1,
      callback: () => {
        if (this._fogCount >= 3) return;
        this._fogCount = (this._fogCount || 0) + 1;

        const startX = Phaser.Math.Between(-40, 0);
        const fogY = Phaser.Math.Between(290, 310);
        const fog = this.add.ellipse(startX, fogY,
          Phaser.Math.Between(80, 140), Phaser.Math.Between(12, 20),
          0x8888aa, Phaser.Math.FloatBetween(0.03, 0.06)
        ).setDepth(1);

        this.tweens.add({
          targets: fog,
          x: 840,
          alpha: 0,
          duration: Phaser.Math.Between(10000, 16000),
          ease: 'Linear',
          onComplete: () => {
            fog.destroy();
            this._fogCount = Math.max(0, (this._fogCount || 1) - 1);
          }
        });
      }
    });
  }

  createTorchGlow(x, y) {
    const glow = this.add.graphics();
    glow.fillStyle(0xff6600, 0.04);
    glow.fillCircle(x, y, 120);
    glow.fillStyle(0xff8800, 0.03);
    glow.fillCircle(x, y, 80);
    glow.fillStyle(0xffaa00, 0.02);
    glow.fillCircle(x, y, 50);

    // Animated torch flicker
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.6, to: 1.0 },
      duration: Phaser.Math.Between(300, 600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Torch flame particles
    this.time.addEvent({
      delay: 180,
      repeat: -1,
      callback: () => {
        const flame = this.add.circle(
          x + Phaser.Math.Between(-4, 4),
          y,
          Phaser.Math.Between(2, 4),
          Phaser.Utils.Array.GetRandom([0xff6600, 0xff8800, 0xffaa00, 0xffcc44]),
          0.6
        );
        this.tweens.add({
          targets: flame,
          y: y - Phaser.Math.Between(15, 35),
          alpha: 0,
          scaleX: 0.2,
          scaleY: 0.2,
          duration: Phaser.Math.Between(300, 600),
          ease: 'Power1',
          onComplete: () => flame.destroy()
        });
      }
    });
  }

  drawBattleFloor() {
    const floor = this.add.graphics();
    // Dark floor with perspective lines
    floor.fillStyle(0x0e0c16, 1);
    floor.fillRect(0, 300, 800, 300);

    // Floor tile pattern
    for (let i = 0; i < 20; i++) {
      const alpha = 0.05 + (i % 2) * 0.03;
      floor.fillStyle(0x1a1828, alpha);
      floor.fillRect(i * 42, 300, 40, 120);
    }

    // Floor highlight line
    floor.lineStyle(1, 0x2a2a3e, 0.5);
    floor.lineBetween(0, 300, 800, 300);
    floor.lineStyle(1, 0x1a1a2e, 0.3);
    floor.lineBetween(0, 340, 800, 340);
    floor.lineBetween(0, 380, 800, 380);
  }

  // ═══════════════════════════════════════════════════
  //  CHARACTER CREATION
  // ═══════════════════════════════════════════════════

  createDemon() {
    // Every demon is a 0x72 4-frame idle animation. Scale per severity,
    // flip to face the player on the left. NO fake breath tweens - the
    // real idle animation carries the "alive" feel.
    const BATTLE_SCALES = { critical: 5, high: 5.5, medium: 4.3, low: 3.2, info: 3.2 };
    const demonScale = BATTLE_SCALES[this.issue.severity] || 4;
    const demonKey = this.issue._demonKey;
    const animKey = this.issue._demonAnimKey || `${demonKey}_idle`;
    const frame0Key = this.issue._demonFrame0Key || `${demonKey}_f0`;

    // Stage the sprite with placeholder y, then recompute after we know
    // the native frame height so the feet land on the floor line y=320.
    this.demon = this.add.sprite(620, 300, frame0Key)
      .setScale(demonScale)
      .setFlipX(true)
      .setAlpha(0);
    const nativeH = this.demon.height || 23;
    const spriteH = nativeH * demonScale;
    const demonY = 320 - spriteH * 0.5;
    this.demon.setY(demonY);
    this.demonGroundY = demonY;
    if (this.anims.exists(animKey)) this.demon.play(animKey);
  }

  createKnight() {
    // Knight - feet on ground line y=300
    this.knight = this.add.sprite(180, 280, 'char_idle').setScale(2.5).setAlpha(0).play('char_idle_anim');
  }

  // ═══════════════════════════════════════════════════
  //  ENTRANCE ANIMATION
  // ═══════════════════════════════════════════════════

  playEntranceAnimation() {
    SFX.play('encounterStart');
    // Knight slides in from left
    this.knight.setX(-60);

    this.tweens.add({
      targets: this.knight,
      x: 180,
      alpha: 1,
      duration: 700,
      ease: 'Back.easeOut',
      delay: 300
    });

    // Demon materializes with flash (scale to severity-based size)
    const finalDemonScale = this.demon.scaleX;
    this.demon.setScale(0.5);
    this.time.delayedCall(600, () => {
      this.cameras.main.flash(200, 80, 20, 20);
      this.tweens.add({
        targets: this.demon,
        alpha: 1,
        scaleX: finalDemonScale,
        scaleY: finalDemonScale,
        duration: 500,
        ease: 'Back.easeOut'
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  HP DISPLAYS
  // ═══════════════════════════════════════════════════

  createHPDisplays() {
    const sevHex = this.getSeverityHexColor();
    const sevColor = COLORS[this.issue.severity] || COLORS.red;

    // ── Demon HP (below demon sprite) ──
    const dp = { x: 510, y: 340, w: 260, h: 48 };

    const dPanel = this.add.graphics();
    // Glow behind panel
    dPanel.fillStyle(sevHex, 0.08);
    dPanel.fillRoundedRect(dp.x - 4, dp.y - 4, dp.w + 8, dp.h + 8, 8);
    // Panel bg
    dPanel.fillStyle(0x0a0a1a, 0.92);
    dPanel.fillRoundedRect(dp.x, dp.y, dp.w, dp.h, 5);
    dPanel.lineStyle(2, sevHex, 0.7);
    dPanel.strokeRoundedRect(dp.x, dp.y, dp.w, dp.h, 5);

    // Demon proper name (from the themed-assignment engine) with a
    // small uppercase tier annotation separated by a hyphen. The name
    // carries the personality; the tier annotation preserves severity
    // signal without stealing attention from the name.
    // Example: "CHIROT THE LAUGHING - MEDIUM"
    const properName = (this.issue._demonName || 'Unknown').toUpperCase();
    const tierWord = this.issue.severity.toUpperCase();
    const demonName = `${properName} - ${tierWord}`;
    this.add.text(dp.x + 10, dp.y + 6, demonName, {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '11px',
      color: sevColor,
      shadow: { offsetX: 0, offsetY: 0, color: sevColor === COLORS.red ? '#ff2040' : sevColor, blur: 8, fill: true },
      resolution: window.GAME_DPR
    });

    // HP bar
    const barX = dp.x + 10;
    const barY = dp.y + 26;
    const barW = dp.w - 70;
    const barH = 14;

    this.add.text(barX, barY, 'HP', {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '10px', color: '#606080', resolution: window.GAME_DPR
    });

    const barStartX = barX + 26;
    const actualBarW = barW - 26;

    const barFrame = this.add.graphics();
    barFrame.fillStyle(0x200808, 1);
    barFrame.fillRoundedRect(barStartX, barY, actualBarW, barH, 3);
    barFrame.lineStyle(1, 0x4a2020, 0.8);
    barFrame.strokeRoundedRect(barStartX, barY, actualBarW, barH, 3);

    this.demonHpBar = this.add.graphics();
    this.demonHpBarWidth = actualBarW - 4;
    this.demonHpBarX = barStartX + 2;
    this.demonHpBarY = barY + 2;
    this.demonHpBarH = barH - 4;
    this.drawDemonHpBar(1.0);

    this.demonHpShimmer = this.add.graphics();
    this.drawBarShimmer(this.demonHpShimmer, this.demonHpBarX, this.demonHpBarY, this.demonHpBarWidth, this.demonHpBarH);

    this.demonHpText = this.add.text(barStartX + actualBarW + 8, barY, `${this.demonHp}/${this.demonMaxHp}`, {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '11px',
      color: COLORS.red,
      shadow: { offsetX: 0, offsetY: 0, color: '#e04040', blur: 6, fill: true },
      resolution: window.GAME_DPR
    });

    // ── Knight HP (below knight sprite) ──
    const kp = { x: 30, y: 340, w: 260, h: 48 };

    const kPanel = this.add.graphics();
    // Glow behind panel
    kPanel.fillStyle(0x40c0c0, 0.06);
    kPanel.fillRoundedRect(kp.x - 4, kp.y - 4, kp.w + 8, kp.h + 8, 8);
    // Panel bg
    kPanel.fillStyle(0x0a0a1a, 0.92);
    kPanel.fillRoundedRect(kp.x, kp.y, kp.w, kp.h, 5);
    kPanel.lineStyle(2, 0x40c0c0, 0.6);
    kPanel.strokeRoundedRect(kp.x, kp.y, kp.w, kp.h, 5);

    const charNames = { 'opus': 'SEO WARRIOR', 'sonnet': 'SEO SAMURAI', 'haiku': 'SEO KNIGHT' };
    const charName = charNames[this.game.characterConfig?.model] || 'SEO WARRIOR';
    this.charName = charName;
    // Append the current domain after the class name as a reminder of
    // what we are hunting. Lowercase because URLs are canonically
    // lowercase and keeping the class uppercase preserves the visual
    // hierarchy: class first (loud), domain second (quieter). Example:
    //   "SEO WARRIOR - example.com"
    const domain = (this.game.domain || '').toLowerCase();
    const knightLabel = domain ? `${charName} - ${domain}` : charName;
    this.add.text(kp.x + 10, kp.y + 6, knightLabel, {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '11px',
      color: COLORS.cyan,
      shadow: { offsetX: 0, offsetY: 0, color: '#40c0c0', blur: 8, fill: true },
      resolution: window.GAME_DPR
    });

    const kBarX = kp.x + 10;
    const kBarY = kp.y + 26;
    const kBarW = kp.w - 70;
    const kBarH = 14;

    this.add.text(kBarX, kBarY, 'HP', {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '10px', color: '#606080', resolution: window.GAME_DPR
    });

    const kBarStartX = kBarX + 26;
    const kActualBarW = kBarW - 26;

    const kBarFrame = this.add.graphics();
    kBarFrame.fillStyle(0x082008, 1);
    kBarFrame.fillRoundedRect(kBarStartX, kBarY, kActualBarW, kBarH, 3);
    kBarFrame.lineStyle(1, 0x204a20, 0.8);
    kBarFrame.strokeRoundedRect(kBarStartX, kBarY, kActualBarW, kBarH, 3);

    this.knightHpBar = this.add.graphics();
    this.knightHpBarWidth = kActualBarW - 4;
    this.knightHpBarX = kBarStartX + 2;
    this.knightHpBarY = kBarY + 2;
    this.knightHpBarH = kBarH - 4;
    this.drawKnightHpBar(1.0);

    this.knightHpShimmer = this.add.graphics();
    this.drawBarShimmer(this.knightHpShimmer, this.knightHpBarX, this.knightHpBarY, this.knightHpBarWidth, this.knightHpBarH);

    this.knightHpText = this.add.text(kBarStartX + kActualBarW + 8, kBarY, `${this.knightHp}/100`, {
      fontFamily: '"JetBrains Mono", monospace', fontSize: '11px',
      color: COLORS.green,
      shadow: { offsetX: 0, offsetY: 0, color: '#40c040', blur: 6, fill: true },
      resolution: window.GAME_DPR
    });
  }

  drawDemonHpBar(pct) {
    this.demonHpBar.clear();
    if (pct <= 0) return;
    const w = this.demonHpBarWidth * pct;
    // Gradient effect: darker at bottom
    this.demonHpBar.fillStyle(0xe04040, 1);
    this.demonHpBar.fillRoundedRect(this.demonHpBarX, this.demonHpBarY, w, this.demonHpBarH, 1);
    // Lighter highlight on top half
    this.demonHpBar.fillStyle(0xff6060, 0.4);
    this.demonHpBar.fillRect(this.demonHpBarX, this.demonHpBarY, w, this.demonHpBarH / 2);
  }

  drawKnightHpBar(pct) {
    this.knightHpBar.clear();
    if (pct <= 0) return;
    const w = this.knightHpBarWidth * pct;
    this.knightHpBar.fillStyle(0x40c040, 1);
    this.knightHpBar.fillRoundedRect(this.knightHpBarX, this.knightHpBarY, w, this.knightHpBarH, 1);
    this.knightHpBar.fillStyle(0x70e070, 0.4);
    this.knightHpBar.fillRect(this.knightHpBarX, this.knightHpBarY, w, this.knightHpBarH / 2);
  }

  drawBarShimmer(gfx, x, y, w, h) {
    // Animated shimmer that sweeps across
    gfx.clear();
    gfx.fillStyle(0xffffff, 0.08);
    gfx.fillRect(x, y, w, 2);

    // Animate shimmer sweep
    const shimmerRect = this.add.rectangle(x - 20, y + h / 2, 20, h, 0xffffff, 0.15);
    shimmerRect.setOrigin(0, 0.5);
    this.tweens.add({
      targets: shimmerRect,
      x: x + w,
      duration: 2500,
      repeat: -1,
      delay: Phaser.Math.Between(0, 1000),
      ease: 'Linear',
      onUpdate: () => {
        if (shimmerRect.x < x || shimmerRect.x > x + w) {
          shimmerRect.setAlpha(0);
        } else {
          shimmerRect.setAlpha(0.15);
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════
  //  BATTLE LOG (FF-style, bottom-left)
  // ═══════════════════════════════════════════════════

  createBattleLog() {
    const logX = 16;
    const logY = 420;
    const logW = 530;
    const logH = 170;

    // Log panel with FF-style double border
    const logGfx = this.add.graphics();
    this.logGfx = logGfx;

    // Outer border - muted gold (content surface: parchment / lore)
    logGfx.lineStyle(2, 0x6a5a3a, 0.9);
    logGfx.strokeRoundedRect(logX, logY, logW, logH, 6);

    // Inner fill - near-black so narrator italic text glows unfought
    logGfx.fillStyle(0x060608, 0.96);
    logGfx.fillRoundedRect(logX + 2, logY + 2, logW - 4, logH - 4, 5);

    // Inner border highlight
    logGfx.lineStyle(1, 0x3a2a18, 0.7);
    logGfx.strokeRoundedRect(logX + 4, logY + 4, logW - 8, logH - 8, 4);

    // Corner accents - gold stamps
    logGfx.fillStyle(0xd4af37, 0.55);
    logGfx.fillRect(logX + 6, logY + 6, 3, 3);
    logGfx.fillRect(logX + logW - 9, logY + 6, 3, 3);
    logGfx.fillRect(logX + 6, logY + logH - 9, 3, 3);
    logGfx.fillRect(logX + logW - 9, logY + logH - 9, 3, 3);

    // Store log panel bounds for scrolling
    this.logBounds = { x: logX, y: logY, w: logW, h: logH };
    const textPadding = 14;
    this.logVisibleHeight = logH - textPadding * 2;
    this.logTextBaseY = logY + textPadding;

    // HTML overlay for battle log - supports colors and native scrolling
    this._battleLogEl = document.createElement('div');
    this._battleLogEl.id = 'battle-log-overlay';
    this._battleLogEl.style.cssText = `
      position: absolute; overflow-y: auto; overflow-x: hidden;
      font-family: monospace; font-size: 10px; color: #e0e0f0;
      line-height: 1.7; padding: 10px 12px; box-sizing: border-box;
      pointer-events: auto; z-index: 50;
      scrollbar-width: thin; scrollbar-color: #1e1e38 transparent;
    `;
    const container = document.getElementById('game-container');
    container.style.position = 'relative';
    container.appendChild(this._battleLogEl);

    // Position the HTML log to match the Phaser panel
    this._positionBattleLog = () => {
      const canvas = container.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scaleX = rect.width / 800;
      const scaleY = rect.height / 600;
      const offsetX = rect.left - containerRect.left;
      const offsetY = rect.top - containerRect.top;
      this._battleLogEl.style.left = (offsetX + logX * scaleX + 6) + 'px';
      this._battleLogEl.style.top = (offsetY + logY * scaleY + 6) + 'px';
      this._battleLogEl.style.width = ((logW - 12) * scaleX) + 'px';
      this._battleLogEl.style.height = ((logH - 12) * scaleY) + 'px';
      this._battleLogEl.style.fontSize = Math.max(10, Math.round(10 * scaleY)) + 'px';
    };
    this._positionBattleLog();
    this._battleLogResizeHandler = () => this._positionBattleLog();
    window.addEventListener('resize', this._battleLogResizeHandler);
    this._battleLogResizeObserver = new ResizeObserver(() => this._positionBattleLog());
    const canvasEl = container.querySelector('canvas');
    if (canvasEl) this._battleLogResizeObserver.observe(canvasEl);
    setTimeout(() => this._positionBattleLog(), 200);

    // Seed with the encounter message
    const encounterMsg = ENCOUNTER_MESSAGES[Math.floor(Math.random() * ENCOUNTER_MESSAGES.length)];
    this.appendLog(encounterMsg);

    const canvas = this.sys.game.canvas;
  }

  // ═══════════════════════════════════════════════════
  //  COMMAND MENU (FF-style, bottom-right)
  // ═══════════════════════════════════════════════════

  createCommandMenu() {
    const menuX = 558;
    const menuY = 420;
    const menuW = 226;
    const menuH = 170;

    // Menu panel with double border (FF style)
    const menuGfx = this.add.graphics();

    // Outer border - gold (interactive surface: "this is where you act")
    menuGfx.lineStyle(2, 0xd4af37, 0.95);
    menuGfx.strokeRoundedRect(menuX, menuY, menuW, menuH, 6);

    // Inner fill - keep the deep blue that signals "interactive menu"
    // distinct from the black content surfaces around it
    menuGfx.fillStyle(0x0c0c2e, 0.95);
    menuGfx.fillRoundedRect(menuX + 2, menuY + 2, menuW - 4, menuH - 4, 5);

    // Inner border highlight - brighter blue, reinforces interactivity
    menuGfx.lineStyle(1, 0x5a5a9e, 0.65);
    menuGfx.strokeRoundedRect(menuX + 4, menuY + 4, menuW - 8, menuH - 8, 4);

    // Corner accents (gold)
    menuGfx.fillStyle(0xf0c040, 0.8);
    menuGfx.fillRect(menuX + 6, menuY + 6, 4, 4);
    menuGfx.fillRect(menuX + menuW - 10, menuY + 6, 4, 4);
    menuGfx.fillRect(menuX + 6, menuY + menuH - 10, 4, 4);
    menuGfx.fillRect(menuX + menuW - 10, menuY + menuH - 10, 4, 4);

    const commands = [
      { label: 'ATTACK', icon: '\u2694', action: () => this.showAttackPrompt() },
      { label: 'VANQUISH', icon: '\u2620', action: () => this.doVanquish() },
      { label: 'DEFEND', icon: '\u26E8', action: () => this.doDefend() },
      { label: 'FLEE', icon: '\u21B6', action: () => this.doFlee() }
    ];

    this.menuItems = commands.map((cmd, i) => {
      const itemY = menuY + 18 + i * 28;
      const text = this.add.text(menuX + 40, itemY, cmd.label, {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '14px',
        color: COLORS.white,
        resolution: window.GAME_DPR
      }).setInteractive({ useHandCursor: true });

      // Icon
      this.add.text(menuX + 22, itemY, cmd.icon, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.gray,
        resolution: window.GAME_DPR
      });

      // Hover highlight zone (full row)
      const hitZone = this.add.rectangle(menuX + menuW / 2, itemY + 9, menuW - 16, 28, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });

      hitZone.on('pointerover', () => {
        if (this.isPlayerTurn && !this.battleOver) {
          this.selectMenuItem(i);
        }
      });

      hitZone.on('pointerdown', () => {
        if (this.isPlayerTurn && !this.battleOver) {
          this.selectMenuItem(i);
          cmd.action();
        }
      });

      text.on('pointerover', () => {
        if (this.isPlayerTurn && !this.battleOver) {
          this.selectMenuItem(i);
        }
      });

      text.on('pointerdown', () => {
        if (this.isPlayerTurn && !this.battleOver) {
          this.selectMenuItem(i);
          cmd.action();
        }
      });

      text._cmdAction = cmd.action;
      return text;
    });

    // Bouncing arrow cursor
    this.cursor = this.add.text(menuX + 8, menuY + 18, '\u25B6', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '12px',
      color: COLORS.gold,
      resolution: window.GAME_DPR
    });

    this.tweens.add({
      targets: this.cursor,
      x: menuX + 14,
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Command descriptions - shown below menu when hovering
    this.commandDescs = [
      'Talk to the agent. Describe what to fix or ask questions.',
      'Mark this demon defeated. Use when the issue is resolved.',
      'Brace for impact. The demon strikes back.',
      'Retreat to the dungeon hall. Issue stays unresolved.'
    ];
    this.menuTooltip = this.add.text(menuX + 12, menuY + menuH - 28, '', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '7px',
      color: '#6868a0',
      wordWrap: { width: menuW - 24 },
      align: 'left',
      lineSpacing: 2,
      resolution: window.GAME_DPR
    }).setOrigin(0, 0.5);

    this.selectMenuItem(0);
  }

  _disableMenu() {
    this.menuItems.forEach(item => {
      item.setColor('#404060');
      item.setScale(1.0);
    });
    if (this.cursor) this.cursor.setVisible(false);
    if (this.menuTooltip) this.menuTooltip.setVisible(false);
  }

  _enableMenu() {
    if (this.cursor) this.cursor.setVisible(true);
    if (this.menuTooltip) this.menuTooltip.setVisible(true);
    this.selectMenuItem(this.selectedMenuItem);
  }

  selectMenuItem(index) {
    SFX.play('menuHover');
    this.selectedMenuItem = index;
    this.menuItems.forEach((item, i) => {
      if (i === index) {
        item.setColor(COLORS.gold);
        item.setScale(1.05);
      } else {
        item.setColor(COLORS.white);
        item.setScale(1.0);
      }
    });
    // Update tooltip description
    if (this.menuTooltip && this.commandDescs) {
      this.menuTooltip.setText(this.commandDescs[index] || '');
    }
    // Move cursor
    const targetY = this.menuItems[index].y;
    this.cursor.y = targetY;
  }

  setupKeyboard() {
    this.input.keyboard.on('keydown-UP', () => {
      if (!this.isPlayerTurn || this.battleOver || this._attackOverlayOpen) return;
      this.selectMenuItem((this.selectedMenuItem - 1 + 4) % 4);
    });
    this.input.keyboard.on('keydown-DOWN', () => {
      if (!this.isPlayerTurn || this.battleOver || this._attackOverlayOpen) return;
      this.selectMenuItem((this.selectedMenuItem + 1) % 4);
    });
    this.input.keyboard.on('keydown-ENTER', () => {
      if (!this.isPlayerTurn || this.battleOver || this._attackOverlayOpen) return;
      this.menuItems[this.selectedMenuItem]._cmdAction();
    });
    this.input.keyboard.on('keydown-SPACE', () => {
      if (!this.isPlayerTurn || this.battleOver || this._attackOverlayOpen) return;
      this.menuItems[this.selectedMenuItem]._cmdAction();
    });
  }

  // ═══════════════════════════════════════════════════
  //  ISSUE DETAILS (very bottom strip)
  // ═══════════════════════════════════════════════════

  createIssueDetails() {
    const detX = 10;
    const detY = 6;
    const detW = 780;
    const pad = 10;

    // Category title - fantasy RPG style
    const catTitle = this.issue.category.toUpperCase();
    const catBadge = this.add.text(detX + pad, detY + pad - 2, catTitle, {
      fontFamily: '"Cinzel", "Palatino Linotype", "Book Antiqua", "Georgia", serif',
      fontSize: '16px',
      color: '#f0c848',
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: '#f0a020', blur: 12, fill: true },
      resolution: window.GAME_DPR
    }).setDepth(51);

    // Sweeping light shimmer across the title
    const shimmerBar = this.add.rectangle(detX - 20, detY + pad + 6, 20, 20, 0xffffff, 0.25).setDepth(52);
    const titleBounds = catBadge.getBounds();
    const shimmerMaskShape = this.make.graphics({ x: 0, y: 0, add: false });
    shimmerMaskShape.fillStyle(0xffffff);
    shimmerMaskShape.fillRect(titleBounds.x, titleBounds.y, titleBounds.width, titleBounds.height);
    shimmerBar.setMask(new Phaser.Display.Masks.GeometryMask(this, shimmerMaskShape));
    this.tweens.add({
      targets: shimmerBar,
      x: titleBounds.x + titleBounds.width + 30,
      duration: 2500,
      delay: 1000,
      repeat: -1,
      repeatDelay: 4000,
      ease: 'Sine.easeInOut'
    });

    // Description (full width, wraps)
    const descObj = this.add.text(detX + pad, detY + pad + 22, this.issue.description, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#b0b0c8',
      wordWrap: { width: detW - pad * 2 - 4 },
      lineSpacing: 2,
      resolution: window.GAME_DPR
    }).setDepth(51);

    // Dynamic height based on actual content
    const detH = pad + 22 + descObj.height + pad;

    // Draw panel background sized to fit - black content surface with
    // thin muted-gold border (parchment treatment, not blue chrome)
    const detGfx = this.add.graphics().setDepth(50);
    detGfx.fillStyle(0x060608, 0.94);
    detGfx.fillRoundedRect(detX, detY, detW, detH, 4);
    detGfx.lineStyle(1, 0x6a5a3a, 0.55);
    detGfx.strokeRoundedRect(detX, detY, detW, detH, 4);
  }

  createStreamText() {
    // Stream text for fix output - positioned in battle log area
    this.streamText = this.add.text(30, 460, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: COLORS.purple,
      wordWrap: { width: 500 },
      resolution: window.GAME_DPR
    }).setDepth(10);
  }

  // ═══════════════════════════════════════════════════
  //  BATTLE LOG HELPER
  // ═══════════════════════════════════════════════════

  setLog(msg) {
    this.appendLog(msg);
  }

  appendLog(msg) {
    this.battleLogHistory.push(msg);

    if (this._battleLogEl) {
      const line = document.createElement('div');
      line.style.marginBottom = '3px';

      if (msg.startsWith('> ')) {
        // User prompt - gold
        line.style.color = '#d4af37';
        line.style.fontWeight = 'bold';
        line.style.borderLeft = '2px solid rgba(212,175,55,0.5)';
        line.style.paddingLeft = '6px';
      } else if (msg.includes('channels') || msg.includes('braces')) {
        // Battle action - bright white
        line.style.color = '#f0f0ff';
        line.style.fontWeight = '600';
      } else if (/^(The demon|Demon deals|demon retaliates)/i.test(msg)) {
        // Demon action - only explicit demon turn messages, not narration
        line.style.color = '#e05050';
      } else if (msg.includes('VANQUISH') || msg.includes('VICTORY')) {
        // Victory - green-gold
        line.style.color = '#60dd60';
        line.style.fontWeight = 'bold';
      } else if (msg.includes('spell fizzles') || msg.startsWith('ERROR')) {
        // Actual errors - red
        line.style.color = '#e05050';
      } else if (msg.length > 60) {
        // Narration (long text from Haiku) - soft cyan
        line.style.color = '#88bbcc';
        line.style.fontStyle = 'italic';
      }

      line.textContent = msg;
      this._battleLogEl.appendChild(line);

      // Always scroll to bottom when new content arrives
      const el = this._battleLogEl;
      el.scrollTop = el.scrollHeight;
    }


    // Update big mode log if open
    this._updateBigModeLog();
  }

  // ═══════════════════════════════════════════════════
  //  BIG MODE (full-screen battle log overlay)
  // ═══════════════════════════════════════════════════

  _openBigMode() {
    if (this._bigModeOpen) return;
    this._bigModeOpen = true;
    SFX.play('logExpand');

    const container = document.getElementById('game-container');
    container.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.id = 'big-mode-overlay';

    const logContent = this.battleLogHistory.join('\n');

    overlay.innerHTML = `
      <div class="big-mode-backdrop"></div>
      <div class="big-mode-card">
        <div class="big-mode-header">
          <span class="big-mode-title">\u2694 BATTLE LOG</span>
          <button id="big-mode-close" class="big-mode-close-btn">CLOSE</button>
        </div>
        <div id="big-mode-log" class="big-mode-log">${this._escapeHtml(logContent)}</div>
        <div class="big-mode-input-area">
          <textarea id="big-mode-input" class="big-mode-input" rows="3"
            placeholder="Command the ${this.charName}..."></textarea>
          <div class="big-mode-buttons">
            <button id="big-mode-execute" class="big-mode-btn big-mode-execute-btn" style="opacity: 0.4; pointer-events: none;">EXECUTE</button>
          </div>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'big-mode-style';
    style.textContent = `
      #big-mode-overlay {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        pointer-events: none;
      }
      #big-mode-overlay > * { pointer-events: auto; }
      .big-mode-backdrop {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0, 0, 10, 0.82);
        pointer-events: auto;
      }
      .big-mode-card {
        position: relative;
        z-index: 1;
        background: #0a0a24;
        border: 2px solid #b8b8d8;
        border-radius: 8px;
        padding: 16px 20px;
        width: 90%;
        height: 80%;
        display: flex;
        flex-direction: column;
        box-shadow: 0 0 30px rgba(64, 128, 255, 0.3), inset 0 0 20px rgba(10, 10, 40, 0.5);
        font-family: "JetBrains Mono", monospace;
      }
      .big-mode-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        flex-shrink: 0;
      }
      .big-mode-title {
        color: #f0c040;
        font-size: 14px;
        font-weight: bold;
        text-shadow: 0 0 10px rgba(240, 192, 64, 0.5);
        letter-spacing: 2px;
      }
      .big-mode-close-btn {
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        font-weight: bold;
        padding: 4px 14px;
        border-radius: 4px;
        border: 1px solid #404060;
        background: #1a1020;
        color: #8080a0;
        cursor: pointer;
        letter-spacing: 1px;
        transition: all 0.15s;
      }
      .big-mode-close-btn:hover {
        color: #c0c0d0;
        border-color: #6060a0;
      }
      .big-mode-log {
        flex: 1;
        overflow-y: auto;
        background: #06061a;
        border: 1px solid #2a2a4e;
        border-radius: 4px;
        padding: 10px 12px;
        color: #c0c0e0;
        font-size: 11px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        scrollbar-width: thin;
        scrollbar-color: #3a3a6e #06061a;
        margin-bottom: 10px;
      }
      .big-mode-log::-webkit-scrollbar {
        width: 6px;
      }
      .big-mode-log::-webkit-scrollbar-track {
        background: #06061a;
      }
      .big-mode-log::-webkit-scrollbar-thumb {
        background: #3a3a6e;
        border-radius: 3px;
      }
      .big-mode-input-area {
        flex-shrink: 0;
      }
      .big-mode-input {
        width: 100%;
        box-sizing: border-box;
        background: #06061a;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
        color: #e0e0f0;
        font-family: "JetBrains Mono", monospace;
        font-size: 12px;
        padding: 8px 12px;
        resize: none;
        outline: none;
        line-height: 1.5;
      }
      .big-mode-input:focus {
        border-color: #6060c0;
        box-shadow: 0 0 8px rgba(96, 96, 192, 0.3);
      }
      .big-mode-input::placeholder {
        color: #404070;
      }
      .big-mode-buttons {
        display: flex;
        gap: 12px;
        margin-top: 10px;
        justify-content: center;
      }
      .big-mode-btn {
        font-family: "JetBrains Mono", monospace;
        font-size: 13px;
        font-weight: bold;
        padding: 8px 28px;
        border-radius: 4px;
        border: 2px solid;
        cursor: pointer;
        letter-spacing: 1px;
        transition: all 0.15s;
      }
      .big-mode-execute-btn {
        background: #182040;
        color: #f0c040;
        border-color: #f0c040;
      }
      .big-mode-execute-btn:hover {
        background: #283060;
        box-shadow: 0 0 12px rgba(240, 192, 64, 0.4);
      }
    `;

    container.appendChild(style);
    container.appendChild(overlay);

    // Position overlay to match the Phaser canvas
    const positionOverlay = () => {
      const canvas = container.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      overlay.style.top = (rect.top - containerRect.top) + 'px';
      overlay.style.left = (rect.left - containerRect.left) + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    };
    positionOverlay();
    this._bigModeResizeHandler = positionOverlay;
    window.addEventListener('resize', this._bigModeResizeHandler);
    setTimeout(positionOverlay, 100);

    // Auto-scroll log to bottom
    const logDiv = document.getElementById('big-mode-log');
    if (logDiv) {
      logDiv.scrollTop = logDiv.scrollHeight;
    }

    // Focus textarea
    const input = document.getElementById('big-mode-input');
    const executeBtn = document.getElementById('big-mode-execute');
    setTimeout(() => input && input.focus(), 50);

    // Enable/disable EXECUTE button based on textarea content
    if (input && executeBtn) {
      input.addEventListener('input', () => {
        const hasContent = input.value.trim().length > 0;
        executeBtn.style.opacity = hasContent ? '1' : '0.4';
        executeBtn.style.pointerEvents = hasContent ? 'auto' : 'none';
      });
    }

    // Execute handler
    const execute = () => {
      const userPrompt = (input ? input.value : '').trim();
      if (!userPrompt) return;
      this._closeBigMode();
      this.doAttack(userPrompt);
    };

    // Close handler
    const close = () => {
      this._closeBigMode();
    };

    document.getElementById('big-mode-execute').addEventListener('click', execute);
    document.getElementById('big-mode-close').addEventListener('click', close);

    // Keyboard: Enter (no shift) submits, Escape closes
    this._bigModeKeyHandler = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        execute();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', this._bigModeKeyHandler);

    // Store references for cleanup
    this._bigModeOverlayEl = overlay;
    this._bigModeStyleEl = style;
  }

  _closeBigMode() {
    SFX.play('logClose');
    this._bigModeOpen = false;
    if (this._bigModeOverlayEl) {
      this._bigModeOverlayEl.remove();
      this._bigModeOverlayEl = null;
    }
    if (this._bigModeStyleEl) {
      this._bigModeStyleEl.remove();
      this._bigModeStyleEl = null;
    }
    if (this._bigModeResizeHandler) {
      window.removeEventListener('resize', this._bigModeResizeHandler);
      this._bigModeResizeHandler = null;
    }
    if (this._bigModeKeyHandler) {
      document.removeEventListener('keydown', this._bigModeKeyHandler);
      this._bigModeKeyHandler = null;
    }
  }

  _updateBigModeLog() {
    if (!this._bigModeOpen) return;
    const logDiv = document.getElementById('big-mode-log');
    if (!logDiv) return;
    const wasAtBottom = logDiv.scrollTop + logDiv.clientHeight >= logDiv.scrollHeight - 10;
    logDiv.textContent = this.battleLogHistory.join('\n');
    if (wasAtBottom) {
      logDiv.scrollTop = logDiv.scrollHeight;
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════════════
  //  ATTACK PROMPT OVERLAY
  // ═══════════════════════════════════════════════════

  showAttackPrompt() {
    if (!this.isPlayerTurn || this.battleOver) return;
    SFX.play('menuConfirm');
    // Disable menu interaction while overlay is open
    this._attackOverlayOpen = true;
    this._createAttackOverlay();
  }

  _createAttackOverlay() {
    const container = document.getElementById('game-container');
    container.style.position = 'relative';

    // Determine character name from config
    const model = this.game?.characterConfig?.model || '';
    let characterName = 'WARRIOR'; // default
    if (model.includes('haiku')) {
      characterName = 'KNIGHT';
    } else if (model.includes('sonnet')) {
      characterName = 'SAMURAI';
    } else if (model.includes('opus')) {
      characterName = 'WARRIOR';
    }

    const overlay = document.createElement('div');
    overlay.id = 'attack-prompt-overlay';

    overlay.innerHTML = `
      <div class="attack-prompt-backdrop"></div>
      <div class="attack-prompt-box">
        <div class="attack-prompt-title">⚔ COMMAND THE ${characterName}</div>
        <div class="attack-prompt-issue">${this._escapeHtml(this.issue.title)}</div>
        <textarea id="attack-prompt-input" class="attack-prompt-input" rows="6"
          placeholder="Describe what you want the agent to fix..."></textarea>
        <div class="attack-prompt-buttons">
          <button id="attack-prompt-execute" class="attack-prompt-btn attack-prompt-execute" style="opacity: 0.4; pointer-events: none;">EXECUTE</button>
          <button id="attack-prompt-cancel" class="attack-prompt-btn attack-prompt-cancel">CANCEL</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'attack-prompt-style';
    style.textContent = `
      #attack-prompt-overlay {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        pointer-events: none;
      }
      #attack-prompt-overlay > * { pointer-events: auto; }
      .attack-prompt-backdrop {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: transparent;
        pointer-events: auto;
      }
      .attack-prompt-box {
        position: relative;
        z-index: 1;
        background: #0a0a24;
        border: 2px solid #b8b8d8;
        border-radius: 8px;
        padding: 20px 24px;
        width: 92%;
        max-width: 700px;
        box-shadow: 0 0 30px rgba(64, 128, 255, 0.3), inset 0 0 20px rgba(10, 10, 40, 0.5);
        font-family: "JetBrains Mono", monospace;
      }
      .attack-prompt-title {
        color: #f0c040;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        margin-bottom: 10px;
        text-shadow: 0 0 10px rgba(240, 192, 64, 0.5);
        letter-spacing: 2px;
      }
      .attack-prompt-issue {
        color: #8080b0;
        font-size: 11px;
        text-align: center;
        margin-bottom: 14px;
        padding: 6px 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid #2a2a4e;
        border-radius: 4px;
        line-height: 1.4;
      }
      .attack-prompt-input {
        width: 100%;
        box-sizing: border-box;
        background: #06061a;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
        color: #e0e0f0;
        font-family: "JetBrains Mono", monospace;
        font-size: 13px;
        padding: 10px 12px;
        resize: none;
        outline: none;
        line-height: 1.5;
        min-height: 150px;
        overflow-y: auto;
        scrollbar-width: none;
      }
      .attack-prompt-input::-webkit-scrollbar {
        width: 0;
      }
      .attack-prompt-input:focus {
        border-color: #6060c0;
        box-shadow: 0 0 8px rgba(96, 96, 192, 0.3);
      }
      .attack-prompt-input::placeholder {
        color: #404070;
      }
      .attack-prompt-buttons {
        display: flex;
        gap: 12px;
        margin-top: 14px;
        justify-content: center;
      }
      .attack-prompt-btn {
        font-family: "JetBrains Mono", monospace;
        font-size: 13px;
        font-weight: bold;
        padding: 8px 24px;
        border-radius: 4px;
        border: 2px solid;
        cursor: pointer;
        letter-spacing: 1px;
        transition: all 0.15s;
      }
      .attack-prompt-execute {
        background: #182040;
        color: #f0c040;
        border-color: #f0c040;
      }
      .attack-prompt-execute:hover {
        background: #283060;
        box-shadow: 0 0 12px rgba(240, 192, 64, 0.4);
      }
      .attack-prompt-cancel {
        background: #1a1020;
        color: #8080a0;
        border-color: #404060;
      }
      .attack-prompt-cancel:hover {
        color: #c0c0d0;
        border-color: #6060a0;
      }
    `;

    container.appendChild(style);
    container.appendChild(overlay);

    // Position overlay to match the Phaser canvas
    const positionOverlay = () => {
      const canvas = container.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      overlay.style.top = (rect.top - containerRect.top) + 'px';
      overlay.style.left = (rect.left - containerRect.left) + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    };
    positionOverlay();
    this._attackResizeHandler = positionOverlay;
    window.addEventListener('resize', this._attackResizeHandler);
    setTimeout(positionOverlay, 100);

    // Focus the input
    const input = document.getElementById('attack-prompt-input');
    const executeBtn = document.getElementById('attack-prompt-execute');
    setTimeout(() => input && input.focus(), 50);

    // Enable/disable EXECUTE button based on textarea content
    if (input && executeBtn) {
      input.addEventListener('input', () => {
        const hasContent = input.value.trim().length > 0;
        executeBtn.style.opacity = hasContent ? '1' : '0.4';
        executeBtn.style.pointerEvents = hasContent ? 'auto' : 'none';
      });
    }

    // Handlers
    const execute = () => {
      const userPrompt = (input ? input.value : '').trim();
      if (!userPrompt) return; // Don't execute with empty input
      this._removeAttackOverlay();
      this.doAttack(userPrompt);
    };

    const cancel = () => {
      this._removeAttackOverlay();
      // Return to menu, still player's turn
    };

    document.getElementById('attack-prompt-execute').addEventListener('click', execute);
    document.getElementById('attack-prompt-cancel').addEventListener('click', cancel);

    // Keyboard: Enter submits, Escape cancels
    this._attackKeyHandler = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        execute();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    document.addEventListener('keydown', this._attackKeyHandler);

    // Auto-cancel attack modal if user focuses the guild ledger input
    const ledgerInput = document.getElementById('log-input');
    if (ledgerInput) {
      this._ledgerFocusHandler = () => {
        if (this._attackOverlayOpen) cancel();
      };
      ledgerInput.addEventListener('focus', this._ledgerFocusHandler);
    }

    // Dark overlay at depth 49 - dims everything below
    this._attackDarkOverlay = this.add.rectangle(400, 300, 800, 600, 0x000010, 0.7).setDepth(49);
    // Boost battle log panel + graphics above the dark overlay
    if (this.logGfx) this.logGfx.setDepth(54);
    // Battle log is now HTML - raise its z-index
    if (this._battleLogEl) this._battleLogEl.style.zIndex = '10000';

    this._attackOverlayEl = overlay;
    this._attackStyleEl = style;
  }

  _removeAttackOverlay() {
    this._attackOverlayOpen = false;
    if (this._attackOverlayEl) {
      this._attackOverlayEl.remove();
      this._attackOverlayEl = null;
    }
    if (this._attackStyleEl) {
      this._attackStyleEl.remove();
      this._attackStyleEl = null;
    }
    if (this._attackResizeHandler) {
      window.removeEventListener('resize', this._attackResizeHandler);
      this._attackResizeHandler = null;
    }
    if (this._attackKeyHandler) {
      document.removeEventListener('keydown', this._attackKeyHandler);
      this._attackKeyHandler = null;
    }
    if (this._ledgerFocusHandler) {
      const ledgerInput = document.getElementById('log-input');
      if (ledgerInput) ledgerInput.removeEventListener('focus', this._ledgerFocusHandler);
      this._ledgerFocusHandler = null;
    }
    // Remove Phaser dark overlay and reset depths
    if (this._attackDarkOverlay) {
      this._attackDarkOverlay.destroy();
      this._attackDarkOverlay = null;
    }
    if (this.logGfx) this.logGfx.setDepth(0);
    if (this._battleLogEl) this._battleLogEl.style.zIndex = '50';
  }

  // ═══════════════════════════════════════════════════
  //  CHANNELING STATE (while Claude works)
  // ═══════════════════════════════════════════════════

  _startChanneling() {
    SFX.play('channelStart');
    // Blue tint pulsing on the knight
    this._channelingActive = true;
    this.knight.setTint(0x4080ff);
    this._channelingTintTween = this.tweens.add({
      targets: this.knight,
      alpha: { from: 1.0, to: 0.7 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Pulsing glow effect around the knight
    this._channelingGlow = this.add.ellipse(180, 280, 80, 90, 0x4080ff, 0.12).setDepth(0);
    this._channelingGlowTween = this.tweens.add({
      targets: this._channelingGlow,
      scaleX: 1.4,
      scaleY: 1.3,
      alpha: 0.03,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Floating "Channeling..." label above the knight
    this._channelingLabel = this.add.text(180, 200, 'Channeling', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '12px',
      color: '#80b0ff',
      shadow: { offsetX: 0, offsetY: 0, color: '#4080ff', blur: 12, fill: true, stroke: true },
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setDepth(20);

    // Float up and down
    this._channelingLabelTween = this.tweens.add({
      targets: this._channelingLabel,
      y: 190,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Animated dots
    this._channelingDots = 0;
    this._channelingTimer = this.time.addEvent({
      delay: 400,
      repeat: -1,
      callback: () => {
        if (!this._channelingActive || !this._channelingLabel) return;
        this._channelingDots = (this._channelingDots + 1) % 4;
        const dots = '.'.repeat(this._channelingDots);
        const pad = ' '.repeat(3 - this._channelingDots);
        this._channelingLabel.setText('Channeling' + dots + pad);
      }
    });
  }

  _stopChanneling() {
    this._channelingActive = false;
    // Clear tint and restore alpha
    this.knight.clearTint();
    this.knight.setAlpha(1);
    if (this._channelingTintTween) {
      this._channelingTintTween.stop();
      this._channelingTintTween = null;
    }
    // Remove glow
    if (this._channelingGlow) {
      if (this._channelingGlowTween) {
        this._channelingGlowTween.stop();
        this._channelingGlowTween = null;
      }
      this._channelingGlow.destroy();
      this._channelingGlow = null;
    }
    // Remove floating label
    if (this._channelingLabel) {
      if (this._channelingLabelTween) {
        this._channelingLabelTween.stop();
        this._channelingLabelTween = null;
      }
      this._channelingLabel.destroy();
      this._channelingLabel = null;
    }
    // Stop timer
    if (this._channelingTimer) {
      this._channelingTimer.remove(false);
      this._channelingTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════
  //  ATTACK
  // ═══════════════════════════════════════════════════

  async doAttack(userPrompt) {
    if (!this.isPlayerTurn || this.battleOver) return;
    this.isPlayerTurn = false;

    this.appendLog('> ' + userPrompt);
    if (this.game.addLog) this.game.addLog('> ' + userPrompt);
    this.appendLog(`${this.charName} channels the agent...`);
    if (this.game.addLog) this.game.addLog(`${this.charName} channels the agent...`);
    if (this.game.showLoading) this.game.showLoading();

    // 1. Disable menu and start channeling
    this._disableMenu();
    this._startChanneling();

    // 2. Send to Claude - pass the full demon (issue) object and the
    //    user's turn message as separate fields. The server builds a
    //    structured focus header so Claude always knows which demon we
    //    are fighting, regardless of how vague the user's message is.
    try {
      const model = this.game.characterConfig?.model;
      const rawLines = [];
      this._activeRequestId = bridge.requestId + 1;
      const result = await bridge.fix({
        issue: this.issue,
        userMessage: userPrompt,
      }, this.game.projectPath, (stream) => {
        const clean = stream.replace(/[\n\r]+/g, ' ').trim();
        if (clean.length > 0) {
          rawLines.push(clean);
          if (this.game.addLog) this.game.addLog(clean);
        }
      }, model);
      this._activeRequestId = null;

      // 3. Agent finished - stop channeling, THEN play the slash
      this._stopChanneling();
      SFX.play('channelComplete');
      this.streamText.setText('');

      await this.slashAnimation();

      // 4. Deal damage. Rules:
      //    - Every attack lands visible damage (min 1 HP). Fixes the bug
      //      where Math.floor rounded small demons' damage to zero.
      //    - Damage scales to max HP so a 100-HP boss and a 15-HP mook
      //      both feel like they're taking real hits.
      //    - HP has a HARD FLOOR at 15% of max (or 1, whichever is
      //      higher). Only VANQUISH can actually kill the demon.
      //    - If Claude actually edited files (fixData.fixed=true), the
      //      hit is stronger than a diagnostic question.
      //    - If the demon is at/near the floor, a flavor line prompts
      //      the player to VANQUISH.
      const fixData = result.data || result;
      const baseDamage = Math.max(1, Math.round(this.demonMaxHp * (0.12 + Math.random() * 0.06)));
      const effectiveDamage = fixData?.fixed ? Math.ceil(baseDamage * 1.25) : baseDamage;
      const floor = Math.max(1, Math.ceil(this.demonMaxHp * 0.15));
      const damage = Math.min(effectiveDamage, Math.max(0, this.demonHp - floor));
      if (damage > 0) {
        this.dealDamage(damage);
      } else if (this.demonHp <= floor) {
        // Demon is at the floor; let the player know only VANQUISH finishes it
        this.time.delayedCall(400, () => {
          if (this.game.addLog) this.game.addLog('The wound will not kill. VANQUISH to end it.');
        });
      }

      // Regeneration check: if the demon is bleeding out (<=30% HP), it
      // has a chance to steel itself and claw back some HP. Keeps the
      // fight tense without ever actually killing the player's progress.
      const regenThreshold = Math.ceil(this.demonMaxHp * 0.30);
      if (this.demonHp > 0 && this.demonHp <= regenThreshold && Math.random() < 0.40) {
        const regenAmount = Math.max(1, Math.ceil(this.demonMaxHp * (0.12 + Math.random() * 0.08)));
        const regen = Math.min(regenAmount, this.demonMaxHp - this.demonHp);
        if (regen > 0) {
          this.time.delayedCall(700, () => this.regenerateDemon(regen));
        }
      }

      const summary = (fixData && fixData.fixed)
        ? (fixData.summary || 'The agent made changes.')
        : (fixData?.summary || 'The agent analyzed the issue.');

      // 5. Narrate the attack via Haiku
      this._narrateAttack(rawLines, summary);

    } catch (err) {
      this._activeRequestId = null;
      this._stopChanneling();
      this.streamText.setText('');
      if (err.message === 'Cancelled by user') {
        SFX.play('spellFizzle');
        this.setLog(`${this.charName} breaks concentration. The spell dissipates.`);
        if (this.game.addLog) this.game.addLog('Cancelled.');
      } else {
        SFX.play('spellFizzle');
        this.setLog(`The spell fizzles... ${err.message || 'Connection error'}. Try again.`);
        if (this.game.addLog) this.game.addLog('Fix error: ' + (err.message || 'unknown'));
      }
    }

    // Turn returns to player - re-enable menu
    if (this.game.hideLoading) this.game.hideLoading();
    this._hasAttacked = true;
    this.isPlayerTurn = true;
    this._enableMenu();
  }

  _narrateAttack(rawLines, fallbackSummary) {
    // Use the demon's proper name from the roster (e.g. "Chirot the
    // Laughing") as primary identity, with the issue title providing
    // the concrete subject matter of the attack. Previously the
    // narrator only knew the issue title, which flattened every
    // demon into whatever SEO concept it was embodying.
    const demonName = this.issue._demonName || this.issue.title;
    const issueTitle = this.issue.title;
    const charName = this.charName;
    const severity = this.issue.severity;
    const condensed = rawLines.slice(-15).join('\n');

    const prompt = `You are the narrator of a dark fantasy dungeon crawler. The warrior "${charName}" just attacked the demon ${demonName} - a being whose essence is the flaw "${issueTitle}" (severity: ${severity}). Below is what actually happened during the attack - technical SEO actions performed by Claude. Write 2-3 short, grim sentences narrating this as a battle action. Refer to the demon by name when natural. Stay relevant to the actual work described. No humor, no corniness. Dark, terse, atmospheric. Like a Souls game narrator. Do NOT use markdown. Plain text only.

What happened:
${condensed}

Summary: ${fallbackSummary}`;

    bridge.narrate(prompt).then(result => {
      const text = typeof result === 'string' ? result
        : (result?.data?.raw || result?.data?.result || result?.raw || fallbackSummary);
      // Extract clean text from Claude's response
      const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[*#`]/g, '').trim();
      const narration = clean.split('\n').filter(l => l.trim()).slice(0, 4).join(' ');
      this.setLog(narration || `${charName} strikes! ${fallbackSummary}`);
    }).catch(() => {
      this.setLog(`${charName} strikes! ${fallbackSummary} Attack again or VANQUISH when done.`);
    });
  }

  async slashAnimation() {
    return new Promise(resolve => {
      // Play attack animation
      this.knight.play('char_attack_anim');

      // Knight lunges forward dramatically
      this.tweens.add({
        targets: this.knight,
        x: '+=120',
        duration: 180,
        ease: 'Power3',
        onComplete: () => {
          // Screen flash
          this.cameras.main.flash(150, 255, 255, 255, true);
          SFX.play('swordSlash');

          // Multiple slash lines
          const dy = this.demon.y;
          this.createSlashEffect(620, dy, 0);
          this.time.delayedCall(60, () => this.createSlashEffect(620, dy, -30));
          this.time.delayedCall(120, () => this.createSlashEffect(620, dy, 30));

          // Hit particles
          this.createHitParticles(620, dy, 0xffffff);
          this.createHitParticles(620, dy, this.getSeverityHexColor());

          // Demon knockback + red flash
          this.demon.setTint(0xff0000);
          this.cameras.main.shake(200, 0.015);

          this.tweens.add({
            targets: this.demon,
            x: 620,
            duration: 80,
            yoyo: true,
            ease: 'Power2',
            onComplete: () => {
              this.time.delayedCall(100, () => this.demon.clearTint());
            }
          });

          // Knight returns
          this.time.delayedCall(200, () => {
            this.tweens.add({
              targets: this.knight,
              x: '-=120',
              duration: 300,
              ease: 'Power2',
              onComplete: () => {
                this.knight.play('char_idle_anim');
                resolve();
              }
            });
          });
        }
      });
    });
  }

  createSlashEffect(x, y, angleOffset) {
    const slash = this.add.graphics();
    slash.lineStyle(3, 0xffffff, 0.9);

    const startAngle = (-45 + angleOffset) * Math.PI / 180;
    const endAngle = (45 + angleOffset) * Math.PI / 180;
    const radius = 50;

    slash.beginPath();
    slash.moveTo(
      x + Math.cos(startAngle) * radius,
      y + Math.sin(startAngle) * radius
    );

    // Draw arc-like slash
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const angle = startAngle + (endAngle - startAngle) * t;
      const r = radius + Math.sin(t * Math.PI) * 20;
      slash.lineTo(
        x + Math.cos(angle) * r,
        y + Math.sin(angle) * r
      );
    }
    slash.strokePath();

    // Glow line
    slash.lineStyle(6, 0xffffff, 0.3);
    slash.beginPath();
    slash.moveTo(
      x + Math.cos(startAngle) * radius,
      y + Math.sin(startAngle) * radius
    );
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const angle = startAngle + (endAngle - startAngle) * t;
      const r = radius + Math.sin(t * Math.PI) * 20;
      slash.lineTo(
        x + Math.cos(angle) * r,
        y + Math.sin(angle) * r
      );
    }
    slash.strokePath();

    // Fade and destroy
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 250,
      onComplete: () => slash.destroy()
    });
  }

  createHitParticles(x, y, color) {
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const speed = Phaser.Math.Between(60, 180);
      const size = Phaser.Math.Between(2, 6);

      const particle = this.add.rectangle(
        x + Phaser.Math.Between(-10, 10),
        y + Phaser.Math.Between(-10, 10),
        size, size, color, 1
      );

      this.tweens.add({
        targets: particle,
        x: particle.x + Math.cos(angle) * speed,
        y: particle.y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: Phaser.Math.Between(300, 600),
        ease: 'Power2',
        onComplete: () => particle.destroy()
      });
    }
  }

  // ═══════════════════════════════════════════════════
  //  DAMAGE DEALING
  // ═══════════════════════════════════════════════════

  dealDamage(amount) {
    this.demonHp = Math.max(0, this.demonHp - amount);
    SFX.play('hit');
    const pct = this.demonHp / this.demonMaxHp;

    // Animate HP bar smoothly
    this.tweens.addCounter({
      from: (this.demonHp + amount) / this.demonMaxHp,
      to: pct,
      duration: 600,
      ease: 'Power2',
      onUpdate: (tween) => {
        this.drawDemonHpBar(tween.getValue());
      }
    });

    // Damage number - dramatic float with scale
    const dmgText = this.add.text(620, 200, `-${amount}`, {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '22px',
      color: '#ff4040',
      stroke: '#000000',
      strokeThickness: 4,
      resolution: window.GAME_DPR
    }).setOrigin(0.5).setScale(0.3);

    // Scale up, then float up and fade
    this.tweens.add({
      targets: dmgText,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 150,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: dmgText,
          y: 140,
          scaleX: 1.0,
          scaleY: 1.0,
          alpha: 0,
          duration: 900,
          ease: 'Power1',
          onComplete: () => dmgText.destroy()
        });
      }
    });

    this.demonHpText.setText(`${this.demonHp}/${this.demonMaxHp}`);

    // Demon red flash
    this.demon.setTint(0xff0000);
    this.time.delayedCall(200, () => {
      this.demon.setTint(0xff4444);
      this.time.delayedCall(100, () => this.demon.clearTint());
    });

    // Screen shake on hit
    this.cameras.main.shake(150, 0.01);

    // Red flash overlay
    const redFlash = this.add.rectangle(620, this.demon.y, 120, 120, 0xff0000, 0.3);
    this.tweens.add({
      targets: redFlash,
      alpha: 0,
      duration: 200,
      onComplete: () => redFlash.destroy()
    });

    // Hit particles
    this.createHitParticles(620, this.demon.y, 0xff4040);
  }

  /**
   * Demon steels itself against its wounds and claws back HP. Fires
   * probabilistically when the demon drops below 30% HP so the player
   * feels the fight push back without ever being forced to kill it
   * before they're ready.
   */
  regenerateDemon(amount) {
    if (amount <= 0) return;
    const before = this.demonHp;
    this.demonHp = Math.min(this.demonMaxHp, this.demonHp + amount);
    const actual = this.demonHp - before;
    if (actual <= 0) return;
    SFX.play('summoningPulse');
    const pct = this.demonHp / this.demonMaxHp;

    // Reverse bar animation - HP fills back up
    this.tweens.addCounter({
      from: before / this.demonMaxHp,
      to: pct,
      duration: 700,
      ease: 'Power2',
      onUpdate: (tween) => this.drawDemonHpBar(tween.getValue()),
    });

    // Green regen number float
    const regenText = this.add.text(620, 200, `+${actual}`, {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '20px', color: '#60e060',
      stroke: '#000000', strokeThickness: 4,
      resolution: window.GAME_DPR,
    }).setOrigin(0.5).setScale(0.3);
    this.tweens.add({
      targets: regenText, scaleX: 1.3, scaleY: 1.3, duration: 140, ease: 'Back.easeOut',
      onComplete: () => this.tweens.add({
        targets: regenText, y: 140, scaleX: 1.0, scaleY: 1.0, alpha: 0,
        duration: 900, ease: 'Power1', onComplete: () => regenText.destroy(),
      }),
    });

    // Brief green pulse on the demon sprite
    this.demon.setTint(0x40c060);
    this.time.delayedCall(220, () => {
      this.demon.setTint(0x60d080);
      this.time.delayedCall(160, () => this.demon.clearTint());
    });

    this.demonHpText.setText(`${this.demonHp}/${this.demonMaxHp}`);

    // Gothic flavor line in the battle log so the player sees it
    const demonName = this.issue._demonName || this.issue.title || 'demon';
    const flavors = [
      `The ${demonName} steels itself against the wound.`,
      `The ${demonName} gathers its strength. The bleeding slows.`,
      `The ${demonName} refuses to fall. Its wounds close.`,
      `The ${demonName} draws breath from the dark. +${actual} HP.`,
      `Something holds the ${demonName} upright. +${actual} HP.`,
      `The ${demonName} is not yet ready to die.`,
    ];
    const line = flavors[Math.floor(Math.random() * flavors.length)];
    this.appendLog(line);
    if (this.game.addLog) this.game.addLog(`${demonName} regenerates ${actual} HP.`);
  }

  // ═══════════════════════════════════════════════════
  //  DEMON TURN
  // ═══════════════════════════════════════════════════

  demonTurn() {
    if (this.battleOver) return;

    this.setLog('The demon retaliates!');

    // Demon lunge attack
    SFX.play('demonAttack');
    this.tweens.add({
      targets: this.demon,
      x: 380,
      duration: 250,
      ease: 'Power3',
      onComplete: () => {
        SFX.play('takeDamage');
        const damage = Phaser.Math.Between(3, 8);
        this.knightHp = Math.max(0, this.knightHp - damage);
        const pct = this.knightHp / 100;

        // Screen flash
        this.cameras.main.flash(80, 100, 20, 20);

        // Knight knockback
        this.tweens.add({
          targets: this.knight,
          x: '-=20',
          duration: 80,
          yoyo: true,
          ease: 'Power2'
        });

        // Knight hit animation then return to idle
        this.knight.play('char_hit_anim');
        this.knight.once('animationcomplete', () => {
          this.knight.play('char_idle_anim');
        });

        // Knight red flash
        this.knight.setTint(0xff4444);
        this.time.delayedCall(200, () => this.knight.clearTint());

        // Update HP bar smoothly
        this.tweens.addCounter({
          from: (this.knightHp + damage) / 100,
          to: pct,
          duration: 400,
          ease: 'Power2',
          onUpdate: (tween) => {
            this.drawKnightHpBar(tween.getValue());
          }
        });

        this.knightHpText.setText(`${this.knightHp}/100`);

        // Damage popup on knight
        const dmgText = this.add.text(180, 280, `-${damage}`, {
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '18px',
          color: '#ff8040',
          stroke: '#000000',
          strokeThickness: 3,
          resolution: window.GAME_DPR
        }).setOrigin(0.5).setScale(0.3);

        this.tweens.add({
          targets: dmgText,
          scaleX: 1.2,
          scaleY: 1.2,
          duration: 120,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: dmgText,
              y: 240,
              scaleX: 0.8,
              scaleY: 0.8,
              alpha: 0,
              duration: 700,
              onComplete: () => dmgText.destroy()
            });
          }
        });

        // Hit particles on knight
        this.createHitParticles(180, 320, 0xff8040);

        // Demon returns
        this.tweens.add({
          targets: this.demon,
          x: 620,
          duration: 400,
          ease: 'Power2',
          delay: 150,
          onComplete: () => {
            if (this.knightHp <= 0) {
              SFX.play('defeat');
              this.battleOver = true;
              this._disableMenu();
              this.setLog(`The ${this.charName} falls! Retreating to regroup...`);
              if (this.game.addLog) this.game.addLog('Defeated! Retreating...');
              this.time.delayedCall(1500, () => {
                this.cameras.main.fadeOut(800, 0, 0, 0);
                this.time.delayedCall(800, () => {
                  this.scene.start('DungeonHall');
                });
              });
            } else {
              this.setLog(`Demon deals ${damage} damage! Your turn. Command the ${this.charName} again...`);
              this.isPlayerTurn = true;
              this._enableMenu();
            }
          }
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════
  //  VANQUISH - instant kill, only the player decides when
  // ═══════════════════════════════════════════════════

  doVanquish() {
    if (!this.isPlayerTurn || this.battleOver) return;
    this.isPlayerTurn = false;
    this._disableMenu();
    SFX.play('vanquish');

    this.setLog(`\u2694 EXECUTION STRIKE! The ${this.charName} delivers the final blow!`);

    // Dramatic pause - knight glows gold before the strike
    this.knight.setTint(0xf0c040);
    this.cameras.main.flash(150, 60, 40, 10);

    // Charge-up particles around knight
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const p = this.add.circle(
        180 + Math.cos(angle) * 60,
        280 + Math.sin(angle) * 60,
        3, 0xf0c040, 0.8
      ).setDepth(20);
      this.tweens.add({
        targets: p,
        x: 180, y: 280, alpha: 0,
        duration: 500, delay: i * 30,
        ease: 'Power2',
        onComplete: () => p.destroy()
      });
    }

    // After charge-up, unleash the strike
    this.time.delayedCall(600, () => {
      this.knight.clearTint();
      this.knight.play('char_attack_anim');

      // Screen shake + massive flash
      this.cameras.main.shake(600, 0.05);
      this.cameras.main.flash(500, 255, 255, 255);

      // Knight lunges forward dramatically
      this.tweens.add({
        targets: this.knight,
        x: '+=220',
        duration: 150,
        ease: 'Power4',
        onComplete: () => {
          // Impact flash
          this.cameras.main.flash(300, 255, 200, 100);

          // Multiple slash effects (5 slashes for the killing blow)
          const dy = this.demon.y;
          this.createSlashEffect(620, dy, 0);
          this.time.delayedCall(60, () => this.createSlashEffect(620, dy, -40));
          this.time.delayedCall(120, () => this.createSlashEffect(620, dy, 40));
          this.time.delayedCall(180, () => this.createSlashEffect(620, dy, -20));
          this.time.delayedCall(240, () => this.createSlashEffect(620, dy, 20));

          // Massive hit particles (3 bursts)
          this.createHitParticles(620, dy, 0xffffff);
          this.createHitParticles(620, dy, 0xf0c040);
          this.createHitParticles(620, dy, 0xff4040);

          // Demon recoils hard
          this.demon.setTint(0xff0000);
          this.tweens.add({
            targets: this.demon,
            x: 680, duration: 100, yoyo: true, ease: 'Power2'
          });

          // Set HP to 0
          this.demonHp = 0;
          this.drawDemonHpBar(0);
          this.demonHpText.setText(`0/${this.demonMaxHp}`);

          // Knight returns to position
          this.tweens.add({
            targets: this.knight,
            x: 180, duration: 400, ease: 'Power2', delay: 300,
            onComplete: () => this.knight.play('char_idle_anim')
          });

          // Trigger the full defeat spectacle
          this.time.delayedCall(800, () => {
            this.demonDefeated();
          });
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  DEFEND - brace for impact, demon gets a free hit
  // ═══════════════════════════════════════════════════

  doDefend() {
    if (!this.isPlayerTurn || this.battleOver) return;
    this.isPlayerTurn = false;
    SFX.play('defend');

    this.setLog(`${this.charName} braces for impact!`);
    this._disableMenu();

    // Knight raises guard - blue tint pulses
    this.knight.setTint(0x40c0f0);

    // Hexagonal shield materializes in front of knight
    const shieldX = 220, shieldY = 280;
    const shieldGfx = this.add.graphics().setDepth(15);

    // Draw layered hex shield
    const drawHexShield = (gfx, cx, cy, radius, color, alpha, lineW) => {
      gfx.lineStyle(lineW, color, alpha);
      gfx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) gfx.moveTo(px, py);
        else gfx.lineTo(px, py);
      }
      gfx.strokePath();
    };

    // Outer hex
    drawHexShield(shieldGfx, shieldX, shieldY, 45, 0x40c0f0, 0.7, 3);
    // Inner hex
    drawHexShield(shieldGfx, shieldX, shieldY, 32, 0x80e0ff, 0.4, 2);
    // Core hex
    drawHexShield(shieldGfx, shieldX, shieldY, 18, 0xb0f0ff, 0.3, 1);

    // Shield fill glow
    shieldGfx.fillStyle(0x40c0f0, 0.08);
    shieldGfx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const px = shieldX + Math.cos(angle) * 45;
      const py = shieldY + Math.sin(angle) * 45;
      if (i === 0) shieldGfx.moveTo(px, py);
      else shieldGfx.lineTo(px, py);
    }
    shieldGfx.fillPath();

    // Shield materializes - scale from 0
    shieldGfx.setScale(0);
    SFX.play('shieldBlock');
    this.tweens.add({
      targets: shieldGfx,
      scaleX: 1, scaleY: 1,
      duration: 250,
      ease: 'Back.easeOut'
    });

    // Orbiting energy particles around the shield
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const orbitR = 55;
      const p = this.add.circle(
        shieldX + Math.cos(angle) * orbitR,
        shieldY + Math.sin(angle) * orbitR,
        2, 0x80e0ff, 0.8
      ).setDepth(16);

      this.tweens.add({
        targets: p,
        x: shieldX + Math.cos(angle + Math.PI) * (orbitR * 0.3),
        y: shieldY + Math.sin(angle + Math.PI) * (orbitR * 0.3),
        alpha: 0,
        duration: 600,
        delay: i * 40,
        ease: 'Power2',
        onComplete: () => p.destroy()
      });
    }

    // Shield pulse effect
    this.tweens.add({
      targets: shieldGfx,
      alpha: 0.5,
      duration: 200,
      yoyo: true,
      repeat: 1,
      delay: 300
    });

    // Shield fades after holding
    this.tweens.add({
      targets: shieldGfx,
      alpha: 0, scaleX: 1.2, scaleY: 1.2,
      duration: 400,
      delay: 700,
      ease: 'Power2',
      onComplete: () => shieldGfx.destroy()
    });

    // Knight clears tint after shield fades
    this.time.delayedCall(600, () => this.knight.clearTint());

    // Demon counterattacks after the shield holds
    this.time.delayedCall(1000, () => this.demonTurn());
  }

  // ═══════════════════════════════════════════════════
  //  INSPECT
  // ═══════════════════════════════════════════════════

  doInspect() {
    if (!this.isPlayerTurn || this.battleOver) return;

    this.setLog(`[${this.issue.category}] ${this.issue.description} | Severity: ${this.issue.severity} | HP: ${this.demonHp}/${this.demonMaxHp}`);

    // Flash demon with info color
    this.demon.setTint(0x4080e0);
    this.time.delayedCall(400, () => this.demon.clearTint());

    // Inspect scanning ring
    const scanRing = this.add.graphics();
    scanRing.lineStyle(2, 0x4080e0, 0.7);
    scanRing.strokeCircle(620, this.demon.y, 30);
    this.tweens.add({
      targets: scanRing,
      scaleX: 2.5,
      scaleY: 2.5,
      alpha: 0,
      duration: 700,
      ease: 'Power1',
      onComplete: () => scanRing.destroy()
    });

    // Inspect eye particles
    for (let i = 0; i < 8; i++) {
      const p = this.add.circle(
        620 + Phaser.Math.Between(-40, 40),
        240 + Phaser.Math.Between(-40, 40),
        3, 0x4080e0, 0.7
      );
      this.tweens.add({
        targets: p,
        alpha: 0,
        scaleX: 3,
        scaleY: 3,
        duration: 600,
        delay: i * 60,
        onComplete: () => p.destroy()
      });
    }
  }

  // ═══════════════════════════════════════════════════
  //  FLEE
  // ═══════════════════════════════════════════════════

  doFlee() {
    if (!this.isPlayerTurn || this.battleOver) return;
    this.isPlayerTurn = false;
    this.battleOver = true;
    SFX.play('flee');

    this.setLog('You retreat from battle...');
    this._disableMenu();

    // Knight turns and runs off screen left
    this.knight.setFlipX(true);
    this.knight.play('char_run_anim');

    this.tweens.add({
      targets: this.knight,
      x: -100,
      duration: 800,
      ease: 'Power1'
    });

    this.cameras.main.fadeOut(1000, 0, 0, 0);
    this.time.delayedCall(1000, () => {
      this.scene.start('DungeonHall');
    });
  }

  // ═══════════════════════════════════════════════════
  //  DEMON DEFEATED
  // ═══════════════════════════════════════════════════

  demonDefeated() {
    this.battleOver = true;

    // Mark issue as defeated in game data and persist to cache
    this.issue.defeated = true;
    this._persistProgress();

    this.setLog(VICTORY_MESSAGES[Math.floor(Math.random() * VICTORY_MESSAGES.length)]);

    // Big screen flash
    this.cameras.main.flash(600, 255, 220, 80);
    this.cameras.main.shake(400, 0.025);

    // Explosion particles burst (3 waves)
    const colors = [0xffffff, 0xff4040, 0xf0c040, 0xff8040, this.getSeverityHexColor()];
    for (let wave = 0; wave < 3; wave++) {
      this.time.delayedCall(wave * 150, () => {
        for (let i = 0; i < 24; i++) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const speed = Phaser.Math.Between(80, 260);
          const color = Phaser.Utils.Array.GetRandom(colors);
          const size = Phaser.Math.Between(2, 8);

          const p = this.add.rectangle(
            620 + Phaser.Math.Between(-15, 15),
            this.demon.y + Phaser.Math.Between(-15, 15),
            size, size, color, 1
          ).setDepth(20);

          this.tweens.add({
            targets: p,
            x: p.x + Math.cos(angle) * speed,
            y: p.y + Math.sin(angle) * speed - 30,
            alpha: 0,
            scaleX: 0.1,
            scaleY: 0.1,
            duration: Phaser.Math.Between(400, 900),
            ease: 'Power2',
            onComplete: () => p.destroy()
          });
        }
      });
    }

    // Expanding white ring explosion
    for (let r = 0; r < 3; r++) {
      this.time.delayedCall(r * 120, () => {
        const ring = this.add.graphics().setDepth(19);
        ring.lineStyle(3 - r, 0xffffff, 0.7 - r * 0.2);
        ring.strokeCircle(620, this.demonGroundY, 20);
        this.tweens.add({
          targets: ring,
          scaleX: 4 + r,
          scaleY: 4 + r,
          alpha: 0,
          duration: 600,
          ease: 'Power1',
          onComplete: () => ring.destroy()
        });
      });
    }

    // Demon dissolve - flicker then shrink
    this.tweens.add({
      targets: this.demon,
      alpha: 0.5,
      duration: 100,
      yoyo: true,
      repeat: 4,
      onComplete: () => {
        // Final dissolve
        this.tweens.add({
          targets: this.demon,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 4,
          y: 300,
          duration: 800,
          ease: 'Power3'
        });
      }
    });

    // Second screen flash for extra drama
    this.time.delayedCall(600, () => {
      this.cameras.main.flash(200, 255, 200, 100);
    });

    // Victory flash
    this.time.delayedCall(1500, () => {
      this.cameras.main.flash(300, 255, 255, 200);

      // Victory text
      const victoryText = this.add.text(400, 200, 'VICTORY!', {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '32px',
        color: COLORS.gold,
        stroke: '#000000',
        strokeThickness: 6,
        resolution: window.GAME_DPR
      }).setOrigin(0.5).setScale(0.1).setDepth(30);

      this.tweens.add({
        targets: victoryText,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 400,
        ease: 'Back.easeOut'
      });

      // Sparkle particles around victory text
      for (let i = 0; i < 10; i++) {
        this.time.delayedCall(i * 80, () => {
          const spark = this.add.rectangle(
            400 + Phaser.Math.Between(-120, 120),
            200 + Phaser.Math.Between(-30, 30),
            3, 3, 0xf0c040, 1
          ).setDepth(31);
          this.tweens.add({
            targets: spark,
            alpha: 0,
            scaleX: 0.1,
            scaleY: 0.1,
            y: spark.y - Phaser.Math.Between(20, 50),
            duration: 500,
            onComplete: () => spark.destroy()
          });
        });
      }
    });

    // Log XP to guild ledger, then go straight back to DungeonHall
    const xp = (this.issue.hp || 10) * 10;
    this.time.delayedCall(2000, () => {
      if (this.game.addLog) this.game.addLog(`Demon vanquished! +${xp} XP`);
      this.appendLog(`+${xp} XP earned.`);
    });

    this.time.delayedCall(3000, () => {
      this.cameras.main.fadeOut(800, 0, 0, 0);
      this.time.delayedCall(800, () => {
        this.scene.start('DungeonHall');
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════

  getSeverityHexColor() {
    const map = {
      critical: 0xff2040,
      high: 0xe06020,
      medium: 0xf0c040,
      low: 0x40c040,
      info: 0x4080e0
    };
    return map[this.issue.severity] || 0xe04040;
  }

  // Clean up HTML overlays on scene shutdown
  shutdown() {
    this._removeAttackOverlay();
    this._closeBigMode();
    this._stopChanneling();
    // Clean up HTML battle log
    if (this._battleLogEl) {
      this._battleLogEl.remove();
      this._battleLogEl = null;
    }
    if (this._battleLogResizeHandler) {
      window.removeEventListener('resize', this._battleLogResizeHandler);
      this._battleLogResizeHandler = null;
    }
    if (this._battleLogResizeObserver) {
      this._battleLogResizeObserver.disconnect();
      this._battleLogResizeObserver = null;
    }
  }

  /**
   * Persist current audit progress (defeated demons) back to localStorage
   * so "Continue Quest" on the Gate screen reflects actual progress.
   */
  _persistProgress() {
    try {
      const modelKey = this.game.characterConfig?.model;
      if (!modelKey || !this.game.domain || !this.game.auditData) return;
      const cacheKey = `seo_dungeon_audit_${this.game.domain}_${modelKey}`;
      localStorage.setItem(cacheKey, JSON.stringify({
        domain: this.game.domain,
        model: modelKey,
        timestamp: Date.now(),
        auditData: this.game.auditData
      }));
    } catch (_) { /* localStorage full or unavailable */ }
  }
}
