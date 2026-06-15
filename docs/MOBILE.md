# Trigger a scrape from your phone (iOS Shortcut)

songscraper needs no app and no new code to be driven from a phone. `POST /scrape { url }` already
returns `{ docUrl, title, artist }`, so an **iOS Shortcut** can take a shared Ultimate Guitar link,
call the service, and open the finished Google Doc.

## Prerequisites

- The service deployed and reachable at a public HTTPS URL (Cloud Run). For the Shortcut to call it
  without a Google identity token, deploy with `--allow-unauthenticated` — the service stays protected
  by the `x-api-key` shared secret + UG-URL validation (see `DEPLOY.md` §7). The API key **is** the
  auth boundary.
- Your `API_KEY` value (the same secret the service checks). Treat it like a password.

## Build the Shortcut

Open **Shortcuts → + (new) → rename it e.g. "Scrape Song"**, then add these actions in order:

1. **Settings (ⓘ at the bottom): turn on "Show in Share Sheet"**, and set *Share Sheet Types* to
   **URLs** (and optionally *Text*). This makes the Shortcut appear when you tap **Share** on a tab in
   Safari or the Ultimate Guitar app.

2. **Receive** `URLs` input from **Share Sheet**. Set *If there's no input*: **Ask for Input** (Type:
   URL) — so you can also run it manually and paste a link.

3. **Text** → set its value to the Shortcut Input (the shared URL). (This gives a clean string to put
   in the request body.)

4. **Get Contents of URL**:
   - **URL**: `https://<your-cloud-run-url>/scrape`
   - **Method**: `POST`
   - **Headers**:
     - `x-api-key` = `<YOUR_API_KEY>`
     - `Content-Type` = `application/json`
   - **Request Body**: **JSON**
     - key `url` (Text) = the **Text** variable from step 3

5. **Get Dictionary Value** → **Value** for key `docUrl` from the **Contents of URL** result.

6. **Open URLs** → the `docUrl` value. (Opens the new Google Doc in Safari/Docs.)
   - Optional: add **Show Notification** with the `title` and `artist` dictionary values for a
     confirmation toast instead of (or before) opening.

## Use it

- From Safari or the UG app, open a chord chart → **Share** → **Scrape Song** → the Doc opens.
- Or run the Shortcut from the Home Screen / "Hey Siri, Scrape Song" and paste a link.

## Request shape (reference)

```http
POST /scrape
Host: <your-cloud-run-url>
x-api-key: <YOUR_API_KEY>
Content-Type: application/json

{ "url": "https://tabs.ultimate-guitar.com/tab/.../...-chords-..." }
```

```json
// 200 OK
{ "docUrl": "https://docs.google.com/document/d/.../edit", "title": "...", "artist": "..." }
```

Errors: `401` (missing/invalid `x-api-key`), `400` (not a valid `ultimate-guitar.com` URL), `500`
(scrape or Google API failure — body has a `detail`).

## Security notes

- The `x-api-key` stored in the Shortcut grants scrape access. If a device is lost or the key leaks,
  rotate it: add a new `API_KEY` secret version and redeploy, then update the Shortcut.
- Keep the URL validation and the constant-time key check (already in `src/server.js`) — never expose
  `/scrape` without the key.

## Android / other phones

The same HTTP contract works from any client. Android equivalents: an **HTTP Shortcuts** app, a
**Tasker** task, or — for a no-install, cross-platform option — a small **Telegram bot** that forwards
a pasted link to `/scrape` and replies with the Doc link. (Telegram bot is out of scope here; the
iOS Shortcut is the chosen path.)
