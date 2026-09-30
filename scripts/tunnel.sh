#!/usr/bin/env bash
# Public HTTPS URL for staff phones during the pilot. Requires cloudflared:
#   brew install cloudflared
# Copy the printed https://….trycloudflare.com URL into AUTH_URL in .env and restart `npm run dev`.
set -euo pipefail
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. On macOS: brew install cloudflared" >&2
  exit 1
fi
exec cloudflared tunnel --url "http://localhost:${PORT:-3000}"
