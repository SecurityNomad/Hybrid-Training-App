# Hybrid Training App — HYROX Prep

A personal, installable training app (PWA) for HYROX race prep. Works offline, installs to your phone's home screen, and stores your data on-device.

**Live site:** deployed via Netlify (auto-deploys on every push to this repo).

## Features

- 13-week HYROX training plan with weekly/session tracking
- **Lifts & 1RM tab** — enter your 1-rep maxes; see a working-weight percentage table
- **Auto-calculated loads** — every `@ %` prescription in the plan shows your actual kg
- **Per-session logging** — record weight used and sets done on strength days
- Benchmark logging with trend charts, race strategy, recovery and race-week guides
- Offline-first PWA with home-screen install; export/import JSON backup

## Project structure

```
index.html            # the whole app (HTML + CSS + JS)
manifest.webmanifest  # PWA manifest
sw.js                 # service worker (offline cache) — bump CACHE on each release
icon-*.png            # app icons
netlify.toml          # publish config + cache headers
INSTALL.md            # how to install on Android (home screen / APK)
```

## Deploying

Netlify is connected to this repository. **Pushing to the default branch automatically builds and deploys** — there is no build step (static files served from the repo root).

When releasing a change that affects `index.html`, bump the `CACHE` constant in `sw.js`
(e.g. `hyrox-prep-v2` → `v3`) so installed devices pick up the new version.

## Local preview

```
python3 -m http.server 8000
# then open http://localhost:8000
```
