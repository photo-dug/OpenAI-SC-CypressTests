# SoundCredit E2E (Cypress)

## Quick start
```bash
npm i
export SC_USERNAME="<username>"
export SC_PASSWORD="<password>"
# Default: fingerprint mismatches are warnings; to fail locally:
# export FINGERPRINT_STRICT=true
# Place the reference MP3 at cypress/fixtures/reference.mp3
npm test
```
```bash
CYPRESS_SC_USERNAME="dougross@me.com" \
CYPRESS_SC_PASSWORD="Gn^8hbr3w" \
CYPRESS_FINGERPRINT_STRICT: 'true'
CYPRESS_SKIP_AUDIO=false \
npx cypress open
```

## What it does
- Logs in → opens project **The Astronauts - Surf Party** → verifies playlist + buttons → plays track #1 → checks audio + player controls → pauses → logs out.
- Produces **HTML + JSON** reports with timings; captures **screenshots/videos** on failure.
- Compares the first **5s** of live audio to `cypress/fixtures/reference.mp3` using ffmpeg + Meyda.

## CI (GitHub Actions)
- Add repository secrets: `SC_USERNAME`, `SC_PASSWORD`.
- CYPRESS_FINGERPRINT_STRICT=true CYPRESS_SKIP_AUDIO=false npx cypress open
- Fingerprint strictness is **warning** in CI (`FINGERPRINT_STRICT: 'false'`). Set to `'true'` to fail on low similarity.
  - What strictness does (and how to force a fail)
  - Strict = false: If similarity is below 0.90, Step 7 will still pass, but we record a "warning" and the score in results.json.
  - Strict = true: If similarity < 0.90, Step 7 will fail with an assertion like: Audio similarity score 0.842.

## Packaging
- Local: `npm run zip` → `soundcredit-e2e.zip` (excludes node_modules and artifacts).

## Variables
- If audio is still flaky in CI (MSE/DRM, etc.), set a repo variable to skip it temporarily: GitHub → Settings → Variables → Actions → add SKIP_AUDIO=true (false to enable audio check/comparison with reference file. 
- To change the skip audio in the Cypress app:
  - CLI env (recommended): CYPRESS_SKIP_AUDIO=false npx cypress open
  -For a one-off headless run: CYPRESS_SKIP_AUDIO=false npx cypress run
  - cypress.env.json (in repo root):
  {
  "SKIP_AUDIO": false
  }
(Restart the Cypress app after creating/updating this.)
- Mac Terminal session export:
  export CYPRESS_SKIP_AUDIO=false
  npx cypress open
## Common gotchas
- Setting repo “Variables” is not enough by itself — you must pass them into the job’s env: (see the YAML snippet above).
- Cypress only auto-imports env with the CYPRESS_ prefix. That’s why CYPRESS_SKIP_AUDIO works without extra config. If you prefer plain SKIP_AUDIO, keep the env mapping in cypress.config.cjs as shown.
- Check for a lingering cypress.env.json that still says "SKIP_AUDIO": true.
- In Cypress Cloud (if you record there), set project env in the Dashboard under Project settings → Environment variables (use CYPRESS_SKIP_AUDIO=false)
