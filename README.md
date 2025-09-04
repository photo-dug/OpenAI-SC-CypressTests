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

## What it does
- Logs in → opens project **The Astronauts - Surf Party** → verifies playlist + buttons → plays track #1 → checks audio + player controls → pauses → logs out.
- Produces **HTML + JSON** reports with timings; captures **screenshots/videos** on failure.
- Compares the first **5s** of live audio to `cypress/fixtures/reference.mp3` using ffmpeg + Meyda.

## CI (GitHub Actions)
- Add repository secrets: `SC_USERNAME`, `SC_PASSWORD`.
- Fingerprint strictness is **warning** in CI (`FINGERPRINT_STRICT: 'false'`). Set to `'true'` to fail on low similarity.

## Packaging
- Local: `npm run zip` → `soundcredit-e2e.zip` (excludes node_modules and artifacts).

## Variables
- If audio is still flaky in CI (MSE/DRM, etc.), set a repo variable to skip it temporarily: GitHub → Settings → Variables → Actions → add SKIP_AUDIO=true (false to enable audio check/comparison with reference file. 
