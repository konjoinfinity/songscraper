# Deploying songscraper to Cloud Run

This service is **stateless and scales to zero**. It authenticates to Google with a stored OAuth
refresh token, so every scrape runs with zero human interaction. Deploy it **private or behind the
API key** — `/scrape` must never be open.

> Prerequisites: a Google Cloud project with billing, the `gcloud` CLI authenticated
> (`gcloud auth login` + `gcloud config set project <PROJECT_ID>`), and the APIs enabled:
> ```bash
> gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
>   secretmanager.googleapis.com docs.googleapis.com drive.googleapis.com
> ```

---

## 1. Create the OAuth client (one time, in the console)

1. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
2. Note the **Client ID** and **Client secret**.
3. Under **Authorized redirect URIs**, you'll add the deployed `/oauth2callback` URL in step 5
   (you don't know the Cloud Run URL yet). For now you can also add
   `http://localhost:8080/oauth2callback` for local bootstrapping.

> ⚠️ **Human action item — set the consent screen to "Production."** While the OAuth consent screen is
> in **Testing** status, Google **expires refresh tokens after 7 days**, which breaks unattended use.
> Publish the app to Production (APIs & Services → OAuth consent screen → Publish app).

---

## 2. Build and push the image

```bash
PROJECT_ID=$(gcloud config get-value project)
REGION=us-central1
REPO=songscraper
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/songscraper:latest"

# One-time: create the Artifact Registry repo
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION" || true

# Build remotely with Cloud Build (no local Docker needed)
gcloud builds submit --tag "$IMAGE"
```

---

## 3. Create the secrets

```bash
# A long random shared secret for the x-api-key header
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create API_KEY --data-file=-

# The OAuth client secret from step 1
printf '%s' "YOUR_OAUTH_CLIENT_SECRET" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-

# REFRESH_TOKEN is created in step 5 after the bootstrap; create a placeholder now
printf '%s' "PLACEHOLDER" | gcloud secrets create REFRESH_TOKEN --data-file=-
```

Grant the Cloud Run runtime service account access to read them:

```bash
SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for S in API_KEY GOOGLE_CLIENT_SECRET REFRESH_TOKEN; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
done
```

---

## 4. Deploy (first pass — to learn the URL)

`GOOGLE_CLIENT_ID`, `TEMPLATE_DOC_ID`, and `DRIVE_FOLDER_ID` are non-secret env vars; the rest are
secrets. `OAUTH_REDIRECT_URI` is filled in once we know the service URL.

```bash
gcloud run deploy songscraper \
  --image="$IMAGE" \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --set-env-vars="GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com" \
  --set-env-vars="TEMPLATE_DOC_ID=1xM26IwbTj7L9VNXwDLyXV4ZWSdLUvRybDclq_u46My4" \
  --set-secrets="API_KEY=API_KEY:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,REFRESH_TOKEN=REFRESH_TOKEN:latest"

URL=$(gcloud run services describe songscraper --region="$REGION" --format='value(status.url)')
echo "Service URL: $URL"
```

Now:
- Re-deploy with the redirect URI set:
  `gcloud run services update songscraper --region="$REGION" --update-env-vars="OAUTH_REDIRECT_URI=$URL/oauth2callback"`
- **Human action item:** add `$URL/oauth2callback` to the OAuth client's **Authorized redirect URIs**
  (step 1) in the console.

> **Private service note:** `--no-allow-unauthenticated` means callers need a Google identity token.
> For the one-time browser-based `/auth` bootstrap that's awkward, so you have two options:
> (a) temporarily `--allow-unauthenticated`, run the bootstrap (step 5), then lock it back down; or
> (b) run the bootstrap **locally** (see "Local bootstrap" below) and only deploy the resulting token.
> Either way, `/scrape` stays protected by the API key on top of any IAM.

> **⚠️ Anti-bot — `FETCH_STRATEGY` is required on Cloud Run.** Ultimate Guitar is behind Cloudflare
> bot protection that blocks headless Chrome from any IP, so the default `FETCH_STRATEGY=direct` will
> return a "Just a moment…" challenge and the scrape will fail with a clear error. Set a real-user
> egress on the deployed service (see README → *Fetching past Cloudflare*).
>
> **Recommended — `remote`: connect to a real browser on a managed provider** (Browserless or
> Browserbase) that bundles stealth + residential IPs. Cloud Run keeps orchestrating; only the browser
> runs on the provider. Create the secret first (step 3 pattern), then:
> ```bash
> # Option A — Browserless (static WS endpoint; the whole URL is the secret)
> printf '%s' "wss://production-sfo.browserless.io?token=YOUR_TOKEN&proxy=residential" \
>   | gcloud secrets create REMOTE_BROWSER_WS_ENDPOINT --data-file=-
> gcloud run services update songscraper --region="$REGION" \
>   --update-env-vars="FETCH_STRATEGY=remote" \
>   --update-secrets="REMOTE_BROWSER_WS_ENDPOINT=REMOTE_BROWSER_WS_ENDPOINT:latest"
>
> # Option B — Browserbase (a session is minted per scrape)
> printf '%s' "YOUR_BROWSERBASE_API_KEY" | gcloud secrets create BROWSERBASE_API_KEY --data-file=-
> gcloud run services update songscraper --region="$REGION" \
>   --update-env-vars="FETCH_STRATEGY=remote,BROWSERBASE_PROJECT_ID=YOUR_PROJECT_ID" \
>   --update-secrets="BROWSERBASE_API_KEY=BROWSERBASE_API_KEY:latest"
> ```
>
> Alternatives — a **web unlocker API** (returns rendered HTML, no browser):
> ```bash
> gcloud run services update songscraper --region="$REGION" \
>   --update-env-vars="FETCH_STRATEGY=unlocker,UNLOCKER_API_URL=https://api.provider.com/unlock" \
>   --update-secrets="UNLOCKER_API_KEY=UNLOCKER_API_KEY:latest"
> ```
> (Create the `UNLOCKER_API_KEY` secret first, as in step 3. For `FETCH_STRATEGY=proxy` instead, set
> `PROXY_SERVER` and the `PROXY_USERNAME`/`PROXY_PASSWORD` secret.)

---

## 5. One-time OAuth bootstrap (mint the refresh token)

Open `"$URL/auth"` in a browser, complete Google consent, and `/oauth2callback` returns JSON
containing `refresh_token`. Store it as the secret and redeploy:

```bash
printf '%s' "THE_REFRESH_TOKEN_FROM_THE_CALLBACK" | gcloud secrets versions add REFRESH_TOKEN --data-file=-
gcloud run services update songscraper --region="$REGION" --update-secrets="REFRESH_TOKEN=REFRESH_TOKEN:latest"
```

### Local bootstrap (alternative)
```bash
cp .env.example .env   # fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI=http://localhost:8080/oauth2callback
npm install && node src/server.js
# visit http://localhost:8080/auth, complete consent, copy refresh_token from the callback JSON
```

The refresh token is long-lived (once the consent screen is in **Production**). Normal runs never
re-prompt for consent — googleapis auto-mints a fresh access token each request.

---

## 6. Use it

```bash
curl -X POST "$URL/scrape" \
  -H "x-api-key: $(gcloud secrets versions access latest --secret=API_KEY)" \
  -H "content-type: application/json" \
  -d '{"url":"https://tabs.ultimate-guitar.com/tab/.../...-chords-..."}'
# -> { "docUrl": "...", "title": "...", "artist": "..." }
```

(For a private service, also pass `-H "Authorization: Bearer $(gcloud auth print-identity-token)"`.)

---

## 7. Continuous deployment (GitHub Actions + Workload Identity Federation)

Steps 2 and 4 are automated by `.github/workflows/deploy.yml`: on every merge to `main` it runs the
tests, then builds (Cloud Build, from the `Dockerfile`) and deploys to Cloud Run — authenticating
**keylessly** via Workload Identity Federation (no service-account JSON key stored in GitHub).
`.github/workflows/ci.yml` gates each PR on lint, formatting, tests (+ coverage ratchet floor), and
`npm audit`.

> **Auth model for mobile:** the deploy uses `--allow-unauthenticated`. The service is **not** open —
> `/scrape` is guarded by the `x-api-key` shared secret (constant-time check) plus UG-URL validation.
> This is what lets the iOS Shortcut (`docs/MOBILE.md`) call it without a Google identity token. If you
> prefer IAM-private instead, drop the flag and have callers send an identity token (see step 6), but
> note that complicates the phone trigger.

### One-time setup

1. **Workload Identity Federation** — create a pool + provider bound to this repo:
   ```bash
   PROJECT_ID=$(gcloud config get-value project)
   PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

   gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
   gcloud iam workload-identity-pools providers create-oidc github \
     --location=global --workload-identity-pool=github \
     --display-name="GitHub OIDC" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --attribute-condition="assertion.repository=='konjoinfinity/songscraper'" \
     --issuer-uri="https://token.actions.githubusercontent.com"
   ```

2. **Deployer service account** — create it and grant the deploy roles, then let GitHub impersonate it:
   ```bash
   gcloud iam service-accounts create songscraper-deployer
   SA="songscraper-deployer@$PROJECT_ID.iam.gserviceaccount.com"
   for ROLE in roles/run.admin roles/iam.serviceAccountUser \
               roles/cloudbuild.builds.editor roles/artifactregistry.writer; do
     gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$ROLE"
   done
   gcloud iam service-accounts add-iam-policy-binding "$SA" \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUM/locations/global/workloadIdentityPools/github/attribute.repository/konjoinfinity/songscraper"
   ```

3. **GitHub repo variables** (Settings → Secrets and variables → Actions → *Variables*):
   `GCP_PROJECT`, `GCP_REGION`, `CLOUD_RUN_SERVICE`, `GOOGLE_CLIENT_ID`, `TEMPLATE_DOC_ID`,
   `OAUTH_REDIRECT_URI`, plus:
   - `WIF_PROVIDER` = `projects/<PROJECT_NUM>/locations/global/workloadIdentityPools/github/providers/github`
   - `DEPLOY_SA` = `songscraper-deployer@<PROJECT_ID>.iam.gserviceaccount.com`

   The runtime secrets (`API_KEY`, `GOOGLE_CLIENT_SECRET`, `REFRESH_TOKEN`) stay in **Secret Manager**
   (step 3 above) — the workflow references them by name, they are never copied into GitHub.

---

## Human action items checklist
- [ ] OAuth consent screen set to **Production** (otherwise refresh tokens expire after 7 days).
- [ ] Deployed `/oauth2callback` URL added to the OAuth client's Authorized redirect URIs.
- [ ] Re-verify the Ultimate Guitar selectors in `src/config.js` against a live page; re-pin if a
      scrape returns empty fields.
- [ ] Service deployed private (`--no-allow-unauthenticated`) and/or behind the API key — never open.
