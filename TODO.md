# Tasks & Roadmap: Audio Analysis Studio

## Phase 1 - Infrastructure & Core Setup (Done)
- [x] T001 Create `docker-compose.yml` mounting `./music_in` to backend
- [x] T002 Create `backend/Dockerfile` using `ghcr.io/mtg/essentia:bullseye` base
- [x] T003 Create `frontend/Dockerfile` using `node:18-alpine`
- [x] T004 Initialize React+Vite project in `frontend/`
- [x] T005 Initialize FastAPI project in `backend/`

## Phase 2 - Analysis Engines (Done)
- [x] T006 [US1] Implement multi-engine architecture (BeatNet, MusicalKeyCNN, Madmom, Quality, Structure)
- [x] T007 [US1] Standard to Camelot key conversion & harmonic relationship matching
- [x] T008 [US1] Audio authenticity, cutoff detection, LUFS & True Peak inspection
- [x] T009 [US1] Section segmentation & chord progression extraction

## Phase 3 - Security, Reliability & Ops (Done)
- [x] API-key auth on every gateway route (+ `/files/*`), frontend key prompt
- [x] SSRF guard on URL intake (public http/https hosts only, `ALLOW_PRIVATE_URLS` opt-out)
- [x] Upload size limit, atomic writes, no silent overwrite of different files with the same name
- [x] Failed engines return `null` + `engine_errors` instead of invented BPM/key; no ID3 writes from failed engines
- [x] Celery tasks use fresh HTTP client per event loop to prevent "Event loop is closed" errors
- [x] CI publishes all 9 images via matrix with layer caching, runs Vitest, shared test requirements
- [x] Dependabot covers every worker, `LICENSE`, `.env.example`, compose healthchecks, README refresh

## Phase 4 - UI/UX Overhaul (Done)
- [x] Track-first layout: sticky player, tabs (Overview / Harmony / Structure / Quality / Pitch & tempo), compact header with selected-track summary
- [x] Library: search, key and BPM-range filters, sortable columns, "Mixes with selected", "Needs attention"
- [x] Manual BPM/key correction with half/double-time buttons (kept across re-analysis)
- [x] Save & tag card with live filename preview and click-to-insert tokens; mobile order fixed
- [x] Keyboard shortcuts (`Space`, `←/→`, `1-5`, `J/K`, `/`, `?` for help), tablist/dialog ARIA, focus rings, skip link
- [x] Contrast pass: text-slate-500 raised to slate-400 (7:1+), helper text >= 11 px; axe-core reports 0 WCAG A/AA violations

## Phase 5 - Library Features & Ingest (Done)
- [x] Batch drops + watch folder (`WATCH_FOLDER=true`, `./data/watch`)
- [x] Library export: CSV (formula injection safe), JSON, Rekordbox XML (BPM + key; no beat grid)
- [x] Harmonic-mixing helper ("Mixes well with", "Mixes with selected")
- [x] Duplicate detection by content hash, best copy marked
- [x] Tags, notes and ratings (searchable, filterable, exported, stored separately from analysis)

## Phase 6 - Backlog & Future Work
- [ ] Move BPM/chord workers off Python 3.8 and key worker off 3.9 (EOL); needs madmom/BeatNet compatibility testing
- [ ] Pin worker Python dependencies (lock files) for reproducible builds
- [ ] Run containers as a non-root user (needs a migration note for existing `./data` ownership)
- [ ] Publish `linux/arm64` images (native ARM runners; QEMU is too slow for the ML workers)
- [ ] Push job progress over SSE/WebSockets instead of polling; Prometheus metrics; library retention policy
- [ ] Traktor NML export (needs verification against a real Traktor install)
- [ ] Beat grid export + Beat This! evaluation (needs downbeat offsets from a new beat worker)
- [ ] Stem separation (Demucs / BS-RoFormer) worker (large model image; needs GPU/CPU sizing)
- [ ] Audio-to-MIDI export (Spotify Basic Pitch)
- [ ] Genre/mood/danceability tags and similar-track search (Essentia Discogs-EffNet embeddings)
- [ ] Saved filters / smart playlists
