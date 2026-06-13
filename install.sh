#!/usr/bin/env bash
set -euo pipefail

resolve_python() {
  command -v python3 >/dev/null 2>&1 && { printf '%s\n' python3; return; }
  command -v python >/dev/null 2>&1 && { printf '%s\n' python; return; }
  return 1
}

copy_dir_contents() {
  local source="$1"
  local target="$2"
  [ -d "${source}" ] || return 0
  mkdir -p "${target}"
  cp -R "${source}/." "${target}/"
}

prepare_source() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "${script_dir}/skills/seo/SKILL.md" ]; then
    printf '%s\n' "${script_dir}"
    return
  fi

  command -v git >/dev/null 2>&1 || { echo "[ERROR] Git is required for remote install."; exit 1; }
  local repo="${SEO_DUNGEON_REPO:-https://github.com/avalonreset/seo-dungeon}"
  local ref="${SEO_DUNGEON_REF:-v2.2.2}"
  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "${temp_dir}"' EXIT
  echo "[INFO] Downloading SEO Dungeon (${ref})..."
  git clone --depth 1 --branch "${ref}" "${repo}" "${temp_dir}/seo-dungeon" 2>/dev/null
  printf '%s\n' "${temp_dir}/seo-dungeon"
}

install_python_deps() {
  local skill_dir="$1"
  local python_bin="$2"
  if [ "${SEO_DUNGEON_SKIP_DEPS:-}" = "1" ]; then
    echo "[INFO] Skipping Python dependency install."
    return 0
  fi
  [ -f "${skill_dir}/requirements.txt" ] || return 0
  local venv_dir="${skill_dir}/.venv"
  echo "[INFO] Bootstrapping Python runtime at ${venv_dir}"
  if "${python_bin}" -m venv "${venv_dir}" 2>/dev/null; then
    "${venv_dir}/bin/pip" install --quiet -r "${skill_dir}/requirements.txt" 2>/dev/null || \
      echo "[WARN] Dependency install failed. Run: ${venv_dir}/bin/pip install -r ${skill_dir}/requirements.txt"
  else
    "${python_bin}" -m pip install --quiet --user -r "${skill_dir}/requirements.txt" 2>/dev/null || \
      echo "[WARN] Dependency install failed. Run: ${python_bin} -m pip install --user -r ${skill_dir}/requirements.txt"
  fi
}

install_codex() {
  local source_dir="$1"
  local python_bin="$2"
  local codex_root="${CODEX_HOME:-${HOME}/.codex}"
  local skills_root="${codex_root}/skills"
  local agents_root="${codex_root}/agents"
  local skill_dir="${skills_root}/seo"

  echo "[INFO] Installing Codex skill tree to ${skills_root}"
  mkdir -p "${skills_root}" "${agents_root}"
  for skill_dir_source in "${source_dir}/skills"/*/; do
    [ -d "${skill_dir_source}" ] || continue
    copy_dir_contents "${skill_dir_source}" "${skills_root}/$(basename "${skill_dir_source}")"
  done
  cp "${source_dir}/agents-codex/"*.toml "${agents_root}/" 2>/dev/null || true
  for name in scripts schema pdf hooks extensions; do
    copy_dir_contents "${source_dir}/${name}" "${skill_dir}/${name}"
  done
  cp "${source_dir}/requirements.txt" "${skill_dir}/requirements.txt" 2>/dev/null || true
  install_python_deps "${skill_dir}" "${python_bin}"
}

main() {
  local python_bin
  python_bin="$(resolve_python)" || { echo "[ERROR] Python 3 is required."; exit 1; }
  command -v git >/dev/null 2>&1 || { echo "[ERROR] Git is required."; exit 1; }

  local python_ok
  python_ok="$("${python_bin}" -c 'import sys; print(1 if sys.version_info >= (3, 10) else 0)')"
  [ "${python_ok}" = "1" ] || { echo "[ERROR] Python 3.10+ is required."; exit 1; }

  local source_dir
  source_dir="$(prepare_source)"

  echo "========================================"
  echo "  SEO Dungeon - Installer"
  echo "  Codex Skill Suite"
  echo "========================================"

  install_codex "${source_dir}" "${python_bin}"

  echo "[OK] SEO Dungeon skills installed for Codex."
  echo "The dungeon app defaults to Codex and can point at local Claude or Gemini CLIs."
}

main "$@"
