# SEO Dungeon installer for Windows
# Installs the bundled SEO skill suite for Claude Code, Codex, or both.

$ErrorActionPreference = "Stop"

function Resolve-Python {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) { return @{ Exe = "python"; Args = @() } }
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) { return @{ Exe = "py"; Args = @("-3") } }
    return $null
}

function Copy-DirContents {
    param([string]$Source, [string]$Target)
    if (-not (Test-Path $Source)) { return }
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    Copy-Item -Path (Join-Path $Source "*") -Destination $Target -Recurse -Force
}

function Get-SourceDir {
    $scriptDir = Split-Path -Parent $PSCommandPath
    if (Test-Path (Join-Path $scriptDir "skills\seo\SKILL.md")) {
        return $scriptDir
    }

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is required for remote install."
    }

    $repo = if ($env:SEO_DUNGEON_REPO) { $env:SEO_DUNGEON_REPO } else { "https://github.com/avalonreset/seo-dungeon" }
    $ref = if ($env:SEO_DUNGEON_REF) { $env:SEO_DUNGEON_REF } else { "main" }
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
    $checkout = Join-Path $tempDir "seo-dungeon"
    Write-Host "[INFO] Downloading SEO Dungeon ($ref)..." -ForegroundColor Yellow
    git clone --depth 1 --branch $ref $repo $checkout
    return $checkout
}

function Install-PythonDeps {
    param([string]$SkillDir, [hashtable]$Python)
    if ($env:SEO_DUNGEON_SKIP_DEPS -eq "1") {
        Write-Host "[INFO] Skipping Python dependency install." -ForegroundColor Yellow
        return
    }
    $requirements = Join-Path $SkillDir "requirements.txt"
    if (-not (Test-Path $requirements)) { return }
    $venv = Join-Path $SkillDir ".venv"
    Write-Host "[INFO] Bootstrapping Python runtime at $venv" -ForegroundColor Yellow
    try {
        & $Python.Exe @($Python.Args + @("-m", "venv", $venv))
        $pip = Join-Path $venv "Scripts\pip.exe"
        & $pip install --quiet -r $requirements
    } catch {
        Write-Host "[WARN] Dependency install failed. Run: $($Python.Exe) $($Python.Args -join ' ') -m pip install -r `"$requirements`"" -ForegroundColor Yellow
    }
}

function Install-Claude {
    param([string]$SourceDir, [hashtable]$Python)
    $claudeRoot = if ($env:CLAUDE_HOME) { $env:CLAUDE_HOME } else { Join-Path $HOME ".claude" }
    $skillsRoot = Join-Path $claudeRoot "skills"
    $agentsRoot = Join-Path $claudeRoot "agents"
    $skillDir = Join-Path $skillsRoot "seo"

    Write-Host "[INFO] Installing Claude skill tree to $skillsRoot" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $skillsRoot, $agentsRoot | Out-Null
    Get-ChildItem -Path (Join-Path $SourceDir "skills") -Directory | ForEach-Object {
        Copy-DirContents $_.FullName (Join-Path $skillsRoot $_.Name)
    }
    Copy-Item -Path (Join-Path $SourceDir "agents\*.md") -Destination $agentsRoot -Force -ErrorAction SilentlyContinue
    foreach ($name in @("scripts", "schema", "pdf", "hooks", "extensions")) {
        Copy-DirContents (Join-Path $SourceDir $name) (Join-Path $skillDir $name)
    }
    Copy-Item -Path (Join-Path $SourceDir "requirements.txt") -Destination (Join-Path $skillDir "requirements.txt") -Force -ErrorAction SilentlyContinue
    Install-PythonDeps $skillDir $Python
}

function Install-Codex {
    param([string]$SourceDir, [hashtable]$Python)
    $codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
    $skillsRoot = Join-Path $codexRoot "skills"
    $agentsRoot = Join-Path $codexRoot "agents"
    $skillDir = Join-Path $skillsRoot "seo"

    Write-Host "[INFO] Installing Codex skill tree to $skillsRoot" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $skillsRoot, $agentsRoot | Out-Null
    Get-ChildItem -Path (Join-Path $SourceDir "skills") -Directory | ForEach-Object {
        Copy-DirContents $_.FullName (Join-Path $skillsRoot $_.Name)
    }
    Copy-Item -Path (Join-Path $SourceDir "agents-codex\*.toml") -Destination $agentsRoot -Force -ErrorAction SilentlyContinue
    foreach ($name in @("scripts", "schema", "pdf", "hooks", "extensions")) {
        Copy-DirContents (Join-Path $SourceDir $name) (Join-Path $skillDir $name)
    }
    Copy-Item -Path (Join-Path $SourceDir "requirements.txt") -Destination (Join-Path $skillDir "requirements.txt") -Force -ErrorAction SilentlyContinue
    Install-PythonDeps $skillDir $Python
}

$python = Resolve-Python
if ($null -eq $python) { throw "Python 3 is required." }
$versionOk = & $python.Exe @($python.Args + @("-c", "import sys; print(1 if sys.version_info >= (3, 10) else 0)"))
if ($versionOk -ne "1") { throw "Python 3.10+ is required." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is required." }

$target = if ($env:SEO_DUNGEON_TARGET) { $env:SEO_DUNGEON_TARGET.ToLowerInvariant() } else { "all" }
$sourceDir = Get-SourceDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SEO Dungeon - Installer" -ForegroundColor Cyan
Write-Host "  Claude + Codex Skill Suite" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

switch ($target) {
    "all" { Install-Claude $sourceDir $python; Install-Codex $sourceDir $python }
    "claude" { Install-Claude $sourceDir $python }
    "codex" { Install-Codex $sourceDir $python }
    default { throw "SEO_DUNGEON_TARGET must be all, claude, or codex." }
}

Write-Host "[OK] SEO Dungeon skills installed for $target." -ForegroundColor Green
Write-Host "Set SEO_DUNGEON_AGENT=codex before starting the game bridge to use Codex runtime." -ForegroundColor Cyan
