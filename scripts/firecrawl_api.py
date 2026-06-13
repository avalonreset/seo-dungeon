#!/usr/bin/env python3
"""
Direct Firecrawl API wrapper for SEO Dungeon agents.

This makes Firecrawl usable from project .env credentials without requiring MCP
setup. Credentials are read from:

    FIRECRAWL_API_KEY

Examples:
    python scripts/firecrawl_api.py map https://example.com --limit 100
    python scripts/firecrawl_api.py scrape https://example.com/page --formats markdown links
    python scripts/firecrawl_api.py crawl https://example.com --limit 25
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

try:
    import requests
except ImportError:
    print(
        json.dumps({"error": "requests library required. Install with: pip install requests"}),
        file=sys.stdout,
    )
    sys.exit(1)


API_BASE = "https://api.firecrawl.dev/v2"


def api_key() -> str:
    key = os.environ.get("FIRECRAWL_API_KEY", "").strip()
    if not key:
        print(
            json.dumps(
                {
                    "error": "missing_credentials",
                    "message": "Set FIRECRAWL_API_KEY in the selected project's .env.",
                },
                indent=2,
            )
        )
        sys.exit(1)
    return key


def post(endpoint: str, payload: dict[str, Any], timeout: int) -> int:
    headers = {"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"}
    try:
        response = requests.post(f"{API_BASE}/{endpoint}", headers=headers, json=payload, timeout=timeout)
        response.raise_for_status()
        print(json.dumps(response.json(), indent=2))
        return 0
    except requests.exceptions.HTTPError as exc:
        body = response.text[:2000] if "response" in locals() else ""
        print(
            json.dumps(
                {
                    "error": "http_error",
                    "status_code": getattr(response, "status_code", None),
                    "message": str(exc),
                    "body": body,
                },
                indent=2,
            )
        )
        return 1
    except requests.exceptions.RequestException as exc:
        print(json.dumps({"error": "request_failed", "message": str(exc)}, indent=2))
        return 1


def add_shared(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("url", help="URL to pass to Firecrawl")
    parser.add_argument("--timeout", type=int, default=60, help="Request timeout seconds")


def main() -> int:
    parser = argparse.ArgumentParser(description="Direct Firecrawl API wrapper")
    sub = parser.add_subparsers(dest="command", required=True)

    p_map = sub.add_parser("map", help="Discover URLs from a site")
    add_shared(p_map)
    p_map.add_argument("--limit", type=int, default=5000)
    p_map.add_argument("--search")
    p_map.add_argument("--sitemap", choices=["skip", "include", "only"], default="include")
    p_map.add_argument("--include-subdomains", action="store_true")
    p_map.add_argument("--ignore-cache", action="store_true")

    p_scrape = sub.add_parser("scrape", help="Scrape one page")
    add_shared(p_scrape)
    p_scrape.add_argument("--formats", nargs="+", default=["markdown", "links"])
    p_scrape.add_argument("--only-main-content", action="store_true", default=True)
    p_scrape.add_argument("--full-page", action="store_true", help="Do not restrict to main content")

    p_crawl = sub.add_parser("crawl", help="Start a crawl job")
    add_shared(p_crawl)
    p_crawl.add_argument("--limit", type=int, default=100)
    p_crawl.add_argument("--max-depth", type=int)
    p_crawl.add_argument("--include-paths", nargs="*")
    p_crawl.add_argument("--exclude-paths", nargs="*")
    p_crawl.add_argument("--formats", nargs="+", default=["markdown", "links"])

    args = parser.parse_args()

    if args.command == "map":
        payload: dict[str, Any] = {
            "url": args.url,
            "limit": args.limit,
            "sitemap": args.sitemap,
            "includeSubdomains": args.include_subdomains,
            "ignoreCache": args.ignore_cache,
        }
        if args.search:
            payload["search"] = args.search
        return post("map", payload, args.timeout)

    if args.command == "scrape":
        payload = {
            "url": args.url,
            "formats": args.formats,
            "onlyMainContent": False if args.full_page else args.only_main_content,
        }
        return post("scrape", payload, args.timeout)

    if args.command == "crawl":
        payload = {
            "url": args.url,
            "limit": args.limit,
            "scrapeOptions": {"formats": args.formats},
        }
        if args.max_depth is not None:
            payload["maxDepth"] = args.max_depth
        if args.include_paths:
            payload["includePaths"] = args.include_paths
        if args.exclude_paths:
            payload["excludePaths"] = args.exclude_paths
        return post("crawl", payload, args.timeout)

    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
