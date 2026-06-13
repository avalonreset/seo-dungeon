# Installation

SEO Dungeon has two installation surfaces:

- Codex skill installation through the root `install.ps1` or `install.sh`.
- The local dungeon app under `dungeon/`, which starts a Phaser UI and a
  localhost WebSocket bridge.

The packaged app selects Codex by default. Claude Code and Gemini CLI are also
available in the local runtime picker when those CLIs are installed.

## Requirements

- Git
- Python 3.10+
- Node.js 22+ for the dungeon app
- Codex CLI installed and signed in for the packaged default app runtime
- Optional: Claude Code CLI or Gemini CLI installed and signed in

## Install Codex Skills

Windows:

```powershell
git clone https://github.com/avalonreset/seo-dungeon.git
cd seo-dungeon
.\install.ps1
```

macOS/Linux:

```bash
git clone https://github.com/avalonreset/seo-dungeon.git
cd seo-dungeon
bash install.sh
```

Remote installs default to the current release tag:

```powershell
$env:SEO_DUNGEON_REF='v2.2.7'
.\install.ps1
```

The installer copies `skills/` into the Codex skills directory and copies
`agents-codex/*.toml` into the Codex agents directory. It also copies shared
scripts, schema templates, hooks, and extensions under the installed SEO skill.

## Run The Dungeon App

```bash
cd dungeon
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The bridge listens on
`ws://127.0.0.1:3001`.

The title screen requires YOLO Mode to be armed on every fresh app launch. The
choice is intentionally not persisted. Once the dungeon is running, the Guild
Ledger can queue follow-up prompts or promote one to run next after the active
agent turn settles.

## Runtime Selection

The title screen includes a local CLI selector:

| Runtime | Bridge command | Profile mapping |
|---------|----------------|-----------------|
| Codex | `codex exec --json` | Warrior `xhigh`, Samurai `high`, Knight `medium` |
| Claude | `claude --print` | Warrior `opus`, Samurai `sonnet`, Knight `haiku` |
| Gemini | `gemini --prompt` | Warrior `pro`, Samurai `flash`, Knight `flash-lite` |

Useful overrides:

```powershell
$env:SEO_DUNGEON_RUNTIME='codex'
$env:SEO_DUNGEON_CODEX_MODEL='gpt-5.1'
$env:SEO_DUNGEON_CLAUDE_MODEL_BALANCED='sonnet'
$env:SEO_DUNGEON_GEMINI_MODEL_BALANCED='flash'
```

Set a model variable to `default`, `auto`, or `none` to let that CLI use its own
configured default.

## Portable Usage

Compatible terminal agents can read `skills/`, `agents/`, and `scripts/`
directly from the repository. Before shipping changes to frontmatter or agent
prompts, run:

```bash
python scripts/portability_check.py --strict
```

## Uninstall

Remove the installed Codex SEO skills and agent profiles from your Codex home:

```powershell
.\uninstall.ps1
```

```bash
bash uninstall.sh
```
