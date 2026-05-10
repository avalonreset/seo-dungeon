# SEO Dungeon

## How to Run the Game

This is a gamified 16-bit dungeon crawler for SEO audits. To start it:

```bash
cd dungeon
npm install        # First time only
npm start          # Builds optimized bundle + starts bridge + serves game
```

Then open http://localhost:3000 in a browser. The game auto-builds the production
bundle on first run. Bridge server starts on port 3001 automatically.

For development with hot reload: `npm run dev` (instead of `npm start`).

This project is ALSO a Claude Code skill suite. The SEO skills work without the
game. Users can run `/seo audit <url>` directly in Claude Code after running the
installer (`install.sh` or `install.ps1`).

## Project Overview

A gamified 16-bit dungeon crawler that turns SEO audits into boss battles.
Built with Phaser.js and powered by Claude Code's SEO analysis pipeline (v1.9.0).
Players choose a character class (Warrior/Opus, Samurai/Sonnet, Knight/Haiku),
enter a domain, and fight SEO issue "demons" in turn-based combat. The "Vanquish"
action channels Claude to generate real code fixes during battle.

SEO backend: 23 skills (20 core + 3 extensions), 17 subagents, 42 Python scripts
(29 upstream + 13 dungeon-exclusive visual audit scripts).

## Architecture

```
seo-dungeon/
  dungeon/                           # Game application
    index.html                     # Game shell + title screen UI
    launch.js                      # Startup script
    vite.config.js                 # Vite build configuration
    server/
      index.js                     # Express + WebSocket bridge to Claude Code
    src/
      main.js                      # Entry point, title screen, transitions
      knight-sprite.js             # Character select sprite animations
      activity-log.js              # Guild Ledger (real-time log panel)
      utils/
        ws.js                      # WebSocket bridge client
        sound-manager.js           # Procedural audio engine (Web Audio API)
      scenes/
        BootScene.js               # Asset loading + DPR setup
        GateScene.js               # Continue/new quest selection
        SummoningScene.js          # Audit progress + loading animations
        DungeonHallScene.js        # Browse SEO issues (demon list)
        BattleScene.js             # Turn-based combat system
        VictoryScene.js            # Post-battle XP + loot rewards
    assets/
      luizmelo/                    # Character sprite sheets
  skills/                           # Claude Code SEO skills (backend, v1.9.0)
    seo/SKILL.md                   # Main orchestrator (23 skills, routing table)
    seo-audit/SKILL.md             # Full site audit with up to 15 parallel agents
    seo-technical/SKILL.md         # Technical SEO (9 categories)
    seo-content/SKILL.md           # E-E-A-T analysis
    seo-schema/SKILL.md            # Schema.org markup
    seo-sitemap/SKILL.md           # XML sitemap analysis
    seo-images/SKILL.md            # Image optimization + SERP analysis
    seo-geo/SKILL.md               # AI search optimization (GEO)
    seo-local/SKILL.md             # Local SEO (GBP, citations, reviews)
    seo-maps/SKILL.md              # Maps intelligence
    seo-plan/SKILL.md              # Strategic SEO planning
    seo-programmatic/SKILL.md      # Programmatic SEO
    seo-competitor-pages/SKILL.md  # Competitor comparison pages
    seo-hreflang/SKILL.md          # International SEO + cultural profiles
    seo-page/SKILL.md              # Deep single-page analysis
    seo-google/SKILL.md            # Google SEO APIs (GSC, CrUX, GA4, PSI)
    seo-backlinks/SKILL.md         # Backlink profile analysis (Moz, Bing, CC)
    seo-cluster/SKILL.md           # Semantic topic clustering
    seo-sxo/SKILL.md               # Search Experience Optimization
    seo-drift/SKILL.md             # SEO drift monitoring ("git for SEO")
    seo-ecommerce/SKILL.md         # E-commerce SEO + marketplace intel
    seo-dataforseo/SKILL.md        # Live SEO data (extension)
    seo-image-gen/SKILL.md         # AI image generation (extension)
  agents/                           # 17 subagents for parallel analysis
  scripts/                          # Python execution scripts (29 upstream + 13 visual)
  extensions/                       # DataForSEO + Banana + Firecrawl MCP installers
  docs/                             # Extended documentation
```

## Game Scenes (Flow)

```
Title Screen → Gate → Summoning → Dungeon Hall → Battle → Victory
     ↑                                              ↓
     └──────────── Return to Guild ←────────────────┘
```

1. **Title Screen** (HTML): Domain input, character select, volume control
2. **Gate Scene** (HTML overlay): Continue quest / new quest per character
3. **Summoning Scene** (Phaser): Audit runs, progress bar, Guild Ledger updates
4. **Dungeon Hall** (Phaser): Browse demons sorted by SEO impact severity
5. **Battle Scene** (Phaser): Turn-based combat with attack/vanquish/defend/flee
6. **Victory Scene** (Phaser): XP rewards, loot drops, next demon or return

## Development

```bash
cd dungeon
npm install
npm start            # Production: auto-builds + serves optimized bundle
npm run dev          # Development: Vite hot reload + bridge (for code changes)
```

### Dev Shortcuts

- `?battle=1` - Skip to battle scene with first cached demon
- `?battle=1&issue=2` - Skip to specific issue index

### Key Files

- `dungeon/src/scenes/BattleScene.js` - Main combat logic (~2400 lines)
- `dungeon/src/utils/sound-manager.js` - 25+ procedural sound effects
- `dungeon/src/knight-sprite.js` - Character select animations
- `dungeon/server/index.js` - WebSocket bridge to Claude Code

### Rules

- Phaser scenes go in `dungeon/src/scenes/`
- Utility modules go in `dungeon/src/utils/`
- All audio is procedural (Web Audio API) - no audio files
- Canvas renders at 3x DPR minimum for 4K text clarity
- Sprite assets stay under `dungeon/assets/luizmelo/`

## SEO Backend

The SEO analysis is powered by Claude Code skills bundled in `skills/` and `agents/`.
These run server-side through the WebSocket bridge when a player starts an audit.
Based on [Claude SEO v1.9.0](https://github.com/AgriciDaniel/claude-seo) by Daniel Agrici.

| Command | Purpose |
|---------|---------|
| `/seo audit <url>` | Full site audit with up to 15 parallel subagents |
| `/seo page <url>` | Deep single-page analysis |
| `/seo technical <url>` | Technical SEO (crawlability, security, CWV) |
| `/seo content <url>` | E-E-A-T and content quality |
| `/seo schema <url>` | Schema.org detection and generation |
| `/seo sitemap <url>` | XML sitemap analysis or generation |
| `/seo images <url>` | Image SEO: on-page audit, SERP analysis |
| `/seo geo <url>` | AI search / GEO optimization |
| `/seo plan <type>` | Strategic SEO planning by industry |
| `/seo local <url>` | Local SEO (GBP, citations, reviews, map pack) |
| `/seo maps [cmd] [args]` | Maps intelligence (geo-grid, GBP, reviews) |
| `/seo hreflang <url>` | International SEO / hreflang audit |
| `/seo google [cmd] [url]` | Google SEO APIs (GSC, PageSpeed, CrUX, GA4) |
| `/seo backlinks <url>` | Backlink profile (Moz, Bing, CC, DataForSEO) |
| `/seo cluster <keyword>` | Semantic topic clustering + hub-spoke architecture |
| `/seo sxo <url>` | Search Experience Optimization (page-type mismatch) |
| `/seo drift baseline <url>` | Capture SEO baseline for change monitoring |
| `/seo drift compare <url>` | Compare current state to stored baseline |
| `/seo ecommerce <url>` | E-commerce SEO + marketplace intelligence |
| `/seo programmatic` | Programmatic SEO analysis |
| `/seo competitor-pages` | Competitor comparison page generation |
| `/seo dataforseo [cmd]` | Live SEO data via DataForSEO (extension) |
| `/seo firecrawl [cmd] <url>` | Full-site crawling (extension) |
| `/seo image-gen [use-case]` | AI image generation for SEO (extension) |

## Security Rules

- **Never commit credentials**: `.env`, `client_secret*.json`, `oauth-token.json`, `service_account*.json` are all in `.gitignore`
- **URL validation**: All scripts that accept user URLs must call `validate_url()` from `google_auth.py` before making API calls (SSRF protection)
- **OAuth tokens**: Never store `client_secret` in the token file
- **Config location**: `~/.config/claude-seo/` (user-space, not in repo)

## Ecosystem

Part of the avalonreset tool suite:
- [SEO Dungeon](https://github.com/avalonreset/seo-dungeon) - this project
- [Claude GitHub](https://github.com/avalonreset/claude-github) - GitHub repo optimization
- [Gemini SEO](https://github.com/avalonreset/gemini-seo) - SEO tools for Gemini CLI

Upstream SEO engine: [Claude SEO](https://github.com/AgriciDaniel/claude-seo) by Daniel Agrici
