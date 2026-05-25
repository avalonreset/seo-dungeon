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

# SEO Dungeon: Codex-Only Agent Instructions

SEO Dungeon is a Codex-first SEO audit application. It does not support Claude
Code, Gemini CLI, or Gemini/Claude API-backed runtime paths.

## Overview

The project combines a 16-bit dungeon crawler UI with a Codex-compatible SEO
skill suite. The current bundle has 24 sub-skills (21 core + 1 orchestrator + 1
framework integration + 1 extension mirror), 23 Codex sub-agents, and Python execution scripts for
fetching, parsing, reporting, and SEO data integrations.

## Runtime Policy

- Supported runtime: Codex CLI through `codex exec --json`.
- Unsupported runtimes: Claude Code, Gemini CLI, Claude API harnesses, Gemini API
  harnesses, and desktop/browser automation wrappers around consumer AI apps.
- Do not add installer branches, bridge code, docs, or examples for non-Codex
  agent runtimes.
- If a feature would require Claude or Gemini to operate, leave it out.

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

## Architecture

```
skills/                    # 24 sub-skills
  seo/SKILL.md             # Main orchestrator + routing
agents-codex/              # 23 Codex TOML agent profiles
scripts/                   # Python execution scripts
schema/                    # JSON-LD templates
extensions/                # Optional add-ons, excluding Claude/Gemini runtimes
dungeon/                   # Phaser UI + local Codex bridge
```

## Key Principles

1. Keep Codex the only supported agent runtime.
2. Prefer existing skill and script patterns over new abstractions.
3. Preserve SSRF protections in scripts that fetch URLs.
4. Keep user-facing copy clear that SEO Dungeon is independent and Codex-only.
