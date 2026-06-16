# Self-hosting songscraper on a Raspberry Pi (free, no paid provider)

This is the **zero-cost** way to run songscraper. A Raspberry Pi at home gives you the two things
Ultimate Guitar's Cloudflare wall demands — for free:

1. **A residential IP** — your home internet, which Cloudflare trusts (datacenter IPs get blocked).
2. **A place to run a _real_ browser** — UG blocks *headless* Chrome even from a residential IP, so we
   run a **real (headed) Chrome** under a **virtual display (Xvfb)**, since the Pi has no monitor.

Residential IP + real browser fingerprint = the plain `FETCH_STRATEGY=direct` path works, with **no
proxy, no unlocker, and no managed-browser bill**. The always-on Pi is also what makes it
phone-triggerable without any other computer running.

> Trade-off vs. the cloud: the Pi must stay powered on (it's a server, so it already is), and you
> manage the box yourself. In exchange, the only ongoing cost is the electricity you're already
> paying. See `DEPLOY.md` for the paid Cloud Run + managed-browser alternative.

---

## Quick path: the setup script

If you'd rather not run the steps below by hand, a bootstrap script does steps 1–5 for you — install
packages, install deps, write a `.env` with a generated API key + the Pi browser settings, and
(optionally) install the always-on service. Run it **on the Pi**, from the repo root:

```bash
git clone https://github.com/konjoinfinity/songscraper.git && cd songscraper
bash scripts/setup-pi.sh            # install + configure
# or, to also install the always-on systemd service:
bash scripts/setup-pi.sh --systemd
```

It's idempotent (safe to re-run) and never overwrites an existing `.env`. It does **not** touch your
Google credentials — it prints the two remaining manual steps (fill in `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`, then mint the refresh token via `/auth`) when it finishes. The rest of this
doc is the same process done manually, plus reference detail.

---

## 0. What you need

- A Raspberry Pi (Pi 4 / Pi 5 with 2 GB+ RAM recommended — Chrome is memory-hungry) running a recent
  64-bit Raspberry Pi OS / Debian (Bookworm).
- The Pi on your home network (Ethernet or Wi-Fi).
- Your Google OAuth client (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) and a **refresh token** — see
  `DEPLOY.md` §5 (you can run the one-time `/auth` bootstrap locally and copy the token to the Pi).

---

## 1. Install Node 22, Chromium, and Xvfb

Puppeteer's bundled Chrome has **no Linux/ARM desktop build**, so on a Pi you must use the system
Chromium and tell Puppeteer to skip its own download (step 2). Install everything from apt:

```bash
# Node 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# System Chromium + a virtual display + fonts Chrome needs to render
sudo apt-get install -y chromium xvfb fonts-liberation

# Confirm the Chromium path (usually /usr/bin/chromium; older OSes: /usr/bin/chromium-browser)
which chromium || which chromium-browser
```

---

## 2. Get the code and install dependencies

```bash
git clone https://github.com/konjoinfinity/songscraper.git
cd songscraper

# Skip Puppeteer's (nonexistent on ARM) Chromium download — we use the system one.
PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev
```

---

## 3. Configure `.env`

Copy the example and fill it in. The Pi-specific lines are the last three:

```bash
cp .env.example .env
```

```bash
# .env (Pi)
API_KEY=<a-long-random-string>            # the x-api-key your phone will send
GOOGLE_CLIENT_ID=<...>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<...>
OAUTH_REDIRECT_URI=http://localhost:8080/oauth2callback
REFRESH_TOKEN=<the-long-lived-refresh-token>
TEMPLATE_DOC_ID=1xM26IwbTj7L9VNXwDLyXV4ZWSdLUvRybDclq_u46My4

# ── The Raspberry Pi browser settings ──
FETCH_STRATEGY=direct                     # navigate UG directly from your residential IP
PUPPETEER_HEADLESS=false                  # launch a REAL (headed) browser — beats the headless block
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium   # the system Chromium from step 1
```

> `.env` holds secrets — it is git-ignored; never commit it.

---

## 4. Test it under Xvfb

`xvfb-run` starts a throwaway virtual display and runs the command inside it, so the headed Chrome has
somewhere to draw:

```bash
xvfb-run -a node src/server.js
```

In another terminal (on the Pi), scrape a song:

```bash
curl -X POST http://localhost:8080/scrape \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"url":"https://tabs.ultimate-guitar.com/tab/.../...-chords-..."}'
# -> { "docUrl": "...", "title": "...", "artist": "..." }
```

If you get a Google Doc link back, you're done — Cloudflare let the real browser through.

---

## 5. Run it always-on with systemd

So it survives reboots and starts the virtual display for you. Create
`/etc/systemd/system/songscraper.service` (adjust `User` and `WorkingDirectory`):

```ini
[Unit]
Description=songscraper (Ultimate Guitar -> Google Docs)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/songscraper
EnvironmentFile=/home/pi/songscraper/.env
# xvfb-run wraps node in a virtual display so the headed Chrome can render.
ExecStart=/usr/bin/xvfb-run -a /usr/bin/node src/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now songscraper
systemctl status songscraper          # should be "active (running)"
journalctl -u songscraper -f          # live logs
```

---

## 6. Trigger it from your phone

The service now listens on the Pi's port 8080. How your phone reaches it depends on where you are:

- **On your home Wi-Fi (simplest):** point the iOS Shortcut (`docs/MOBILE.md`) at the Pi's LAN address,
  e.g. `http://192.168.1.50:8080/scrape`. Give the Pi a static/reserved IP in your router so it
  doesn't change.
- **From anywhere (recommended): [Tailscale](https://tailscale.com).** Install it on the Pi and your
  phone (both free); the phone then reaches the Pi at its private Tailscale IP from any network, with
  no port-forwarding and nothing exposed to the public internet.
- **From anywhere, public URL: a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)**
  (or similar) gives the Pi an HTTPS URL without opening router ports. Only do this with the `x-api-key`
  guard on (it is) — the endpoint is then internet-reachable.

> Whichever you pick, the `x-api-key` shared secret + UG-URL validation remain the auth boundary —
> never run the service without `API_KEY` set.

---

## Troubleshooting

- **Still getting a "Blocked by anti-bot protection" error.** Confirm `PUPPETEER_HEADLESS=false` is set
  (a headless browser is blocked even on a residential IP) and that you're launching via `xvfb-run`.
  Verify the IP really is residential (a VPN on the Pi can route you out a flagged datacenter IP).
- **`Failed to launch the browser process` / no display.** You ran `node` directly instead of through
  `xvfb-run`, or `xvfb` isn't installed. Re-check step 1 and use `xvfb-run -a`.
- **Chromium path wrong.** If `which chromium` is empty, your OS ships `chromium-browser`; set
  `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`.
- **Out of memory / Chrome crashes on a Pi with little RAM.** Close other services, or add swap. The
  container-safe flags (`--disable-dev-shm-usage` etc.) are already applied.
- **Cloudflare hardens and even the headed browser is challenged.** As a next step you can add a
  stealth layer (e.g. `puppeteer-extra` + the stealth plugin) — this is intentionally not a dependency
  today to keep the tree lean. Open an issue if you hit this.
