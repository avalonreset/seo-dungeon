# SEO Dungeon uninstaller for Windows

$ErrorActionPreference = "Stop"

function Remove-Suite {
    param([string]$Root, [string]$Label)
    $skillsRoot = Join-Path $Root "skills"
    $agentsRoot = Join-Path $Root "agents"

    Write-Host "[INFO] Removing SEO Dungeon $Label install from $Root" -ForegroundColor Yellow
    Remove-Item -Path (Join-Path $skillsRoot "seo") -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $skillsRoot -Directory -Filter "seo-*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $agentsRoot -File -Filter "seo-*.md" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $agentsRoot -File -Filter "seo-*.toml" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

function Get-CodexRoot {
    if ($env:CODEX_HOME) { return $env:CODEX_HOME }
    return (Join-Path $HOME ".codex")
}

Remove-Suite (Get-CodexRoot) "Codex"

Write-Host "[OK] SEO Dungeon skills removed for Codex." -ForegroundColor Green
