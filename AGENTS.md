<!-- gbrain:skillpack:begin -->

<!-- Installed by gbrain 0.25.1 — do not hand-edit between markers. -->
<!-- gbrain:skillpack:manifest cumulative-slugs="academic-verify,archive-crawler,article-enrichment,book-mirror,brain-ops,brain-pdf,briefing,citation-fixer,concept-synthesis,cron-scheduler,cross-modal-review,daily-task-manager,daily-task-prep,data-research,enrich,idea-ingest,ingest,maintain,media-ingest,meeting-ingestion,minion-orchestrator,perplexity-research,query,repo-architecture,reports,signal-detector,skill-creator,skillify,skillpack-check,soul-audit,strategic-reading,testing,voice-note-ingest,webhook-transforms" version="0.25.1" -->

| Trigger | Skill |
|---------|-------|
| "academic-verify" | `skills/academic-verify/SKILL.md` |
| "archive-crawler" | `skills/archive-crawler/SKILL.md` |
| "article-enrichment" | `skills/article-enrichment/SKILL.md` |
| "book-mirror" | `skills/book-mirror/SKILL.md` |
| "brain-ops" | `skills/brain-ops/SKILL.md` |
| "brain-pdf" | `skills/brain-pdf/SKILL.md` |
| "briefing" | `skills/briefing/SKILL.md` |
| "citation-fixer" | `skills/citation-fixer/SKILL.md` |
| "concept-synthesis" | `skills/concept-synthesis/SKILL.md` |
| "cron-scheduler" | `skills/cron-scheduler/SKILL.md` |
| "cross-modal-review" | `skills/cross-modal-review/SKILL.md` |
| "daily-task-manager" | `skills/daily-task-manager/SKILL.md` |
| "daily-task-prep" | `skills/daily-task-prep/SKILL.md` |
| "data-research" | `skills/data-research/SKILL.md` |
| "enrich" | `skills/enrich/SKILL.md` |
| "idea-ingest" | `skills/idea-ingest/SKILL.md` |
| "ingest" | `skills/ingest/SKILL.md` |
| "maintain" | `skills/maintain/SKILL.md` |
| "media-ingest" | `skills/media-ingest/SKILL.md` |
| "meeting-ingestion" | `skills/meeting-ingestion/SKILL.md` |
| "minion-orchestrator" | `skills/minion-orchestrator/SKILL.md` |
| "perplexity-research" | `skills/perplexity-research/SKILL.md` |
| "query" | `skills/query/SKILL.md` |
| "repo-architecture" | `skills/repo-architecture/SKILL.md` |
| "reports" | `skills/reports/SKILL.md` |
| "signal-detector" | `skills/signal-detector/SKILL.md` |
| "skill-creator" | `skills/skill-creator/SKILL.md` |
| "skillify" | `skills/skillify/SKILL.md` |
| "skillpack-check" | `skills/skillpack-check/SKILL.md` |
| "soul-audit" | `skills/soul-audit/SKILL.md` |
| "strategic-reading" | `skills/strategic-reading/SKILL.md` |
| "testing" | `skills/testing/SKILL.md` |
| "voice-note-ingest" | `skills/voice-note-ingest/SKILL.md` |
| "webhook-transforms" | `skills/webhook-transforms/SKILL.md` |

<!-- gbrain:skillpack:end -->

--- project-doc ---

# SEO Dungeon: Multi-Agent Instructions

SEO Dungeon is a local AI SEO audit application. The browser game bridge
defaults to Codex CLI and can also launch local Claude Code or Gemini CLI
runtimes, while the bundled SEO engine can be used by compatible terminal
agents such as Cursor, Cline, Aider, and Antigravity.

## Wiki Knowledge Base

Path: `E:\claude-seo-dungeon-wiki`

When project history, deployment context, audit credential setup, or release
policy matters, read `NEXT.md` first, then `_index.md`, then the relevant note.
For audit credential and Railway context, read
`references/seo-audit-integrations.md`. Keep raw secret values out of the wiki.

## Overview

The project combines a 16-bit dungeon crawler UI with a Codex-compatible SEO
skill suite. The current bundle has 25 sub-skills (21 core + 1 orchestrator + 1
framework integration + 2 extension mirrors), 18 portable Markdown sub-agents,
23 Codex TOML profiles, and 50 Python execution scripts for fetching, parsing,
reporting, and SEO data integrations.

## Runtime Policy

- Default dungeon runtime: Codex CLI through `codex app-server --stdio`.
  Set `SEO_DUNGEON_CODEX_TRANSPORT=exec` only when deliberately testing the
  older `codex exec --json` transport.
- Optional dungeon runtimes: local Claude Code CLI through `claude --print` and
  local Gemini CLI through `gemini --prompt`.
- The bridge must only spawn local terminal CLIs. Do not add consumer-app browser
  wrappers or remote proxy services.
- Codex installs use the root installer and `agents-codex/` TOML profiles.
- Non-Codex usage should stay grounded in the same `skills/`, `agents/`, and
  `scripts/` files instead of inventing runtime-specific forks.

## Quick Reference

| Command | What it does |
|---------|-------------|
| `/seo audit <url>` | Full website audit with parallel subagent delegation |
| `/seo page <url>` | Deep single-page analysis |
| `/seo technical <url>` | Technical SEO audit (9 categories) |
| `/seo content <url>` | E-E-A-T and content quality analysis |
| `/seo schema <url>` | Schema.org detection, validation, generation |
| `/seo sitemap <url>` | XML sitemap analysis or generation |
| `/seo images <url>` | Image SEO: on-page audit, SERP analysis, file optimization |
| `/seo geo <url>` | AI Overviews / Generative Engine Optimization |
| `/seo plan <type>` | Strategic SEO planning |
| `/seo flow [stage] [url\|topic]` | FLOW framework prompts |
| `/seo cluster <keyword>` | SERP-based semantic clustering and content architecture |
| `/seo sxo <url>` | Search Experience Optimization: page-type analysis, personas |
| `/seo drift baseline <url>` | Capture SEO baseline for change monitoring |
| `/seo drift compare <url>` | Compare current state to stored baseline |
| `/seo ecommerce <url>` | E-commerce SEO: product schema, marketplace intelligence |
| `/seo programmatic [url]` | Programmatic SEO at scale |
| `/seo competitor-pages [url]` | Competitor comparison pages |
| `/seo local <url>` | Local SEO analysis (GBP, citations, reviews) |
| `/seo maps [cmd] [args]` | Maps intelligence (geo-grid, GBP audit, competitors) |
| `/seo hreflang <url>` | Hreflang/i18n SEO audit, cultural profiles, content parity |
| `/seo google [cmd] [url]` | Google SEO APIs (GSC, PageSpeed, CrUX, Indexing, GA4) |
| `/seo backlinks <url>` | Backlink profile analysis |
| `/seo dataforseo [cmd]` | Live SEO data via DataForSEO (extension) |
| `/seo firecrawl [cmd] <url>` | Full-site crawling and site mapping (extension) |
| `/seo image-gen [use-case]` | SEO image generation planning (extension) |

## Architecture

```
skills/                    # 25 sub-skills
  seo/SKILL.md             # Main orchestrator + routing
agents/                    # 18 portable Markdown agent prompts
agents-codex/              # 23 Codex TOML profiles
scripts/                   # 50 Python execution scripts
schema/                    # JSON-LD templates
extensions/                # Optional SEO data, crawl, and asset add-ons
dungeon/                   # Phaser UI + local CLI bridge
```

## Portability Notes

Codex is the packaged default runtime for SEO Dungeon. Compatible
terminal-agent workflows can read the same `skills/`, `agents/`, and `scripts/`
files directly when a user chooses to adapt the package outside the dungeon UI.

Run `python scripts/portability_check.py --strict` before shipping changes that
touch skill frontmatter, agent prompts, or extension mirrors.

| Tool name | Codex | Cline | Aider | Portable note |
|-----------|-------|-------|-------|---------------|
| Read | read files directly | read files directly | read files directly | Use repo-relative paths. |
| Write | edit files directly | edit files directly | edit files directly | Keep generated files in the repo or explicit output folders. |
| Edit | patch files directly | patch files directly | patch files directly | Prefer small, reviewable edits. |
| Bash | shell command | shell command | shell command | Preserve URL-safety and credential rules. |
| WebFetch | browser or fetch script | browser or fetch script | browser or fetch script | Use `scripts/url_safety.py` guarded fetch paths for live URLs. |

## Key Principles

1. Keep the dungeon UI local-CLI only, with Codex as the packaged default.
2. Prefer existing skill and script patterns over new abstractions.
3. Preserve SSRF protections in scripts that fetch URLs.
4. Keep user-facing copy clear that SEO Dungeon is independent, public, and
   local-runtime compatible.
