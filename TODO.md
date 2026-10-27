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
- [x] Track-first layout: sticky player, tabs (Overview / Harmony / Structure / Quality / Pitch & tempo), compact header with selected-track summary
- [x] Library: search, key and BPM-range filters, sortable columns, "Mixes with selected", "Needs attention"
- [x] Manual BPM/key correction with half/double-time buttons (kept across re-analysis)
- [x] Save & tag card with live filename preview and click-to-insert tokens; mobile order fixed
- [x] Keyboard shortcuts (`?` for help), tablist/dialog ARIA, focus rings, skip link
- [ ] Per-engine progress chips (needs a streaming/job-status API from the gateway)
- [ ] Light theme and a full Settings page (default pattern, formats)
- [x] Contrast pass: text-slate-500 (3.75-4.24:1) raised to slate-400 (7:1+), helper text >= 11 px; axe-core reports 0 WCAG A/AA violations on Overview/Harmony/Structure/Quality

## Phase 3 - Features
- [x] Batch drops (existing) + watch folder (`WATCH_FOLDER=true`, `./data/watch`)
- [x] Library export: CSV, JSON, Rekordbox XML (BPM + key; no beat grid)
- [x] Harmonic-mixing helper ("Mixes well with", "Mixes with selected")
- [x] Duplicate detection by content hash, best copy marked
- [ ] Traktor NML export (needs verification against a real Traktor install)
- [ ] Beat grid export + Beat This! evaluation (needs downbeat offsets from a new beat worker)
- [ ] Stem separation (Demucs) worker (large model image; needs GPU/CPU sizing)
- [x] Tags, notes and ratings (searchable, filterable, exported)
- [ ] Saved filters / smart playlists
