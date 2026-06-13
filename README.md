<p align="center">
  <a href="assets/banner.webp"><img src="assets/banner.webp" alt="SEO Dungeon - Gamified SEO Audit Tool" width="100%"></a>
</p>

# SEO Dungeon - Codex-Default SEO Audit Game

[![CI](https://github.com/avalonreset/seo-dungeon/actions/workflows/ci.yml/badge.svg)](https://github.com/avalonreset/seo-dungeon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.2.0-blue)](CHANGELOG.md)
[![Runtime](https://img.shields.io/badge/runtime-Codex%20default-2ea44f)](install.sh)

SEO Dungeon turns SEO audits into a 16-bit dungeon crawler. Enter a domain,
inspect the issues as demons, and use a local terminal agent to analyze or fix
them inside your project. The app defaults to Codex, while the bundled SEO
engine remains portable enough for local Claude Code or Gemini CLI workflows.

## Screenshots

<table>
<tr>
<td width="50%"><a href="screenshots/title-screen.webp"><img src="screenshots/title-screen.webp" alt="SEO Dungeon title screen with character and runtime selection"></a><br><em>Pick a CLI, pick a warrior, enter a domain</em></td>
<td width="50%"><a href="screenshots/gate-scene-full.webp"><img src="screenshots/gate-scene-full.webp" alt="Gate scene showing quest continuation options"></a><br><em>Continue a previous quest or begin a new one</em></td>
</tr>
<tr>
<td width="50%"><a href="screenshots/dungeon-hall.webp"><img src="screenshots/dungeon-hall.webp" alt="Dungeon hall showing SEO issue demons sorted by severity"></a><br><em>Browse SEO demons sorted by severity</em></td>
<td width="50%"><a href="screenshots/battle-scene.webp"><img src="screenshots/battle-scene.webp" alt="Turn-based battle scene with real-time Guild Ledger"></a><br><em>Battle demons with agent-powered fixes</em></td>
</tr>
</table>

## How It Works

1. Choose a local CLI runtime. Codex is selected by default.
2. Choose a character profile:
   - Warrior: deep profile. Codex uses `xhigh`; Claude uses `opus`; Gemini uses a Pro-oriented model.
   - Samurai: balanced profile. Codex uses `high`; Claude uses `sonnet`; Gemini uses a Flash-oriented model.
   - Knight: fast profile. Codex uses `medium`; Claude uses `haiku`; Gemini uses a faster Flash profile.
3. Enter a domain and local project path.
4. Run a full `/seo audit` through the selected local CLI.
5. Review SEO issues as dungeon demons sorted by severity.
6. Use **Attack** to send a scoped agent turn for the selected issue.
7. Use **Vanquish** when you decide the issue is handled.

The dungeon bridge starts local CLI processes only. It does not proxy model
access and does not route through browser automation or consumer-app wrappers.

## SEO Engine

The bundled v2.2 engine is synchronized with Daniel Agrici's public
`AgriciDaniel/claude-seo` v2.2.0 release. It includes 25 sub-skills (21 core +
1 orchestrator + 1 framework integration + 2 extension mirrors), 18 portable
sub-agents, 23 Codex agent profiles, and 50 Python execution scripts.

| Area | Coverage |
|------|----------|
| Audit | Full-site audits, page audits, technical SEO, schema, sitemap, image SEO, hardened URL safety |
| Content | E-E-A-T, content briefs, semantic clustering, SXO, competitor pages, QRG-aligned quality gates |
| Growth | Local SEO, maps intelligence, backlinks, e-commerce, programmatic SEO |
| Monitoring | SEO drift baselines and comparisons |
| Data | Google SEO APIs, DataForSEO, Firecrawl, Ahrefs, Bing Webmaster, Profound, SE Ranking, Unlighthouse |
| Assets | SEO image generation planning through the optional Banana/Gemini extension mirror |
| Framework | FLOW prompts for Find, Leverage, Optimize, Win, and local workflows |

## Quick Start

### Prerequisites

- Node.js 22+
- Python 3.10+
- Git
- Codex CLI installed and signed in for the default runtime
- Optional: Claude Code CLI or Gemini CLI for the non-default runtime picker options

### Install Codex Skills

```powershell
# Windows
.\install.ps1
```

```bash
# macOS/Linux
bash install.sh
```

The installer places the SEO skills under your Codex home and copies the Codex
TOML profiles into the Codex agents folder. The portable `agents/` Markdown
prompts remain in the repository for compatible non-Codex agent workflows.

### Run The Game

```bash
cd dungeon
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The bridge server starts on
port `3001`.

Runtime environment:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SEO_DUNGEON_RUNTIME` | `codex` | Bridge fallback runtime when the UI does not send one |
| `SEO_DUNGEON_CODEX_MODEL` | Codex default | Optional Codex model override |
| `SEO_DUNGEON_CODEX_EFFORT_DEEP` | `xhigh` | Codex Warrior effort |
| `SEO_DUNGEON_CODEX_EFFORT_BALANCED` | `high` | Codex Samurai effort |
| `SEO_DUNGEON_CODEX_EFFORT_FAST` | `medium` | Codex Knight effort |
| `SEO_DUNGEON_CLAUDE_MODEL_DEEP` | `opus` | Claude Warrior model alias |
| `SEO_DUNGEON_CLAUDE_MODEL_BALANCED` | `sonnet` | Claude Samurai model alias |
| `SEO_DUNGEON_CLAUDE_MODEL_FAST` | `haiku` | Claude Knight model alias |
| `SEO_DUNGEON_GEMINI_MODEL_DEEP` | `gemini-3.1-pro-preview` | Gemini Warrior model |
| `SEO_DUNGEON_GEMINI_MODEL_BALANCED` | `gemini-3.5-flash` | Gemini Samurai model |
| `SEO_DUNGEON_GEMINI_MODEL_FAST` | `gemini-3.1-flash-lite` | Gemini Knight model |
| `SEO_DUNGEON_CLAUDE_ARGS` | `--print --output-format text --permission-mode acceptEdits` | Claude CLI argument template |
| `SEO_DUNGEON_GEMINI_ARGS` | `--prompt {{prompt}} --output-format text --approval-mode auto_edit` | Gemini CLI argument template |

Set a model variable to `default`, `auto`, or `none` to let that CLI use its own
configured default model.

First audits can take 5-10 minutes because `/seo audit` fans out many tool
calls. Cached audits are much faster.

## Commands

| Command | What it does |
|---------|-------------|
| `/seo audit <url>` | Full website audit |
| `/seo page <url>` | Deep single-page analysis |
| `/seo technical <url>` | Technical SEO audit |
| `/seo content <url>` | E-E-A-T and content quality |
| `/seo content-brief <topic or url>` | Detailed SEO content brief |
| `/seo schema <url>` | Schema.org detection and generation |
| `/seo sitemap <url>` | XML sitemap analysis or generation |
| `/seo images <url>` | Image SEO analysis |
| `/seo geo <url>` | AI search readiness |
| `/seo plan <type>` | Strategic SEO planning |
| `/seo flow [stage] [url|topic]` | FLOW framework prompts |
| `/seo cluster <keyword>` | Semantic clustering |
| `/seo sxo <url>` | Search experience optimization |
| `/seo drift baseline <url>` | Capture drift baseline |
| `/seo drift compare <url>` | Compare against drift baseline |
| `/seo ecommerce <url>` | E-commerce SEO |
| `/seo programmatic [url]` | Programmatic SEO |
| `/seo competitor-pages [url]` | Competitor comparison pages |
| `/seo local <url>` | Local SEO |
| `/seo maps [cmd] [args]` | Maps intelligence |
| `/seo hreflang <url>` | International SEO |
| `/seo google [cmd] [url]` | Google SEO APIs |
| `/seo backlinks <url>` | Backlink analysis |
| `/seo dataforseo [cmd]` | DataForSEO extension |
| `/seo firecrawl [cmd] <url>` | Firecrawl extension |
| `/seo image-gen [use-case]` | SEO image generation planning extension |

## Architecture

```text
seo-dungeon/
  dungeon/                         # Phaser game and WebSocket bridge
    server/index.js                # Local CLI bridge
    src/scenes/                    # Game scenes
    src/utils/                     # Sound, WebSocket client, colors, particles
  skills/                          # 25 SEO engine skills
  agents/                          # 18 portable Markdown agent prompts
  agents-codex/                    # 23 Codex TOML agent profiles
  scripts/                         # 50 Python SEO scripts
  schema/                          # JSON-LD templates
  extensions/                      # Optional SEO data, crawl, and asset add-ons
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "The dungeon is unreachable" | Bridge server is not running. Run `npm run server` in `dungeon/`. |
| Skills not found by Codex | Run `install.ps1` or `install.sh` from the repo root. |
| Codex fails to spawn | Confirm `codex` is installed, signed in, and available on `PATH`. |
| Claude or Gemini fails to spawn | Confirm the selected CLI is installed, signed in, and available on `PATH`; override `SEO_DUNGEON_CLAUDE_CLI` or `SEO_DUNGEON_GEMINI_CLI` if needed. |
| Audit takes a long time | Normal for first full-site audits. Use cached audits when available. |
| Google API commands fail | Run `/seo google` for setup instructions. |
| Drift baseline not found | Run `/seo drift baseline <url>` before `/seo drift compare <url>`. |

## Asset Credits

| Asset | Creator | License | Source |
|-------|---------|---------|--------|
| DungeonTileset II | 0x72 | CC0 | [itch.io](https://0x72.itch.io/dungeontileset-ii) |
| Medieval Warrior Pack | LuizMelo | Free for personal and commercial use | [itch.io](https://luizmelo.itch.io/medieval-warrior-pack-2) |
| Martial Hero Pack | LuizMelo | Free for personal and commercial use | [itch.io](https://luizmelo.itch.io/martial-hero) |
| RPG GUI Construction Kit v1.0 | Lamoot | CC-BY 3.0 | [OpenGameArt](https://opengameart.org/content/rpg-gui-construction-kit-v10) |
| Golden UI | Buch | CC0 | [OpenGameArt](https://opengameart.org/content/golden-ui) |

## License

[MIT](LICENSE) - Copyright (c) 2026 Avalon Reset.

SEO engine code is derived from Daniel Agrici's open-source SEO skill suite and
used under the MIT license. SEO Dungeon is independent, Codex-default, and
portable across compatible local terminal-agent workflows.
