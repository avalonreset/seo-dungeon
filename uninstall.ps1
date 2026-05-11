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

function Get-ClaudeRoot {
    if ($env:CLAUDE_HOME) { return $env:CLAUDE_HOME }
    return (Join-Path $HOME ".claude")
}

function Get-CodexRoot {
    if ($env:CODEX_HOME) { return $env:CODEX_HOME }
    return (Join-Path $HOME ".codex")
}

$target = if ($env:SEO_DUNGEON_TARGET) { $env:SEO_DUNGEON_TARGET.ToLowerInvariant() } else { "all" }

switch ($target) {
    "all" {
        Remove-Suite (Get-ClaudeRoot) "Claude"
        Remove-Suite (Get-CodexRoot) "Codex"
    }
    "claude" { Remove-Suite (Get-ClaudeRoot) "Claude" }
    "codex" { Remove-Suite (Get-CodexRoot) "Codex" }
    default { throw "SEO_DUNGEON_TARGET must be all, claude, or codex." }
}

Write-Host "[OK] SEO Dungeon skills removed for $target." -ForegroundColor Green
