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
- [ ] Contrast audit of the 10-11 px helper text

## Phase 3 - Features
- [ ] Batch/folder mode + watch folder
- [ ] DJ export: Rekordbox XML, Traktor NML, CSV/JSON
- [ ] Harmonic-mixing helper (compatible keys / BPM range)
- [ ] Beat grid export + Beat This! evaluation
- [ ] Stem separation (Demucs) worker
- [ ] Duplicate / similarity search, tags & smart playlists
