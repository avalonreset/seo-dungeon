# Installation

SEO Dungeon installs into Codex only.

## Requirements

- Node.js 18+
- Python 3.10+
- Git
- Codex CLI installed and signed in

## Install Skills

```powershell
.\install.ps1
```

```bash
bash install.sh
```

The installer copies `skills/`, `agents-codex/`, `scripts/`, `schema/`, `pdf/`,
`hooks/`, and supported extensions into `~/.codex`.

## Run The Game

```bash
cd dungeon
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Uninstall

```powershell
.\uninstall.ps1
```

```bash
bash uninstall.sh
```
