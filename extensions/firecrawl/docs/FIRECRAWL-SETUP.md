# Firecrawl Setup Guide

## 1. Get Your API Key

1. Go to [firecrawl.dev/app/sign-up](https://www.firecrawl.dev/app/sign-up)
2. Create a free account (500 credits/month included)
3. Navigate to **API Keys** in the dashboard
4. Copy your API key (starts with `fc-`)

## 2. Add Project Credentials

For SEO Dungeon, the normal path is a `.env` file at the selected project root:

```bash
FIRECRAWL_API_KEY=fc-your-api-key-here
```

The app bridge forwards this key to the selected local CLI for direct API calls.
No MCP setup is required for normal audits.

## 3. Optional MCP Installer

If you intentionally want the optional MCP adapter, run the installer:

```bash
./extensions/firecrawl/install.sh
```

It will prompt for your API key and configure the MCP server.

## 4. Manual MCP Configuration

If the installer fails, add this to `~/.claude/settings.json` manually:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      }
    }
  }
}
```

## 5. Verify Credentials

Start SEO Dungeon and try:

```
/seo firecrawl map https://example.com
```

You should see a list of discovered URLs. If you intentionally use MCP and get a
"tool not available" error, restart your CLI to reload MCP servers.

## 6. Understanding Credits

| Operation | Credits Used |
|-----------|-------------|
| `crawl` | 1 per page crawled |
| `scrape` | 1 per page |
| `map` | 0.5 per URL discovered |
| `search` | 1 per result returned |

**Free tier**: 500 credits/month resets on your billing date.

**Tip**: Use `map` first (cheap) to see how many pages a site has, then decide how many to `crawl` (more expensive).
