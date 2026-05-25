# Troubleshooting

SEO Dungeon is Codex-only. There are no Claude Code or Gemini CLI fallback
paths.

| Problem | Fix |
|---------|-----|
| Bridge is unreachable | Run `npm run server` from `dungeon/`, or `npm run dev` to start both services. |
| Game is unreachable | Run `npm run game` from `dungeon/` and open `http://localhost:3000`. |
| Codex fails to spawn | Confirm `codex` is installed, signed in, and on `PATH`. |
| Skills are missing | Re-run `install.ps1` or `install.sh` from the repo root. |
| Python dependency error | Install with `python -m pip install -r requirements.txt`, or rerun the installer without `SEO_DUNGEON_SKIP_DEPS=1`. |
| Audit is slow | First full-site audits can take several minutes. Use cached audits when available. |
| Google API commands fail | Run `/seo google` and follow the credential setup instructions. |
| Drift comparison fails | Run `/seo drift baseline <url>` before `/seo drift compare <url>`. |
