#!/usr/bin/env bash
# One-command Raspberry Pi setup for songscraper.
#
# Installs Node 22, system Chromium, and Xvfb; installs project dependencies
# (skipping Puppeteer's nonexistent ARM Chrome download); and writes a `.env`
# pre-filled with a generated API key and the Pi-specific browser settings. With
# --systemd it also installs and starts an always-on service.
#
# Idempotent: safe to re-run. It never overwrites an existing `.env`. It does NOT
# touch your Google credentials — you fill those in (and mint the refresh token)
# once, as the script tells you at the end.
#
# Usage (run from the repo root, ON the Pi):
#   bash scripts/setup-pi.sh            # install + configure
#   bash scripts/setup-pi.sh --systemd  # also install the always-on systemd service
#
# Requires sudo for the apt installs (and for --systemd). Re-run with the flag any
# time once you've confirmed a scrape works.

set -euo pipefail

WITH_SYSTEMD=0
for arg in "$@"; do
  case "$arg" in
    --systemd) WITH_SYSTEMD=1 ;;
    *) echo "Unknown option: $arg (supported: --systemd)" >&2; exit 2 ;;
  esac
done

# Resolve the repo root from this script's location, so it works from anywhere.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

# ── 1. System packages ───────────────────────────────────────────────────────
say "Installing Node 22, Chromium, and Xvfb (sudo required)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "Node $(node -v) already present — skipping."
fi
sudo apt-get install -y chromium xvfb fonts-liberation || \
  sudo apt-get install -y chromium-browser xvfb fonts-liberation

# Find the Chromium binary apt installed (package name differs across OS versions).
CHROMIUM_PATH="$(command -v chromium || command -v chromium-browser || true)"
if [ -z "$CHROMIUM_PATH" ]; then
  echo "Could not find chromium or chromium-browser on PATH after install." >&2
  exit 1
fi
echo "Using Chromium at: $CHROMIUM_PATH"

# ── 2. Project dependencies ──────────────────────────────────────────────────
say "Installing project dependencies (Puppeteer skips its ARM Chrome download)"
PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev

# ── 3. .env ──────────────────────────────────────────────────────────────────
if [ -f .env ]; then
  say ".env already exists — leaving it untouched"
else
  say "Creating .env with a generated API key and the Pi browser settings"
  cp .env.example .env
  API_KEY="$(openssl rand -hex 32)"
  # Fill the values the Pi needs; the Google credentials stay for you to complete.
  python3 - "$CHROMIUM_PATH" "$API_KEY" <<'PY'
import re, sys
chromium_path, api_key = sys.argv[1], sys.argv[2]
with open('.env') as f:
    text = f.read()

def upsert(text, key, value):
    """Set KEY=value, replacing a commented or existing line if present."""
    pat = re.compile(rf'^#?\s*{re.escape(key)}=.*$', re.MULTILINE)
    line = f'{key}={value}'
    return (pat.sub(line, text, count=1) if pat.search(text) else text.rstrip() + f'\n{line}\n')

text = upsert(text, 'API_KEY', api_key)
text = upsert(text, 'FETCH_STRATEGY', 'direct')
text = upsert(text, 'PUPPETEER_HEADLESS', 'false')
text = upsert(text, 'PUPPETEER_EXECUTABLE_PATH', chromium_path)
with open('.env', 'w') as f:
    f.write(text)
PY
  echo "Generated a random API_KEY and set FETCH_STRATEGY=direct, PUPPETEER_HEADLESS=false."
fi

# ── 4. Optional: always-on systemd service ───────────────────────────────────
if [ "$WITH_SYSTEMD" -eq 1 ]; then
  say "Installing the songscraper systemd service (sudo required)"
  NODE_BIN="$(command -v node)"
  XVFB_BIN="$(command -v xvfb-run)"
  sudo tee /etc/systemd/system/songscraper.service >/dev/null <<UNIT
[Unit]
Description=songscraper (Ultimate Guitar -> Google Docs)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$REPO_ROOT/.env
ExecStart=$XVFB_BIN -a $NODE_BIN src/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  sudo systemctl daemon-reload
  sudo systemctl enable --now songscraper
  echo "Service installed. Check it with: systemctl status songscraper"
fi

# ── Next steps ───────────────────────────────────────────────────────────────
say "Done. Remaining manual steps:"
cat <<'NEXT'
  1. Edit .env and fill in your Google OAuth values:
       GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
     (REFRESH_TOKEN can stay blank until the next step.)

  2. If you don't have a REFRESH_TOKEN yet, mint it once:
       xvfb-run -a node src/server.js
     then open http://<this-pi-ip>:8080/auth in a browser, complete Google
     consent, and copy the refresh_token into .env.

  3. Test a scrape:
       xvfb-run -a node src/server.js     # in one terminal
       curl -X POST http://localhost:8080/scrape \
         -H "x-api-key: $(grep '^API_KEY=' .env | cut -d= -f2-)" \
         -H "content-type: application/json" \
         -d '{"url":"https://tabs.ultimate-guitar.com/tab/.../...-chords-..."}'

  4. For always-on, re-run this script with --systemd (if you didn't already).

  Full guide: docs/RASPBERRY_PI.md
NEXT
