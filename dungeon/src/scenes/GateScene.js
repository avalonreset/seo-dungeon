import { CHARACTERS } from '../knight-sprite.js';
import { SFX } from '../utils/sound-manager.js';
import { getProfileKey, getProfileLabel, getSelectedRuntime } from '../profile-config.js';

// Lookup: profile ID -> character key.
const PROFILE_TO_CHAR = {};
for (const [charKey, cfg] of Object.entries(CHARACTERS)) {
  PROFILE_TO_CHAR[cfg.profile] = charKey;
}

/**
 * GateScene - "Choose your path" checkpoint between Boot and Summoning.
 * Checks localStorage for cached audit data and presents continue/restart options.
 * If no cached data exists, auto-transitions to Summoning after a brief pause.
 *
 * Text is rendered as an HTML overlay for native-resolution font quality,
 * matching the Guild Ledger's JetBrains Mono rendering.
 */
export class GateScene extends Phaser.Scene {
  constructor() {
    super('Gate');
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
    this.cameras.main.fadeIn(600, 0, 0, 0);

    // Show volume control on this scene, hide on exit
    const sfxEl = document.getElementById('sfx-control');
    if (sfxEl) sfxEl.style.display = 'flex';
    this.events.once('shutdown', () => { if (sfxEl) sfxEl.style.display = 'none'; });

    // Only check cache for the selected character/profile.
    const currentProfile = getProfileKey(
      this.game.characterConfig?.profile || this.game.characterConfig?.model
    );
    const runtime = this.game.characterConfig?.runtime || getSelectedRuntime();
    const profileLabels = {
      deep:     { key: 'deep',     color: '#d4af37', charName: 'Warrior' },
      balanced: { key: 'balanced', color: '#88bbff', charName: 'Samurai' },
      fast:     { key: 'fast',     color: '#66ddaa', charName: 'Knight' }
    };
    this.selectedModel = {
      ...(profileLabels[currentProfile] || profileLabels.balanced),
      ...getProfileLabel(currentProfile, runtime),
    };

    const cacheKey = `seo_dungeon_audit_${this.domain}_${runtime}_${this.selectedModel.key}`;
    const legacyCurrentProfileKey = `seo_dungeon_audit_${this.domain}_${this.selectedModel.key}`;

    // Check cache for selected runtime/profile.
    this.cachedRun = null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.auditData) {
          this.cachedRun = parsed;
        }
      }
    } catch (_) {}

    // Legacy cache migration
    if (!this.cachedRun) {
      try {
        const legacyProfileKeys = {
          deep: 'opus',
          balanced: 'sonnet',
          fast: 'haiku'
        };
        const candidates = [
          legacyCurrentProfileKey,
          `seo_dungeon_audit_${this.domain}_${legacyProfileKeys[currentProfile]}`,
          `seo_dungeon_audit_${this.domain}`
        ].filter(Boolean);

        for (const legacyKey of candidates) {
          const legacyRaw = localStorage.getItem(legacyKey);
          if (!legacyRaw) continue;
          const legacy = JSON.parse(legacyRaw);
          if (legacy && legacy.auditData) {
            const migrated = { ...legacy, profile: currentProfile, model: currentProfile, runtime };
            localStorage.setItem(
              cacheKey,
              JSON.stringify(migrated)
            );
            if (!legacy.model && !legacy.profile) {
              localStorage.removeItem(`seo_dungeon_audit_${this.domain}`);
            }
            this.cachedRun = migrated;
            break;
          }
        }
      } catch (_) {}
    }

    // No cached data for this profile - skip straight to Summoning.
    if (!this.cachedRun) {
      this._drawBackground(W, H);
      this.time.delayedCall(400, () => {
        SFX.play('doorOpen');
        SFX.play('sceneTransition');
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.time.delayedCall(400, () => {
          this.scene.start('Summoning', {
            domain: this.domain,
            projectPath: this.projectPath
          });
        });
      });
      return;
    }

    // ── Cached data exists - show choice screen ──────────────────
    this._drawBackground(W, H);
    this._createEmbers(W, H);
    this._createAbandonScroll(W);
    this._drawVignette(W, H);

    // ── Character sprite (idle with periodic attack flourish) ─────
    const cfg = this.game.characterConfig;
    const feetY = cfg.runGroundY || cfg.groundY;
    const originY = feetY / cfg.frameH;
    this.knight = this.add.sprite(cx, H * 0.54, 'char_idle')
      .setOrigin(0.5, originY)
      .setScale(2.5)
      .setDepth(10)
      .play('char_idle_anim');

    // Build pool of available flourish animations for this character
    const flourishAnims = ['char_attack_anim'];
    if (cfg.extraAnims) {
      for (const anim of cfg.extraAnims) {
        flourishAnims.push(anim.key + '_anim');
      }
    }

    // Animation cycle: idle -> (maybe flip) -> idle hold -> flourish -> idle -> repeat.
    // When _idleCyclePaused is true (user is engaging a card), the cycle
    // stops touching facing/flourishes so it can't override a deliberate
    // user-directed turn toward Continue Quest (left) or New Quest (right).
    let lastAnim = '';
    this._idleCyclePaused = false;

    const runCycle = () => {
      if (!this.knight || !this.knight.active) return;
      if (this._idleCyclePaused) {
        // User is hovering or clicking something - don't touch facing.
        // Re-check periodically in case they lose interest.
        this.time.delayedCall(500, runCycle);
        return;
      }
      if (Math.random() > 0.5) {
        this.knight.setFlipX(!this.knight.flipX);
      }
      const idleHold = 1000 + Math.random() * 1000;
      this.time.delayedCall(idleHold, () => {
        if (!this.knight || !this.knight.active) return;
        if (this._idleCyclePaused) {
          this.time.delayedCall(500, runCycle);
          return;
        }
        let pick;
        do {
          pick = flourishAnims[Math.floor(Math.random() * flourishAnims.length)];
        } while (pick === lastAnim && flourishAnims.length > 1);
        lastAnim = pick;
        this.knight.play(pick);
        this.knight.once('animationcomplete', () => {
          if (!this.knight || !this.knight.active) return;
          this.knight.play('char_idle_anim');
          const restDelay = 3000 + Math.random() * 3000;
          this.time.delayedCall(restDelay, runCycle);
        });
      });
    };

    this.time.delayedCall(2000 + Math.random() * 2000, runCycle);

    // ── HTML Overlay for text ────────────────────────────────────
    this._createHTMLOverlay();
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  _createHTMLOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'gate-overlay';

    const m = this.selectedModel;
    const cached = this.cachedRun;

    // Single column for the selected character
    const ts = cached.timestamp;
    const dateStr = ts ? new Date(ts).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }) : 'Unknown';
    const timeAgo = ts ? this._timeAgo(ts) : '';
    const issues = cached.auditData.issues || [];
    const remaining = Array.isArray(issues) ? issues.filter(i => !i.defeated && !i.fixed).length : 0;
    const total = issues.length;
    const defeated = total - remaining;

    overlay.innerHTML = `
      <div class="gate-title">THE GATE AWAITS</div>
      <div class="gate-domain">${this._escapeHtml(this.domain)}</div>
      <div class="gate-row">
        <div class="gate-card gate-card-continue" data-model="${m.key}" data-action="resume" style="--accent: ${m.color};">
          <div class="gate-card-label" style="color: ${m.color};">Continue Quest</div>
          <div class="gate-card-time dim">${timeAgo} &middot; ${dateStr}</div>
          <div class="gate-card-stat">
            <span class="stat-demons">${remaining} demons remain</span>
            ${defeated > 0 ? `<span class="stat-slain">${defeated} of ${total} slain</span>` : ''}
          </div>
        </div>
        <div class="gate-center-spacer">
          <div class="gate-col-name" style="color: ${m.color};">${m.charName}</div>
          <div class="gate-col-model" style="color: ${m.color}; border-color: ${m.color}40;">${m.label}</div>
        </div>
        <div class="gate-card gate-card-new" data-model="${m.key}" data-action="rerun" style="--accent: ${m.color};">
          <div class="gate-card-label gate-card-label-new">New Quest</div>
          <div class="gate-card-sub dim">Abandon progress.<br>Descend anew.</div>
        </div>
      </div>
      <div class="gate-return" id="gate-rune">Return to the Guild Hall</div>
    `;

    const style = document.createElement('style');
    style.id = 'gate-overlay-style';
    style.textContent = `
      #gate-overlay {
        position: absolute;
        pointer-events: none;
        font-family: 'JetBrains Mono', monospace;
        z-index: 10;
        box-sizing: border-box;
      }
      #gate-overlay > * { pointer-events: auto; }

      .gate-title {
        position: absolute;
        top: 4%;
        left: 0; right: 0;
        text-align: center;
        font-size: clamp(14px, 2.8vw, 22px);
        font-weight: 600;
        color: #d4af37;
        letter-spacing: 8px;
        text-shadow: 0 0 40px rgba(212, 175, 55, 0.15);
      }
      .gate-domain {
        position: absolute;
        top: 9%;
        left: 0; right: 0;
        text-align: center;
        font-size: clamp(10px, 1.6vw, 13px);
        color: #88bbff;
      }

      .gate-row {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 18px;
        width: 88%;
        max-width: 720px;
      }

      .gate-center-spacer {
        flex: 0 0 180px;
        text-align: center;
        pointer-events: none;
        padding-top: 190px;
      }
      .gate-col-name {
        font-size: clamp(14px, 2vw, 20px);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 2px;
      }
      .gate-col-model {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 3px;
        text-transform: uppercase;
        border: 1.5px solid;
        border-radius: 4px;
        padding: 2px 10px;
        display: inline-block;
      }

      .gate-card {
        flex: 1;
        min-height: 120px;
        padding: 18px 16px;
        background: rgba(6, 6, 9, 0.90);
        border-radius: 6px;
        cursor: pointer;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.15s;
      }
      .gate-card:hover { transform: translateY(-2px); }
      .gate-card:active { transform: translateY(0); }

      .gate-card-continue {
        border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
      }
      .gate-card-continue:hover {
        border-color: var(--accent);
        background: rgba(12, 10, 8, 0.95);
        box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 12%, transparent);
      }

      .gate-card-new {
        border: 1px solid #2a1818;
      }
      .gate-card-new:hover {
        border-color: #cc4444;
        background: rgba(28, 14, 14, 0.92);
        box-shadow: 0 0 16px rgba(204, 68, 68, 0.06);
      }

      .gate-card-begin {
        border: 1.5px dashed color-mix(in srgb, var(--accent) 22%, transparent);
      }
      .gate-card-begin:hover {
        border-style: solid;
        border-color: var(--accent);
        background: rgba(12, 10, 8, 0.95);
        box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 12%, transparent);
      }

      .gate-card-label {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .gate-card-label-new { color: #aa5555; }
      .gate-card-sub {
        font-size: 12px;
        line-height: 1.5;
        color: #808098;
      }

      .gate-return {
        position: absolute;
        bottom: 6%;
        left: 50%;
        transform: translateX(-50%);
        padding: 8px 28px;
        font-size: clamp(10px, 1.3vw, 12px);
        color: #505068;
        letter-spacing: 2px;
        cursor: pointer;
        border: 1px solid #1a1710;
        border-radius: 4px;
        transition: color 0.2s, border-color 0.2s;
        pointer-events: auto;
        white-space: nowrap;
      }
      .gate-return:hover {
        color: #9090a8;
        border-color: #3a3a50;
      }
      .gate-card-time {
        font-size: 12px;
        margin-bottom: 6px;
        color: #808098;
      }
      .gate-card-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .stat-demons { color: #dd4444; font-size: 14px; font-weight: 600; }
      .stat-slain { color: #606078; font-size: 12px; }

      .dim { color: #606078; }

      /* removed old gate-rune - replaced by gate-return */
    `;

    const container = document.getElementById('game-container');
    container.style.position = 'relative';
    container.appendChild(style);
    container.appendChild(overlay);

    // Position overlay to match the Phaser canvas (letterboxed with Scale.FIT)
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
    this._resizeHandler = positionOverlay;
    window.addEventListener('resize', this._resizeHandler);
    // ResizeObserver catches zoom changes that resize doesn't
    this._resizeObserver = new ResizeObserver(positionOverlay);
    const canvas = container.querySelector('canvas');
    if (canvas) this._resizeObserver.observe(canvas);
    setTimeout(positionOverlay, 100);
    setTimeout(positionOverlay, 500);

    // ── Click handlers ──

    // Hover sounds on all interactive cards, plus character-facing preview:
    // when the user hovers left card -> knight faces left, right card ->
    // right. Pauses the random idle flip so the preview sticks. Works for
    // warrior/samurai/knight identically - all LuizMelo sprites face right
    // natively, so setFlipX(true) = face left regardless of class.
    overlay.querySelectorAll('.gate-card').forEach(card => {
      card.addEventListener('mouseenter', () => SFX.play('menuHover'));
    });
    overlay.querySelectorAll('[data-action="resume"]').forEach(card => {
      card.addEventListener('mouseenter', () => this._faceKnight('left'));
      card.addEventListener('mouseleave', () => { this._idleCyclePaused = false; });
    });
    overlay.querySelectorAll('[data-action="rerun"]').forEach(card => {
      card.addEventListener('mouseenter', () => this._faceKnight('right'));
      card.addEventListener('mouseleave', () => { this._idleCyclePaused = false; });
    });

    // Resume (continue cached quest) - knight faces LEFT toward the card
    overlay.querySelectorAll('[data-action="resume"]').forEach(card => {
      card.addEventListener('click', () => this.resumeCachedQuest());
    });

    // Re-run (wipe cache, run fresh) - knight faces RIGHT toward the card
    overlay.querySelectorAll('[data-action="rerun"]').forEach(card => {
      card.addEventListener('click', () => this.startFreshQuest());
    });

    // Abandon (return to title)
    const runeEl = document.getElementById('gate-rune');
    runeEl.addEventListener('mouseenter', () => SFX.play('menuHover'));
    runeEl.addEventListener('click', () => this.returnToTitleScreen());

    this._overlayEl = overlay;
    this._styleEl = style;
  }

  resumeCachedQuest() {
    if (!this.cachedRun?.auditData) {
      throw new Error('No cached quest is available to resume.');
    }
    SFX.play('menuConfirm');
    this._faceKnight('left');
    this.game.auditData = this.cachedRun.auditData;
    SFX.play('doorOpen');
    SFX.play('sceneTransition');
    this._transitionOut(() => {
      this.scene.start('DungeonHall', {
        domain: this.domain,
        projectPath: this.projectPath
      });
    });
    return true;
  }

  startFreshQuest() {
    SFX.play('menuConfirm');
    this._faceKnight('right');
    try {
      const runtime = this.game.characterConfig?.runtime || getSelectedRuntime();
      localStorage.removeItem(`seo_dungeon_audit_${this.domain}_${runtime}_${this.selectedModel.key}`);
      localStorage.removeItem(`seo_dungeon_audit_${this.domain}_${this.selectedModel.key}`);
    } catch (_) {}
    SFX.play('sceneTransition');
    this._transitionOut(() => {
      this.scene.start('Summoning', {
        domain: this.domain,
        projectPath: this.projectPath
      });
    });
    return true;
  }

  returnToTitleScreen() {
    SFX.play('menuConfirm');
    if (this.game.addLog) this.game.addLog('The link is severed.');
    SFX.play('sceneTransition');
    this._transitionOut(() => {
      window.returnToTitle();
    });
    return true;
  }

  /**
   * Switch to a different character/profile and navigate to a destination scene.
   * If the profile matches the currently loaded character, go directly.
   * If different, swap the full character config and restart Boot to reload sprites.
   */
  _switchCharacterAndGo(profileKey, destScene, destData = {}) {
    const currentProfile = getProfileKey(
      this.game.characterConfig?.profile || this.game.characterConfig?.model
    );
    const nextProfile = getProfileKey(profileKey);
    const needsReload = nextProfile !== currentProfile;

    if (needsReload) {
      // Look up the full character config for this profile.
      const charKey = PROFILE_TO_CHAR[nextProfile];
      if (charKey && CHARACTERS[charKey]) {
        this.game.characterConfig = { ...CHARACTERS[charKey], runtime: this.game.characterConfig?.runtime || getSelectedRuntime() };
      } else {
        this.game.characterConfig.profile = nextProfile;
        this.game.characterConfig.runtime = this.game.characterConfig?.runtime || getSelectedRuntime();
      }

      // Set pending destination so Boot knows where to go after reloading sprites
      this.game.pendingDestination = { scene: destScene, data: destData };

      this._removeOverlay();
      SFX.play('sceneTransition');
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this._scheduleSceneDelay(400, () => {
        this.scene.start('Boot');
      });
    } else {
      // Same character - go directly, no reload needed
      this._removeOverlay();
      SFX.play('doorOpen');
      SFX.play('sceneTransition');
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this._scheduleSceneDelay(500, () => {
        this.scene.start(destScene, {
          domain: this.domain,
          projectPath: this.projectPath,
          ...destData
        });
      });
    }
  }

  /**
   * Point the knight sprite at a given direction. Pauses the random
   * idle-flip cycle so the deliberate turn stays put until the cycle
   * is resumed (mouseleave) or the scene transitions away. Works for
   * warrior / samurai / knight - every LuizMelo class ships facing
   * right natively, so setFlipX(true) is always "face left."
   *
   * @param {'left' | 'right'} direction
   */
  _faceKnight(direction) {
    if (!this.knight || !this.knight.active) return;
    this._idleCyclePaused = true;
    if (direction === 'left') this.knight.setFlipX(true);
    else if (direction === 'right') this.knight.setFlipX(false);
  }

  _scheduleSceneDelay(delay, callback) {
    let fired = false;
    let timer = null;
    let fallbackId = null;
    const run = () => {
      if (fired) return;
      fired = true;
      if (fallbackId != null) window.clearTimeout(fallbackId);
      if (timer?.remove) timer.remove(false);
      callback();
    };
    timer = this.time.delayedCall(delay, run);
    fallbackId = window.setTimeout(run, delay + 300);
  }

  _transitionOut(callback) {
    if (!this._overlayEl) { callback(); return; }
    // Make sure the random idle cycle can't override the deliberate
    // facing set by the card click during the slash animation.
    this._idleCyclePaused = true;

    // Stagger-fade all cards and interactive elements
    const cards = this._overlayEl.querySelectorAll('.gate-card, .gate-return, .gate-title, .gate-domain, .gate-center-spacer');
    cards.forEach((el, i) => {
      el.style.transition = `opacity 0.3s ease-in ${i * 0.05}s, transform 0.3s ease-in ${i * 0.05}s`;
      el.style.opacity = '0';
      el.style.transform = 'scale(0.92) translateY(6px)';
    });

    // Knight does a little flourish
    if (this.knight && this.knight.active) {
      this.knight.play('char_attack_anim');
      this.knight.once('animationcomplete', () => {
        if (this.knight && this.knight.active) this.knight.play('char_idle_anim');
      });
    }

    // After cards vanish, fade the overlay background and fire callback
    const totalDelay = Math.min(cards.length * 50 + 300, 600);
    this._scheduleSceneDelay(totalDelay, () => {
      if (this._overlayEl) {
        this._overlayEl.style.transition = 'opacity 0.3s ease-in';
        this._overlayEl.style.opacity = '0';
      }
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this._scheduleSceneDelay(500, () => {
        this._removeOverlay();
        callback();
      });
    });
  }

  _removeOverlay() {
    if (this._overlayEl) this._overlayEl.remove();
    if (this._styleEl) this._styleEl.remove();
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  // Clean up on scene shutdown
  shutdown() {
    this._removeOverlay();
  }

  // ── Dark gradient background ───────────────────────────────────
  _drawBackground(W, H) {
    const bg = this.add.graphics().setDepth(0);
    const steps = 32;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Math.floor(5 + t * 8);
      const g = Math.floor(5 + t * 5);
      const b = Math.floor(15 + t * 10);
      const color = (r << 16) | (g << 8) | b;
      const y = (i / steps) * H;
      const h = H / steps + 1;
      bg.fillStyle(color, 1);
      bg.fillRect(0, y, W, h);
    }
  }

  // ── Drifting ember particles ───────────────────────────────────
  _createEmbers(W, H) {
    const gfx = this.add.graphics();
    gfx.fillStyle(0xffaa44, 1);
    gfx.fillCircle(4, 4, 3);
    gfx.fillStyle(0xff6622, 0.6);
    gfx.fillCircle(4, 4, 2);
    gfx.generateTexture('gate_ember', 8, 8);
    gfx.destroy();

    this.embers = [];
    for (let i = 0; i < 30; i++) {
      const ember = this.add.image(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H),
        'gate_ember'
      )
        .setScale(Phaser.Math.FloatBetween(0.15, 0.5))
        .setAlpha(Phaser.Math.FloatBetween(0.1, 0.4))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(5);

      ember._vx = Phaser.Math.FloatBetween(-8, 8);
      ember._vy = Phaser.Math.FloatBetween(-25, -8);
      ember._flickerSpeed = Phaser.Math.FloatBetween(0.002, 0.006);
      ember._baseAlpha = ember.alpha;
      this.embers.push(ember);
    }
  }

  // ── Vignette overlay ───────────────────────────────────────────
  _drawVignette(W, H) {
    const v = this.add.graphics().setDepth(40);
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.7, 0.7, 0, 0);
    v.fillRect(0, 0, W, 80);
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.8, 0.8);
    v.fillRect(0, H - 80, W, 80);
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.5, 0, 0, 0.5);
    v.fillRect(0, 0, 60, H);
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.5, 0.5, 0);
    v.fillRect(W - 60, 0, 60, H);
  }

  // ── Abandon Scroll Rune (Phaser, fallback - not used when HTML overlay active)
  _createAbandonScroll() {
    // Handled by HTML overlay rune instead
  }

  update(time) {
    if (!this.embers) return;
    for (const ember of this.embers) {
      ember.x += ember._vx * 0.016;
      ember.y += ember._vy * 0.016;
      ember.alpha = ember._baseAlpha + Math.sin(time * ember._flickerSpeed) * 0.15;
      if (ember.y < -10) {
        ember.y = 610;
        ember.x = Phaser.Math.Between(0, 800);
      }
      if (ember.x < -10) ember.x = 810;
      if (ember.x > 810) ember.x = -10;
    }
  }
}
