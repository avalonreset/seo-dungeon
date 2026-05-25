# Architecture

SEO Dungeon has two layers:

1. `dungeon/`: Phaser UI and local WebSocket bridge.
2. SEO engine: Codex-compatible skills, TOML agent profiles, Python scripts,
   schema templates, and optional SEO data/crawl extensions.

```
Browser game (Phaser)
  -> WebSocket bridge on 127.0.0.1:3001
  -> codex exec --json
  -> skills/, agents-codex/, scripts/
```

## Runtime Boundary

The bridge only spawns `codex exec --json`. Claude Code, Gemini CLI, Claude API,
Gemini API, and consumer-app harnesses are not supported.

## Key Paths

```
dungeon/server/index.js       # Codex-only bridge
dungeon/src/                  # Game UI
skills/                       # SEO skill instructions
agents-codex/                 # Codex TOML profiles
scripts/                      # Python execution helpers
schema/                       # JSON-LD templates
extensions/dataforseo/        # Optional SEO data extension
extensions/firecrawl/         # Optional crawling extension
```
