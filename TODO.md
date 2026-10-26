# Roadmap

Status of the improvement plan from the project audit. Checked items are done.

## Phase 1 - Security, correctness, ops
- [x] API-key auth on every gateway route (+ `/files/*`), frontend key prompt
- [x] SSRF guard on URL intake (public http/https hosts only, `ALLOW_PRIVATE_URLS` opt-out)
- [x] Upload size limit, atomic writes, no silent overwrite of different files with the same name
- [x] Failed engines return `null` + `engine_errors` instead of invented BPM/key; no ID3 writes from failed engines
- [x] CI publishes all 9 images, runs Vitest, shared test requirements
- [x] Dependabot covers every worker, `LICENSE`, `.env.example`, compose healthchecks, README refresh
- [ ] Move BPM/chord workers off Python 3.8 (blocked by BeatNet/madmom wheels - needs a build test)
- [ ] Pin worker dependencies / lockfiles
- [ ] Verify madmom / BeatNet model licenses for commercial use

## Phase 2 - UI/UX
- [ ] Track-first layout: sticky player, tabbed analysis (Overview / Harmony / Structure / Quality / Transform)
- [ ] Library as a sortable, filterable table (key, BPM, quality, text search)
- [ ] Per-engine progress + retry, manual BPM/key override, half/double-time toggle
- [ ] Keyboard shortcuts, accessibility pass (focus, ARIA, contrast), mobile layout
- [ ] Light/dark theme, Settings page (API key, default rename pattern, formats)

## Phase 3 - Features
- [ ] Batch/folder mode + watch folder
- [ ] DJ export: Rekordbox XML, Traktor NML, CSV/JSON
- [ ] Harmonic-mixing helper (compatible keys / BPM range)
- [ ] Beat grid export + Beat This! evaluation
- [ ] Stem separation (Demucs) worker
- [ ] Duplicate / similarity search, tags & smart playlists
