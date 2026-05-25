#!/usr/bin/env bash
set -euo pipefail

remove_suite() {
  local root="$1"
  local label="$2"
  local skills_root="${root}/skills"
  local agents_root="${root}/agents"

  echo "[INFO] Removing SEO Dungeon ${label} install from ${root}"
  rm -rf "${skills_root}/seo" "${skills_root}"/seo-* 2>/dev/null || true
  rm -f "${agents_root}"/seo-*.md "${agents_root}"/seo-*.toml 2>/dev/null || true
}

main() {
  remove_suite "${CODEX_HOME:-${HOME}/.codex}" "Codex"
  echo "[OK] SEO Dungeon skills removed for Codex."
}

main "$@"
