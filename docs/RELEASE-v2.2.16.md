# SEO Dungeon v2.2.16 Release Prep

## GitHub Release

**Title:** `v2.2.16 - Structured Remote Control`

**Summary:**
SEO Dungeon v2.2.16 turns the Codex remote-control work into a release-ready
workflow. Codex can now drive browser-owned setup, Battle actions, queued prompt
steering, stop/clear controls, and vanquish receipts through waitable structured
events while the Guild Ledger mirrors the flow. The release also adds recursive
browser and desktop proof recorders so future work can be tested with video,
screenshots, manifests, ledger transcripts, and session logs instead of manual
screenshots.

**Highlights:**
- Codex-driven `ui-intent` flows for setup, Gate resume, Hall selection, Battle
  attack, queue steering, stop, clear, and vanquish.
- Shared session ledger events between the browser Guild Ledger, bridge, and
  local helper CLI.
- Active operation readbacks now expose `canSteer` and `steerMode` so steering
  waits for a real app-server turn instead of racing startup.
- Browser and full-desktop proof recorders archive video, frames, screenshots,
  manifests, session logs, ledger transcripts, CLI receipts, and bridge output.
- Desktop proof success now asserts required actions, steer readiness, absence
  of failed-steer messages, foreground capture, Codex window positioning for
  real-Codex runs, and zero active operations at the end.

**Validation:**
- `npm run test:all`
- `npm run build`
- `python -m pytest tests/ -q`
- `python scripts/portability_check.py --strict`
- `git diff --check`

## Website Follow-Through

After the GitHub release is live, update `E:\seo-dungeon-website` surfaces that
currently describe `v2.2.15` freshness:

- Public release/version copy.
- `lastVerified` / `dateModified` fields.
- `llms.txt` and `humans.txt` freshness lines.
- Any homepage/docs copy that still says the latest release is `v2.2.15`.
- Any source notes that cite `E:\seodungeon` package truth as `2.2.15`.

Recommended website headline:

> SEO Dungeon v2.2.16 adds structured Codex remote control and proof-backed
> recursive testing for the Guild Ledger workflow.

## Skool / Classroom Post Draft

**Title:** SEO Dungeon v2.2.16 - Codex Remote Control Gets Real Proof

**Post:**
SEO Dungeon v2.2.16 is out. This release focuses on the Codex-driven control
loop: Codex can now drive setup, battle actions, queued prompt steering, stop,
clear, and vanquish behavior through structured local events while the Guild
Ledger mirrors what happened.

The bigger practical improvement is the proof loop. The repo now includes
browser and full-desktop recorders that capture video, screenshots, manifests,
session logs, ledger transcripts, and CLI receipts. That means future changes
can be tested by the agent itself instead of relying on manual screenshots.

Good first thing to try:

```powershell
cd dungeon
npm install
npm run dev
```

Then use the Codex default runtime and test the Guild Ledger queue/steer flow.

GitHub release: <add release URL after publishing>

## Release Cut Checklist

- [ ] Commit `v2.2.16` release prep.
- [ ] Create/push tag `v2.2.16`.
- [ ] Publish GitHub release with the notes above.
- [ ] Confirm GitHub marks `v2.2.16` as latest.
- [ ] Update and deploy the website freshness surfaces.
- [ ] Publish/update the Skool classroom post with the final release URL.
