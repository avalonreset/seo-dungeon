#!/usr/bin/env python3
"""
Small direct DataForSEO API wrapper for SEO Dungeon agents.

This avoids making MCP setup a requirement. Credentials are read from the
selected project environment:

    DATAFORSEO_USERNAME or DATAFORSEO_LOGIN
    DATAFORSEO_PASSWORD

Examples:
    python scripts/dataforseo_api.py get /appendix/user_data
    python scripts/dataforseo_api.py post /serp/google/organic/live/advanced --data '[{"keyword":"seo tools","location_code":2840,"language_code":"en"}]'
    python scripts/dataforseo_api.py post /serp/google/organic/live/advanced --file payload.json
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    print(
        json.dumps({"error": "requests library required. Install with: pip install requests"}),
        file=sys.stdout,
    )
    sys.exit(1)


API_BASE = "https://api.dataforseo.com/v3"


def credentials() -> tuple[str, str]:
    username = os.environ.get("DATAFORSEO_USERNAME") or os.environ.get("DATAFORSEO_LOGIN")
    password = os.environ.get("DATAFORSEO_PASSWORD")
    if not username or not password:
        print(
            json.dumps(
                {
                    "error": "missing_credentials",
                    "message": (
                        "Set DATAFORSEO_USERNAME or DATAFORSEO_LOGIN plus "
                        "DATAFORSEO_PASSWORD in the selected project's .env."
                    ),
                },
                indent=2,
            )
        )
        sys.exit(1)
    return username, password


def auth_headers(username: str, password: str) -> dict[str, str]:
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}


def endpoint_url(endpoint: str) -> str:
    clean = endpoint.strip()
    if clean.startswith("http://") or clean.startswith("https://"):
        if not clean.startswith(API_BASE + "/"):
            raise SystemExit("Only DataForSEO v3 endpoints are allowed.")
        return clean
    clean = clean.lstrip("/")
    if clean.startswith("v3/"):
        clean = clean[3:]
    if not clean:
        raise SystemExit("Endpoint path is required.")
    return f"{API_BASE}/{clean}"


def load_payload(args: argparse.Namespace) -> Any:
    if args.file:
        return json.loads(Path(args.file).read_text(encoding="utf-8"))
    if args.data:
        return json.loads(args.data)
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Direct DataForSEO API wrapper")
    parser.add_argument("method", choices=["get", "post"], help="HTTP method")
    parser.add_argument("endpoint", help="DataForSEO v3 endpoint path")
    parser.add_argument("--data", help="JSON payload for POST")
    parser.add_argument("--file", help="Read JSON payload for POST from a file")
    parser.add_argument("--timeout", type=int, default=60, help="Request timeout seconds")
    args = parser.parse_args()

    username, password = credentials()
    headers = auth_headers(username, password)
    url = endpoint_url(args.endpoint)

    try:
        if args.method == "get":
            response = requests.get(url, headers=headers, timeout=args.timeout)
        else:
            payload = load_payload(args)
            if payload is None:
                parser.error("POST requires --data or --file")
            response = requests.post(url, headers=headers, json=payload, timeout=args.timeout)
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


if __name__ == "__main__":
    raise SystemExit(main())
