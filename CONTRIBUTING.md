# Contributing to SEO Dungeon

Thanks for your interest in contributing! Here's how to get involved.

## Reporting Bugs

Open a [GitHub Issue](https://github.com/avalonreset/seo-dungeon/issues) with:

- Your OS and Node.js version
- The full error output (copy from terminal)
- The command or step that failed
- Screenshots of any visual bugs

## Suggesting Features

Use [GitHub Discussions](https://github.com/avalonreset/seo-dungeon/discussions) for feature ideas and questions.

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test locally with `npm run dev` before submitting
5. Submit a PR with a clear description of what changed and why

### Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/seo-dungeon.git
cd seo-dungeon/dungeon
npm install
npm run dev
```

### Guidelines

- JavaScript follows standard conventions (no semicolons optional)
- Phaser scenes go in `dungeon/src/scenes/`
- Utility modules go in `dungeon/src/utils/`
- Keep sprite assets organized under `dungeon/assets/`
- Test with multiple screen DPIs when modifying rendering code

### Code Style

- JavaScript: ES modules, consistent naming
- CSS: Inline styles for Phaser overlays, external for HTML UI
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`)
