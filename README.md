<p align="center">
  <a href="https://raw.githubusercontent.com/avalonreset/seo-dungeon/main/assets/banner.webp"><img src="assets/banner.webp" alt="SEO Dungeon - Gamified SEO Audit Tool" width="100%"></a>
</p>

# SEO Dungeon - Gamified SEO Audit Tool

[![CI](https://github.com/avalonreset/seo-dungeon/actions/workflows/ci.yml/badge.svg)](https://github.com/avalonreset/seo-dungeon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.9.8-blue)](CHANGELOG.md)
[![SEO Engine](https://img.shields.io/badge/SEO%20Engine-v1.9.8-green)](skills/seo/SKILL.md)
[![Built with Phaser](https://img.shields.io/badge/built%20with-Phaser%203-orange)](https://phaser.io/)
[![Codex First](https://img.shields.io/badge/runtime-Codex%20first-2ea44f)](install.sh)

> [!WARNING]
> **Use Codex by default. Do not use the Claude runtime unless you understand and accept Anthropic/Claude billing risk.**
>
> SEO Dungeon still contains legacy Claude compatibility because the bundled SEO engine originated in Claude SEO. That does **not** mean Claude is the recommended runtime. Claude Code usage can consume paid Anthropic resources depending on your subscription, API-key environment, and current Anthropic billing rules. In particular, if `ANTHROPIC_API_KEY` is present in your environment, Claude Code may use API-key billing instead of the subscription path you expected.
>
> For that reason, SEO Dungeon now defaults to Codex only. Claude requires explicit opt-in with `SEO_DUNGEON_AGENT=claude` and `SEO_DUNGEON_ALLOW_CLAUDE=1`. If `ANTHROPIC_API_KEY` is set, the bridge will not pass it through unless you also set `SEO_DUNGEON_ALLOW_ANTHROPIC_API_KEY=1`.

Most SEO audit tools hand you a spreadsheet and wish you luck. SEO Dungeon turns every issue into a demon you can fight, and every fix into a real commit to your codebase. Built on the **Claude SEO v1.9.8** engine with 25 sub-skills, 18 sub-agents, Codex support, legacy Claude compatibility, and a 16-bit dungeon crawler interface that makes SEO audits something you actually want to do.

## Screenshots

<table>
<tr>
<td width="50%"><a href="https://raw.githubusercontent.com/avalonreset/seo-dungeon/main/screenshots/title-screen.webp"><img src="screenshots/title-screen.webp" alt="SEO Dungeon title screen with character selection"></a><br><em>Pick your warrior, enter a domain, seal your fate</em></td>
<td width="50%"><a href="https://raw.githubusercontent.com/avalonreset/seo-dungeon/main/screenshots/gate-scene-full.webp"><img src="screenshots/gate-scene-full.webp" alt="Gate scene showing quest continuation options"></a><br><em>Continue a previous quest or begin a new one</em></td>
</tr>
<tr>
<td width="50%"><a href="https://raw.githubusercontent.com/avalonreset/seo-dungeon/main/screenshots/dungeon-hall.webp"><img src="screenshots/dungeon-hall.webp" alt="Dungeon hall showing SEO issue demons sorted by severity"></a><br><em>Browse SEO demons sorted by severity</em></td>
<td width="50%"><a href="https://raw.githubusercontent.com/avalonreset/seo-dungeon/main/screenshots/battle-scene.webp"><img src="screenshots/battle-scene.webp" alt="Turn-based battle scene with real-time Guild Ledger"></a><br><em>Battle demons with AI-powered code fixes</em></td>
</tr>
</table>

## Table of Contents

- [How It Works](#how-it-works)
- [What's New in v1.9.8](#whats-new-in-v198)
- [Game Features](#game-features)
- [SEO Engine (25 Skills)](#seo-engine-25-skills)
- [Quick Start](#quick-start)
- [Character Classes](#character-classes)
- [SEO Commands](#seo-commands)
- [Extensions](#extensions)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [Asset Credits](#asset-credits)
- [Contributing](#contributing)
- [License](#license)

## How It Works

1. **Choose your warrior.** In Codex mode, the selected warrior is visual and Codex uses your configured Codex model. Legacy Claude mode maps Warrior, Samurai, and Knight to Opus, Sonnet, and Haiku only after explicit opt-in.
2. **Enter a domain and project path.** Point the dungeon at any website and its source code directory.
3. **Descend into the dungeon.** The bundled SEO engine runs a full audit through Codex by default, discovering issues as dungeon demons.
4. **Explore the Dungeon Hall.** Browse discovered SEO issues sorted by severity. Critical issues are deadly bosses. Info-level issues are goblins.
5. **Battle demons.** Turn-based combat with four actions:
   - **Attack** - Prompt the active agent directly with what you want it to do about this issue. The agent streams its work into the Guild Ledger on the right and can edit your project files.
   - **Vanquish** - Declare the demon slain. You decide when the issue has been handled enough to mark it defeated in your catalog.
   - **Defend** - Strike a defensive stance. Mostly for flavor.
   - **Flee** - Skip this demon and return to the dungeon. You can come back and fight it later.
6. **Collect loot.** Earn XP and rewards for every demon slain.

The real work happens when you choose **Attack**. You type a prompt describing what you want done about this issue, the active agent reads your actual project files, and streams its work into the Guild Ledger on the right - tools it's calling, files it's reading, changes it's making. You can Attack as many times as you want. Real SEO fixes often take multiple prompts, back-and-forth clarification, and a little patience. **Vanquish** is the button you press when you've looked at what the agent did and you're satisfied the issue is handled. It's your call, not the machine's.

## What's New in v1.9.8

This refresh updates SEO Dungeon from the v1.9.0 SEO engine to **Claude SEO v1.9.8** and adds Codex compatibility.

### New SEO Skills

| Skill | What It Does |
|-------|-------------|
| **Content Briefs** | Generates search-intent aligned SEO briefs with page-type templates and keyword density guidance. |
| **FLOW Framework** | Adds evidence-led Find, Leverage, Optimize, Win, and local SEO prompt workflows. |
| **Backlink Analysis** | Profile your backlink health across Moz, Bing Webmaster, Common Crawl, and DataForSEO. Detects toxic links, analyzes anchor text, and identifies competitor gaps. |
| **Semantic Clustering** | Groups keywords by SERP overlap to build hub-and-spoke content architecture. Generates interactive HTML cluster maps. |
| **Search Experience (SXO)** | Detects page-type mismatches by reading SERPs backwards. If Google shows 8 product pages and you have a blog post, SXO catches that. |
| **SEO Drift Monitoring** | "Git for SEO." Captures baselines, tracks changes over time, and alerts when SEO-critical elements break. 17 comparison rules across 3 severity levels. |
| **E-commerce SEO** | Product schema validation, Google Shopping intelligence, Amazon marketplace comparison, and keyword gap analysis between organic and Shopping results. |
| **Google SEO APIs** | Direct integration with Search Console, CrUX (25-week history), GA4 organic traffic, PageSpeed Insights, Indexing API, YouTube, and NLP analysis. |

### Game Improvements

- **Codex-first runtime support** - Run the bridge through `codex exec` by default
- **Legacy Claude support** - Claude compatibility remains available behind explicit opt-in for users who understand the billing risk
- **Dual installer support** - Install skills into `~/.codex` by default, or into `~/.claude` only when requested
- **Guild Ledger Terminal** - Type prompts directly to the active agent during gameplay
- **Persistent Interactive Sessions** - Legacy Claude mode maintains context across battle actions with token tracking; Codex uses per-turn exec calls
- **RPG Narrator** - Haiku narrates attack results in the battle log with cinematic flair
- **Smart Scroll** - Guild Ledger respects your scroll position during updates
- **Double-Escape Cancel** - Press Escape twice to cancel any active agent operation
- **18 bug fixes** across battle log, animations, scroll behavior, and loading states

## Game Features

### Combat and Gameplay
- **Turn-based combat atmosphere** with HP bars, attack animations, and an RPG narrator
- **Attack** sends your message to the active agent with the selected demon as a structured focus header - severity, category, URL, file, selector all travel with every turn. The agent reads your intent naturally, so polite directives work as fixes and questions get answered without triggering edits.
- **Vanquish** is your judgment call. You decide when the issue has been handled enough to mark it defeated.
- **Neutral chat outside battle** - the Guild Ledger input becomes a plain pass-through to the active agent when no demon is selected, so you can ask anything with no SEO scope applied.
- **Quest caching** via localStorage so you can resume audits without re-running them
- **Dynamic difficulty** where demon HP scales with issue severity (critical = boss fight, info = goblin)

### Audio and Visuals
- **25+ procedural sound effects** synthesized via Web Audio API (zero audio files shipped)
- **Three animated character classes** with idle, run, attack, hit, and death sprite animations
- **13-demon animated roster** from 0x72 DungeonTileset II - every demon has a real 4-frame idle animation, tier-ranked across Critical / High / Medium / Low / Info. Themed assignment matches SEO category to demon archetype (schema → enforcers, broken links → skeletons, performance → imps, stale content → zombies)
- **Cinematic silhouette state** for undefeated demons with tier-escalating aura (critical adds embers + halo)
- **Painterly defeated state** - blood-drain tint, slump rotation, layered pool with drip droplets, killing-blow slashes, spatter ring, corner `DEFEATED` stamp. Every corpse freezes on a deterministic random idle frame so no two look the same.
- **Final victory sequence - "The Hall Is Still"** - four-phase Dark-Souls-inspired finale when every demon falls. Parchment stat ledger (tier counts, XP, active quest time), name awarded by total XP, then `SEEK ANOTHER` or `REMAIN`.
- **Visibility-aware quest timer** - `TIME IN THE DARK` pauses when the tab is hidden
- **4K rendering** with DPR-aware canvas scaling (3x minimum) for crisp text on high-DPI displays
- **Atmospheric effects** including dust motes, embers, ground fog, blood drip transitions, and procedural brick walls
- **Cinematic transitions** with fade-to-black sequences for descending and ascending

### Guild Ledger
- **Real-time activity log** showing every tool call, agent spawn, file read, and decision the active agent makes
- **14 icon categories** with per-line color coding (tools, agents, fetches, errors, completions)
- **Typewriter animation** with configurable speed and idle state detection
- **Interactive terminal mode** for typing prompts directly to the active agent mid-gameplay

## SEO Engine (25 Skills)

The full [Claude SEO v1.9.8](https://github.com/AgriciDaniel/claude-seo) engine is bundled, giving you 25 specialized skills that work through the game and directly from Codex. Claude compatibility is retained as an advanced, opt-in legacy path.

### Core Analysis (14 skills)

| Skill | Coverage |
|-------|----------|
| **Full Audit** | Parallel subagents, industry detection, 0-100 health score |
| **Technical SEO** | 9 categories: crawlability, indexability, security, URL structure, mobile, CWV, structured data, JS rendering, IndexNow |
| **Content Quality** | E-E-A-T framework (Dec 2025 update), readability, thin content detection |
| **Schema Markup** | JSON-LD detection, validation, and generation for 30+ schema types |
| **Image Optimization** | Alt text, formats, compression, lazy loading, SERP image analysis, Google Shopping eligibility |
| **Sitemap Analysis** | XML sitemap validation, generation with industry templates, quality gates |
| **GEO / AI Search** | Google AI Overviews, ChatGPT, Perplexity citability, llms.txt compliance, brand mention signals |
| **Local SEO** | GBP optimization, NAP consistency, citations, reviews, map pack, multi-location support |
| **Maps Intelligence** | Geo-grid rank tracking, GBP audit, review intelligence, competitor radius mapping |
| **Strategic Planning** | Industry-specific SEO roadmaps (SaaS, e-commerce, local, publisher, agency) |
| **Programmatic SEO** | Template engines, URL patterns, internal linking automation, thin content safeguards |
| **Competitor Pages** | "X vs Y" comparison pages, "alternatives to" pages, feature matrices |
| **International SEO** | Hreflang audit and generation with DACH, FR, ES, JA cultural adaptation profiles |
| **Single Page Analysis** | Deep single-page audit across all dimensions |

### Major Engine Additions

| Skill | Coverage |
|-------|----------|
| **Backlinks** | Tiered analysis: Moz API, Bing Webmaster, Common Crawl, DataForSEO. Confidence-weighted scoring, toxic link detection, competitor gap analysis |
| **Semantic Clustering** | SERP overlap algorithm, hub-and-spoke architecture, interactive HTML cluster maps, cannibalization detection |
| **SXO (Search Experience)** | 7-step pipeline: SERP backwards analysis, page-type mismatch detection, user story derivation, persona scoring, wireframe generation |
| **SEO Drift** | SQLite-based baseline capture, 17 comparison rules, 3 severity levels, cross-skill delegation for fixes |
| **E-commerce** | Product schema validation, Google Shopping/Amazon marketplace intel, seller landscape analysis, keyword gap analysis |
| **Google APIs** | 15+ commands: PageSpeed, CrUX (25-week trends), Search Console, URL Inspection, Indexing API, GA4, YouTube, NLP, Keyword Planner |

### Extensions (3 optional add-ons)

| Extension | What It Adds |
|-----------|-------------|
| **DataForSEO** | Live keyword volume, SERP rankings, backlink data, AI visibility tracking, business listings |
| **Firecrawl** | Full-site crawling and URL discovery via Firecrawl MCP |
| **Banana** | AI image generation for SEO assets (OG images, social previews, blog headers) via Gemini |

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Python 3.10+** (for SEO analysis scripts)
- **Codex CLI** installed and authenticated
- **Claude Code is optional and not recommended as the default runtime** because it may incur Anthropic charges depending on your setup
- **Git**

### 1. Clone and install

```bash
git clone https://github.com/avalonreset/seo-dungeon.git
cd seo-dungeon
```

Install the SEO Dungeon skill suite. By default this installs the Codex skill tree only:

```powershell
# Windows
.\install.ps1

# macOS/Linux
bash install.sh
```

Install a specific runtime when needed:

```powershell
$env:SEO_DUNGEON_TARGET='codex'; .\install.ps1

# Legacy/advanced only: may incur Anthropic/Claude charges when used
$env:SEO_DUNGEON_TARGET='claude'; .\install.ps1
```

### 2. Start the dungeon

```bash
cd dungeon
npm install
npm run dev
```

Open `http://localhost:3000`. The bridge server starts on port 3001 automatically.

Runtime selection:

```powershell
# Default: Codex runtime
npm run dev

# Codex runtime explicitly
$env:SEO_DUNGEON_AGENT='codex'; npm run dev

# Auto-pick Codex when available
$env:SEO_DUNGEON_AGENT='auto'; npm run dev

# Legacy/advanced only: use Claude after accepting billing risk
$env:SEO_DUNGEON_AGENT='claude'
$env:SEO_DUNGEON_ALLOW_CLAUDE='1'
npm run dev

# If ANTHROPIC_API_KEY is set and you intentionally want API-key billing risk:
$env:SEO_DUNGEON_ALLOW_ANTHROPIC_API_KEY='1'
```

> **First audit takes 5-10 minutes.** The `/seo audit` skill fans out tool calls across many pages. The progress bar shows 0% during tool-call phases because nothing text-based is streaming yet. This is normal. Subsequent cached audits are near-instant.

### 3. Production build (recommended for recording)

```bash
cd dungeon
npm run build
npm run server          # Terminal 1: Bridge server
npx serve dist -l 3000 -s  # Terminal 2: Static build
```

### Dev Shortcuts

- `?battle=1` - Skip straight to battle scene with the first cached demon
- `?battle=1&issue=2` - Jump to a specific issue index

## Character Classes

In Codex mode, the character selection is visual and Codex uses your configured Codex model, or `SEO_DUNGEON_CODEX_MODEL` when set. In legacy Claude mode, each character maps to a Claude model after explicit opt-in.

| Character | Model | Strengths | Best For |
|-----------|-------|-----------|----------|
| **Warrior** | Visual class in Codex / Claude Opus in legacy Claude mode | Deepest analysis style | Complex enterprise sites, critical audits |
| **Samurai** | Visual class in Codex / Claude Sonnet in legacy Claude mode | Balanced style | General use, structured data work |
| **Knight** | Visual class in Codex / Claude Haiku in legacy Claude mode | Fast iteration style | Quick audits, simple sites, rapid iteration |

## SEO Commands

The skills work directly from Codex without the game interface. They can also work in Claude Code only if you intentionally install and use the legacy Claude path:

| Command | What It Does |
|---------|-------------|
| `/seo audit <url>` | Full site audit with parallel subagents |
| `/seo page <url>` | Deep single-page analysis |
| `/seo technical <url>` | Technical SEO (crawlability, indexability, CWV, security) |
| `/seo content <url>` | E-E-A-T and content quality analysis |
| `/seo schema <url>` | Schema.org detection, validation, and generation |
| `/seo sitemap <url>` | XML sitemap analysis or generation |
| `/seo images <url>` | Image SEO: on-page audit, SERP analysis, file optimization |
| `/seo geo <url>` | AI Overviews / Generative Engine Optimization |
| `/seo local <url>` | Local SEO (GBP, citations, reviews, map pack) |
| `/seo maps [cmd] [args]` | Maps intelligence (geo-grid, GBP audit, reviews) |
| `/seo hreflang <url>` | International SEO / hreflang audit |
| `/seo google [cmd] [url]` | Google APIs (GSC, PageSpeed, CrUX, GA4, Indexing) |
| `/seo backlinks <url>` | Backlink profile (Moz, Bing, CC, DataForSEO) |
| `/seo cluster <keyword>` | Semantic topic clustering + hub-spoke architecture |
| `/seo sxo <url>` | Search Experience Optimization (page-type mismatch) |
| `/seo drift baseline <url>` | Capture SEO baseline for change monitoring |
| `/seo drift compare <url>` | Compare current state to stored baseline |
| `/seo ecommerce <url>` | E-commerce SEO + marketplace intelligence |
| `/seo plan <type>` | Strategic SEO planning by industry |
| `/seo programmatic` | Programmatic SEO analysis |
| `/seo competitor-pages` | Competitor comparison page generation |
| `/seo dataforseo [cmd]` | Live SEO data via DataForSEO (extension) |
| `/seo firecrawl [cmd] <url>` | Full-site crawling via Firecrawl (extension) |
| `/seo image-gen [use-case]` | AI image generation for SEO (extension) |

## Extensions

### DataForSEO (live keyword and SERP data)

Adds real-time search volume, keyword difficulty, SERP analysis, backlink data, and AI visibility tracking. Requires a [DataForSEO](https://dataforseo.com) account (free tier available).

```bash
# Windows
powershell -File extensions\dataforseo\install.ps1

# macOS/Linux
bash extensions/dataforseo/install.sh
```

### Firecrawl (full-site crawling)

Adds site-wide URL discovery and JavaScript-rendered crawling via Firecrawl MCP. Useful when `WebFetch` can't reach all pages.

```bash
# Windows
powershell -File extensions\firecrawl\install.ps1

# macOS/Linux
bash extensions/firecrawl/install.sh
```

### Banana (AI image generation)

Adds AI-generated image creation for SEO assets (OG images, social previews, blog headers) via Gemini Nano Banana models.

```bash
# Windows
powershell -File extensions\banana\install.ps1

# macOS/Linux
bash extensions/banana/install.sh
```

## Architecture

The game and the SEO engine are completely separate layers connected by a WebSocket bridge.

```
Browser (Phaser.js)  <-->  WebSocket (3001)  <-->  Bridge Server  <-->  Codex CLI
                                                                          |
                                                                    23 SEO Skills
                                                                    17 Subagents
                                                                    42 Python Scripts
                                                                    3 Extensions
```

1. The **Phaser game** sends commands (`audit`, `fix`, `commit`, `narrate`) over WebSocket
2. The **bridge server** spawns Codex CLI processes by default
3. Codex loads **SEO skills** from its skill directory and runs the analysis
4. Results stream back through WebSocket to the game in real time
5. The **Guild Ledger** displays every tool call, file read, and decision the active agent makes

```
seo-dungeon/
  dungeon/                         # Game application (Phaser.js)
    server/index.js                # WebSocket bridge to Codex, with legacy Claude opt-in
    src/scenes/                    # 8 game scenes (Boot, Gate, Summoning, Hall, Battle, Victory...)
    src/utils/                     # Sound manager, WebSocket client, colors, particles
    assets/luizmelo/               # Character sprite sheets (Warrior, Samurai, Knight)
  skills/                          # SEO engine v1.9.8 (25 skills)
  agents/                          # 17 subagents for parallel analysis
  scripts/                         # 42 Python scripts (29 SEO + 13 visual audit)
  extensions/                      # DataForSEO + Firecrawl + Banana
```

## Tech Stack

| Component | Technology | Details |
|-----------|-----------|---------|
| Game engine | [Phaser 3](https://phaser.io/) | 2D scenes, sprites, tweens, input handling |
| Build tool | [Vite](https://vitejs.dev/) | Dev server + production bundling |
| Audio | [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | 25+ procedural synthesized sounds |
| Bridge | Express + ws | WebSocket bridge to Codex CLI, with legacy Claude opt-in |
| SEO engine | [Claude SEO v1.9.8](https://github.com/AgriciDaniel/claude-seo) | 25 skills, 18 Claude agents, Codex TOML agent profiles |
| Characters | [LuizMelo](https://luizmelo.itch.io/) | Warrior, Samurai, Knight sprite sheets |
| Demons | [0x72](https://0x72.itch.io/dungeontileset-ii) | DungeonTileset II monster sprites |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "The dungeon is unreachable" | Bridge server isn't running. Run `npm run server` in `dungeon/` |
| Audit hangs or takes very long | Normal for first run. Subsequent runs use cached results via the Gate scene. |
| JSON parse error after audit | Auto-retry is built in. If it persists, try Samurai (Sonnet), the most reliable for structured JSON output. |
| Blurry text on 4K display | Should auto-detect. Game renders at 3x DPR minimum for high-DPI clarity. |
| Skills not found by Codex | Run the installer (`install.ps1` or `install.sh`) to copy skills to `~/.codex/` |
| Claude runtime does not start | This is intentional. Set `SEO_DUNGEON_AGENT=claude` and `SEO_DUNGEON_ALLOW_CLAUDE=1` only if you accept Anthropic/Claude billing risk. |
| Claude refuses to run with `ANTHROPIC_API_KEY` set | Unset `ANTHROPIC_API_KEY`, or set `SEO_DUNGEON_ALLOW_ANTHROPIC_API_KEY=1` only if you intentionally accept API-key billing risk. |
| "No module named playwright" | Optional dependency. Install with `pip install playwright && python -m playwright install chromium` |
| Bridge port 3001 in use | Kill the process on that port or change `PORT` in `dungeon/server/index.js` |
| Google API commands fail | Run `/seo google` for setup instructions. Requires API key at minimum (free). |
| Drift baseline not found | Run `/seo drift baseline <url>` before `/seo drift compare <url>` |

## Asset Credits

| Asset | Creator | License | Source |
|-------|---------|---------|--------|
| DungeonTileset II (13-demon roster: big_demon, ogre, orc_warrior, big_zombie, skelet, chort, masked_orc, pumpkin_dude, orc_shaman, imp, wogol, goblin, tiny_zombie) | 0x72 | CC0 | [itch.io](https://0x72.itch.io/dungeontileset-ii) |
| Medieval Warrior Pack (Warrior class / Opus) | LuizMelo | Free for personal and commercial use | [itch.io](https://luizmelo.itch.io/medieval-warrior-pack-2) |
| Martial Hero Pack (Samurai class / Sonnet) | LuizMelo | Free for personal and commercial use | [itch.io](https://luizmelo.itch.io/martial-hero) |
| Warrior Pack 2 (Knight class / Haiku) | LuizMelo | Free for personal and commercial use | [itch.io](https://luizmelo.itch.io/medieval-warrior-pack-2) |
| RPG GUI Construction Kit v1.0 | Lamoot | CC-BY 3.0 (attribution required) | [OpenGameArt](https://opengameart.org/content/rpg-gui-construction-kit-v10) |
| Golden UI | Buch | CC0 | [OpenGameArt](https://opengameart.org/content/golden-ui) |

All assets used under their respective open licenses. CC-BY attribution is rendered in the UI credits card and in [dungeon/public/assets/ATTRIBUTION.md](dungeon/public/assets/ATTRIBUTION.md). See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for full attribution including the Claude SEO engine (MIT).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE) - Copyright (c) 2026 Avalon Reset

SEO engine based on [Claude SEO](https://github.com/AgriciDaniel/claude-seo) by Daniel Agrici (MIT).

## Cost expectations

SEO Dungeon defaults to Codex so users do not accidentally route audits through Claude. Full-site audits still perform substantial model/tool work, so understand the pricing and limits of whichever agent runtime you choose.

The legacy Claude runtime is **not recommended as the default**. If you explicitly enable it, every `Attack` in battle and every `/seo audit` run can consume Anthropic/Claude resources under your own credentials. A full-site audit with many agent/tool calls may be expensive. If `ANTHROPIC_API_KEY` is present, SEO Dungeon blocks passing it through unless you set `SEO_DUNGEON_ALLOW_ANTHROPIC_API_KEY=1`.

## Disclaimer

**SEO Dungeon is an independent, open-source project. It is not affiliated with, endorsed by, or sponsored by Anthropic.**

"Claude," "Claude Code," "Opus," "Sonnet," and "Haiku" are trademarks of Anthropic and are referenced here descriptively for legacy compatibility. No endorsement or partnership is implied. Users who opt into Claude provide their own Claude Code authentication and are responsible for their own token usage, billing, and compliance under their agreement with Anthropic.

Use of the Anthropic API through Claude Code is subject to Anthropic's [Usage Policies](https://www.anthropic.com/legal/aup) and any applicable terms of service. This project does not proxy, redistribute, or resell access to Anthropic services.
