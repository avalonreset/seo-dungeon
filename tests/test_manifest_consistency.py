"""
Tests that ensure the plugin's manifest and user-visible docs claim
counts that match reality on disk.

Background: this guard exists because the v1.9.7 release process suffered
two distinct skill-count drift incidents in a single release window. The
first was caught by manual reconciliation (pre-Phase-A); the second slipped
through when PR #56 merged a 21st core skill but the canonical phrasing
locked in Phase A was not re-run. v1.9.8 closes the systemic gap.

Tests run via `pytest tests/` and are wired into `.github/workflows/ci.yml`.
"""
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PLUGIN_JSON = REPO_ROOT / ".codex-plugin" / "plugin.json"
CITATION_CFF = REPO_ROOT / "CITATION.cff"


def _read_text(path: Path) -> str:
    """Read repo text files as UTF-8 so tests behave the same on Windows and CI."""
    return path.read_text(encoding="utf-8")


def _read_json(path: Path):
    return json.loads(_read_text(path))


def _count_skill_dirs() -> int:
    """Count subdirectories of skills/ that contain a SKILL.md."""
    skills_dir = REPO_ROOT / "skills"
    return sum(
        1 for d in skills_dir.iterdir()
        if d.is_dir() and (d / "SKILL.md").is_file()
    )


def _count_agent_files() -> int:
    """Count Codex agent profile files."""
    agents_dir = REPO_ROOT / "agents-codex"
    return sum(
        1 for f in agents_dir.iterdir()
        if f.is_file() and f.suffix == ".toml" and f.name.startswith("seo-")
    )


def _extract_count(text: str, unit: str) -> int:
    """Find the first occurrence of 'N <unit>' in text and return N."""
    match = re.search(rf"(\d+)\s+{re.escape(unit)}", text)
    if not match:
        raise AssertionError(f"No '{unit}' count claim found in text")
    return int(match.group(1))


def test_plugin_json_skill_count_matches_disk():
    """plugin.json description's 'N sub-skills' claim must equal skills/ dir count."""
    plugin = _read_json(PLUGIN_JSON)
    claimed = _extract_count(plugin["description"], "sub-skills")
    actual = _count_skill_dirs()
    assert claimed == actual, (
        f"plugin.json description claims {claimed} sub-skills "
        f"but disk has {actual}. "
        f"Update the description to match the new count."
    )


def test_plugin_json_subagent_count_matches_disk():
    """plugin.json description's 'N sub-agents' claim must equal agents/ count."""
    plugin = _read_json(PLUGIN_JSON)
    claimed = _extract_count(plugin["description"], "sub-agents")
    actual = _count_agent_files()
    assert claimed == actual, (
        f"plugin.json description claims {claimed} sub-agents "
        f"but disk has {actual}. "
        f"Update the description to match the new count."
    )


def test_canonical_phrasing_in_user_visible_docs():
    """README and AGENTS.md must reference the canonical sub-skills count."""
    plugin = _read_json(PLUGIN_JSON)
    canonical_count = _extract_count(plugin["description"], "sub-skills")
    target_phrase = f"{canonical_count} sub-skills"
    for filename in ["README.md", "AGENTS.md"]:
        path = REPO_ROOT / filename
        head = "\n".join(_read_text(path).splitlines()[:120])
        assert target_phrase in head, (
            f"{filename} does not reference '{target_phrase}' in its first "
            f"120 lines. Update it to match plugin.json's canonical phrasing."
        )


def test_version_triangulation():
    """plugin.json version must equal CITATION.cff version."""
    plugin = _read_json(PLUGIN_JSON)
    citation_text = _read_text(CITATION_CFF)
    citation_match = re.search(r"^version:\s*(\S+)", citation_text, re.MULTILINE)
    assert citation_match, "CITATION.cff has no 'version:' line"
    plugin_version = plugin["version"]
    citation_version = citation_match.group(1)
    assert plugin_version == citation_version, (
        f"plugin.json version is {plugin_version} but CITATION.cff has "
        f"{citation_version}. They must match every release."
    )


def test_pyproject_version_matches_plugin_json():
    """pyproject.toml version must equal plugin.json version.

    Background: pyproject.toml drifted to 1.9.6 while plugin.json was at
    1.9.8. The original triangulation test only covered CITATION.cff,
    so pyproject.toml drift slipped past CI. This guard closes that gap.
    """
    plugin = _read_json(PLUGIN_JSON)
    pyproject_text = _read_text(REPO_ROOT / "pyproject.toml")
    pyproject_match = re.search(
        r'^version\s*=\s*"([^"]+)"', pyproject_text, re.MULTILINE
    )
    assert pyproject_match, "pyproject.toml has no 'version = \"...\"' line"
    plugin_version = plugin["version"]
    pyproject_version = pyproject_match.group(1)
    assert plugin_version == pyproject_version, (
        f"plugin.json version is {plugin_version} but pyproject.toml has "
        f"{pyproject_version}. Bump pyproject.toml on every release."
    )


def test_install_scripts_default_ref_matches_plugin_version():
    """install.sh and install.ps1 default SEO_DUNGEON_REF must equal v{plugin version}.

    Background: upstream v1.9.9 added a guard because install.sh and install.ps1
    had drifted to an old default tag. SEO Dungeon uses SEO_DUNGEON_REF and keeps
    the same release invariant.
    """
    plugin = _read_json(PLUGIN_JSON)
    expected_tag = f"v{plugin['version']}"

    sh_text = _read_text(REPO_ROOT / "install.sh")
    sh_match = re.search(
        r'local ref="\$\{SEO_DUNGEON_REF:-([^}]+)\}"', sh_text
    )
    assert sh_match, "install.sh has no recognizable SEO_DUNGEON_REF default"
    sh_tag = sh_match.group(1)
    assert sh_tag == expected_tag, (
        f"install.sh default tag is {sh_tag} but plugin.json is at "
        f"version {plugin['version']} (expected {expected_tag}). "
        f"Bump install.sh's SEO_DUNGEON_REF default on every release."
    )

    ps_text = _read_text(REPO_ROOT / "install.ps1")
    ps_match = re.search(
        r'\$ref\s*=\s*if\s*\(\$env:SEO_DUNGEON_REF\)\s*\{[^}]+\}\s*else\s*\{\s*"([^"]+)"\s*\}',
        ps_text,
    )
    assert ps_match, "install.ps1 has no recognizable SEO_DUNGEON_REF default"
    ps_tag = ps_match.group(1)
    assert ps_tag == expected_tag, (
        f"install.ps1 default tag is {ps_tag} but plugin.json is at "
        f"version {plugin['version']} (expected {expected_tag}). "
        f"Bump install.ps1's SEO_DUNGEON_REF default on every release."
    )


def _extract_section(text: str, heading: str) -> str:
    """Return the body of a `## <heading>` section, up to the next H2 heading or EOF."""
    pattern = rf"^## {re.escape(heading)}\b.*?(?=^## |\Z)"
    m = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    return m.group(0) if m else ""


def test_orchestrator_sub_skills_list_matches_disk():
    """skills/seo/SKILL.md Sub-Skills numbered list must equal set(skills/*) minus orchestrator itself.

    Background: v1.9.8 CI guard checked user-facing docs but not the orchestrator's
    own canonical-phrasing source. PR #92 surfaced that the orchestrator had stale "21
    specialized" claims and the list included seo-firecrawl (extension-only). This
    guard closes that gap.
    """
    text = _read_text(REPO_ROOT / "skills" / "seo" / "SKILL.md")
    section = _extract_section(text, "Sub-Skills")
    listed_list = re.findall(r"^\d+\.\s+\*\*(seo-[a-z-]+)\*\*", section, re.MULTILINE)
    assert len(listed_list) == len(set(listed_list)), (
        f"Duplicate entries in Sub-Skills list: "
        f"{[n for n in listed_list if listed_list.count(n) > 1]}"
    )
    listed = set(listed_list)
    on_disk = {
        d.name for d in (REPO_ROOT / "skills").iterdir()
        if d.is_dir() and (d / "SKILL.md").is_file()
    }
    # The orchestrator (`seo`) does not list itself.
    # seo-firecrawl is documented separately in an Optional Extensions subsection
    # because it lives only in extensions/, not in skills/.
    expected = on_disk - {"seo"}
    assert listed == expected, (
        f"Sub-Skills list != skills/ dir. "
        f"Missing from list: {sorted(expected - listed)}. "
        f"Extra in list: {sorted(listed - expected)}."
    )


def test_orchestrator_subagents_list_matches_disk():
    """skills/seo/SKILL.md Subagents bullet list must equal set(agents-codex/seo-*.toml), no duplicates.

    Background: same drift pattern as Sub-Skills. Codex round 3 review surfaced that
    the Subagents list was missing seo-flow (file on disk) and included seo-firecrawl
    (no agent file on disk).
    """
    text = _read_text(REPO_ROOT / "skills" / "seo" / "SKILL.md")
    section = _extract_section(text, "Subagents")
    listed_list = re.findall(r"^- `(seo-[a-z-]+)`", section, re.MULTILINE)
    assert len(listed_list) == len(set(listed_list)), (
        f"Duplicate entries in Subagents list: "
        f"{[n for n in listed_list if listed_list.count(n) > 1]}"
    )
    listed = set(listed_list)
    on_disk = {
        p.stem for p in (REPO_ROOT / "agents-codex").iterdir()
        if p.is_file() and p.suffix == ".toml" and p.name.startswith("seo-")
    }
    assert listed == on_disk, (
        f"Subagents list != agents-codex/ dir. "
        f"Missing from list: {sorted(on_disk - listed)}. "
        f"Extra in list: {sorted(listed - on_disk)}."
    )


def _extract_frontmatter(text: str) -> str:
    """Return the YAML frontmatter block (between the first two `---` lines).

    Returns the body between the delimiters (exclusive), or empty string if no
    frontmatter present. Scoping the regex search to this block prevents a
    fenced code example or later doc snippet from satisfying a metadata check.
    """
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    return m.group(1) if m else ""


def test_skill_metadata_versions_match_plugin_json():
    """Every SKILL.md metadata.version must equal plugin.json version (with community allowlist).

    Covers in-tree skills/*/SKILL.md and extension-mirror copies under
    extensions/*/skills/*/SKILL.md. Community contributions can be allowlisted
    to keep their own version cadence.

    Implementation note: parses the YAML frontmatter block specifically so that
    a fenced code example or later doc snippet showing `version: "x"` cannot
    satisfy the assertion after metadata.version has been removed from frontmatter.
    """
    # Community-contributed skills that maintain their own version cadence.
    # Each entry: skill name -> expected literal version string.
    COMMUNITY_OVERRIDES = {"seo-content-brief": "1.0.0"}

    plugin = _read_json(PLUGIN_JSON)
    expected_default = plugin["version"]
    errors = []

    candidates = list((REPO_ROOT / "skills").glob("*/SKILL.md")) + list(
        (REPO_ROOT / "extensions").glob("*/skills/*/SKILL.md")
    )
    for skill_md in candidates:
        skill_name = skill_md.parent.name
        rel = skill_md.relative_to(REPO_ROOT)
        text = _read_text(skill_md)
        frontmatter = _extract_frontmatter(text)
        if not frontmatter:
            errors.append(f"{rel} has no YAML frontmatter block")
            continue
        # metadata.version is nested under `metadata:` and indented by 2 spaces
        match = re.search(
            r'^  version:\s*"([^"]+)"', frontmatter, re.MULTILINE
        )
        if not match:
            errors.append(f"{rel} has no metadata.version in frontmatter")
            continue
        actual = match.group(1)
        expected = COMMUNITY_OVERRIDES.get(skill_name, expected_default)
        if actual != expected:
            errors.append(f"{rel}: version is {actual}, expected {expected}")

    assert not errors, "Skill metadata.version drift:\n  " + "\n  ".join(errors)


def test_canonical_math_adds_up():
    """The canonical phrasing's parenthetical breakdown must sum to the headline count."""
    plugin = _read_json(PLUGIN_JSON)
    desc = plugin["description"]
    headline_match = re.search(r"(\d+)\s+sub-skills\s+\(([^)]+)\)", desc)
    assert headline_match, (
        "plugin.json description must use the canonical 'N sub-skills (...)' "
        "phrasing with a parenthetical breakdown"
    )
    headline = int(headline_match.group(1))
    breakdown = headline_match.group(2)
    parts = [int(n) for n in re.findall(r"(\d+)\s+(?:core|orchestrator|framework|extension)", breakdown)]
    assert sum(parts) == headline, (
        f"plugin.json canonical phrasing breakdown {breakdown!r} sums to "
        f"{sum(parts)} but headline claims {headline}. Math must add up."
    )
