import { COLORS, FONTS } from '../utils/colors.js';
import { bridge } from '../utils/ws.js';
import { SFX } from '../utils/sound-manager.js';

/**
 * Title screen - clean retro design with domain + project path inputs.
 * HTML inputs are positioned inside the game container for proper scaling.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    const cx = 400, cy = 300;

    this.cameras.main.setBackgroundColor(0x0a0a1a);
    this.cameras.main.fadeIn(800, 0, 0, 0);

    // ── Title ──
    this.add.text(cx, 70, 'SEO', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '36px',
      color: '#d4af37'
    }).setOrigin(0.5);

    this.add.text(cx, 120, 'D U N G E O N', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '16px',
      color: '#c04040'
    }).setOrigin(0.5);

    // ── Knight ──
    this.add.image(cx, 200, 'knight').setScale(2.2);

    // ── Subtle tagline ──
    this.add.text(cx, 275, 'Slay your SEO demons, one by one.', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#606080'
    }).setOrigin(0.5);

    // ── Form area ──
    // Domain label
    this.add.text(cx, 320, 'DOMAIN', {
      fontFamily: 'monospace', fontSize: '11px', color: '#808090',
      letterSpacing: 2
    }).setOrigin(0.5);

    // Project label
    this.add.text(cx, 400, 'PROJECT FOLDER', {
      fontFamily: 'monospace', fontSize: '11px', color: '#808090',
      letterSpacing: 2
    }).setOrigin(0.5);

    // Safety note
    this.add.text(cx, 490, 'Fixes are applied on a new git branch.', {
      fontFamily: 'monospace', fontSize: '11px', color: '#404058'
    }).setOrigin(0.5);
    this.add.text(cx, 505, 'Your main branch is never touched.', {
      fontFamily: 'monospace', fontSize: '11px', color: '#404058'
    }).setOrigin(0.5);

    // ── HTML Inputs (inside game container) ──
    this.htmlElements = [];
    this.createInputs();

    // ── Connection status ──
    this.statusText = this.add.text(cx, 570, 'Connecting...', {
      fontFamily: 'monospace', fontSize: '11px', color: '#505060'
    }).setOrigin(0.5);

    // Atmosphere
    this.addAtmosphere();
    this.connectToBridge();
  }

  createInputs() {
    const container = document.getElementById('game-container');
    const canvas = container.querySelector('canvas');

    // We need to position inputs relative to the canvas
    // Use a wrapper div inside game-container
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'absolute',
      top: '0', left: '0', right: '0', bottom: '0',
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    });
    container.style.position = 'relative';
    container.appendChild(wrapper);

    const inputStyle = {
      width: '320px',
      padding: '10px 16px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '15px',
      color: '#d4af37',
      backgroundColor: '#12122a',
      border: '1px solid #2a2a4e',
      borderRadius: '4px',
      textAlign: 'center',
      outline: 'none',
      pointerEvents: 'auto',
      transition: 'border-color 0.2s'
    };

    // Domain input
    const domainInput = document.createElement('input');
    domainInput.type = 'text';
    domainInput.value = 'seodungeon.com';
    domainInput.placeholder = 'example.com';
    domainInput.autocomplete = 'off';
    Object.assign(domainInput.style, {
      ...inputStyle,
      marginTop: '120px'
    });
    domainInput.addEventListener('focus', () => domainInput.style.borderColor = '#d4af37');
    domainInput.addEventListener('blur', () => domainInput.style.borderColor = '#2a2a4e');
    wrapper.appendChild(domainInput);
    this.domainInput = domainInput;

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.height = '38px';
    wrapper.appendChild(spacer);

    // Path input
    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.value = 'D:\\seodungeon';
    pathInput.placeholder = '/path/to/your/project';
    pathInput.autocomplete = 'off';
    Object.assign(pathInput.style, {
      ...inputStyle,
      color: '#5cb8c8',
      fontSize: '13px'
    });
    pathInput.addEventListener('focus', () => pathInput.style.borderColor = '#5cb8c8');
    pathInput.addEventListener('blur', () => pathInput.style.borderColor = '#2a2a4e');
    wrapper.appendChild(pathInput);
    this.pathInput = pathInput;

    // Spacer
    const spacer2 = document.createElement('div');
    spacer2.style.height = '50px';
    wrapper.appendChild(spacer2);

    // Descend button
    const btn = document.createElement('button');
    btn.textContent = 'DESCEND INTO THE DUNGEON';
    Object.assign(btn.style, {
      padding: '12px 36px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '14px',
      fontWeight: '600',
      color: '#0a0a1a',
      backgroundColor: '#d4af37',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      pointerEvents: 'auto',
      letterSpacing: '2px',
      transition: 'background-color 0.2s, transform 0.1s'
    });
    btn.addEventListener('mouseenter', () => btn.style.backgroundColor = '#e0c050');
    btn.addEventListener('mouseleave', () => btn.style.backgroundColor = '#d4af37');
    btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.97)');
    btn.addEventListener('mouseup', () => btn.style.transform = 'scale(1)');

    const launch = () => {
      if (domainInput.value.trim() && pathInput.value.trim()) {
        SFX.play('menuConfirm');
        this.launchAudit(domainInput.value.trim(), pathInput.value.trim());
      }
    };
    btn.addEventListener('click', launch);
    domainInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch(); });
    pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch(); });
    wrapper.appendChild(btn);

    this.htmlElements = [wrapper];

    // Clean up on scene shutdown
    this.events.on('shutdown', () => {
      wrapper.remove();
    });

    this.time.delayedCall(300, () => domainInput.focus());
  }

  async connectToBridge() {
    try {
      await bridge.connect();
      this.statusText.setText('Bridge connected - ready for battle');
      this.statusText.setColor('#50a050');
    } catch (err) {
      this.statusText.setText('Bridge offline - start server first');
      this.statusText.setColor('#a05050');
    }
  }

  launchAudit(domain, projectPath) {
    this.htmlElements.forEach(el => el.remove());
    this.game.domain = domain;
    this.game.projectPath = projectPath;

    SFX.play('sceneTransition');
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.time.delayedCall(600, () => {
      this.scene.start('Summoning', { domain, projectPath });
    });
  }

  addAtmosphere() {
    for (let i = 0; i < 15; i++) {
      const x = Phaser.Math.Between(50, 750);
      const y = Phaser.Math.Between(50, 550);
      const dot = this.add.circle(x, y, 1, 0x303050, 0.4);
      this.tweens.add({
        targets: dot,
        y: y - Phaser.Math.Between(30, 100),
        alpha: 0,
        duration: Phaser.Math.Between(4000, 8000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000)
      });
    }
  }
}
