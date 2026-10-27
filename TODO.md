# Tasks: Audio Analyzer App

## Phase 1: Infrastructure & Setup

- [x] T001 Create `docker-compose.yml` mounting `./music_in` to backend
- [x] T002 Create `backend/Dockerfile` using `ghcr.io/mtg/essentia:bullseye` base
- [x] T003 Create `frontend/Dockerfile` using `node:18-alpine`
- [x] T004 Initialize React+Vite project in `frontend/`
- [x] T005 Initialize FastAPI project in `backend/`

## Phase 2: Backend Core (Analysis)

- [x] T006 [US1] Implement `AudioAnalyzer` service wrapping `essentia.standard.RhythmExtractor2013`
- [x] T007 [US1] Implement `KeyExtractor` wrapper in `AudioAnalyzer`
- [x] T008 [US1] Add helper function for Standard to Camelot key conversion
- [x] T009 [US1] Implement silence removal logic (-60dB threshold)

## Phase 3: Backend API & Queue

- [x] T010 [US2] Create Pydantic models for API responses
- [x] T011 [US2] Implement `BatchProcessor` class with `asyncio.Lock` for serial processing
- [x] T012 [US1] Implement `POST /api/upload` endpoint
- [x] T013 [US1] Implement `POST /api/analyze` endpoint
- [x] T014 [US2] Implement `POST /api/queue` and polling endpoint

## Phase 4: Frontend Implementation

- [x] T015 [US1] Create `useAudioStore` (Zustand) for file queue management
- [x] T016 [US1] Create `Tabs` component (Individual vs Bulk views)
- [x] T017 [US1] Implement `UploadZone` with drag-and-drop support
- [x] T018 [US3] Create `WaveformPlayer` component using `wavesurfer.js`
- [x] T019 [US3] Add visual markers for silence detection on waveform
- [x] T020 [US4] Implement File Renaming API and UI

## Phase 5: Library Manager & Refactor (Current)

- [x] T021 [Refactor] Remove Bulk Processing feature (simplify to single file workflow)
- [x] T022 [Refactor] Implement "Auto-clear Input" (Input folder holds max 1 file, clears on new upload/refresh)
- [x] T023 [Infra] Fix Docker Volumes to persist Output files to host (map `./data` or separate input/output folders)
- [x] T024 [Bug] ~~Essentia static analysis results~~ (obsolete: Essentia replaced by the microservice engines; placeholder fallback values removed, failures now reported via `engine_errors`)
- [x] T025 [Feature] Implement "Save to Library" option (move/copy processed file to Output folder)
- [x] T026 [UI] Update Library view to reflect new single-file workflow
- [x] T027 [UI] Add "Clear All" button to Library
- [x] T028 [UI] Add waveform preview for selected Library entry
- [x] T029 [UX] Document rename pattern tokens near Save action

## Phase 6: Release & Ops

- [x] T030 [UI] Apply global dark theme polish
- [x] T031 [Docs] Write comprehensive README & repo hygiene notes
- [x] T032 [CI/CD] Ship backend & frontend Docker images to GHCR via GitHub Actions
- [x] T033 [PWA] Progressive Web App configuration, manifest, icons & Workbox caching

## Phase 7: Hardening (Done)

- [x] T034 [Bug] Celery tasks reused an HTTP client across event loops, so every other task's worker calls failed
- [x] T035 [Bug] Never substitute placeholder BPM/key values; report failed engines and only tag detected values
- [x] T036 [Bug] Mark failed jobs as `error`; frontend job polling with timeout and failure toasts
- [x] T037 [Security] API key enforced on all gateway routes; nginx injects it for the UI; gateway bound to localhost
- [x] T038 [Security] Stretch source paths resolved server-side only; streamed uploads with size limits; no same-name overwrites
- [x] T039 [CI/CD] Publish all 9 images; frontend tests, lint and image builds in CI; compose healthchecks
- [x] T040 [UX] Accessibility pass (labels, focus rings, live-region toasts) and player keyboard shortcuts

## Phase 8: Backlog

### Infrastructure
- [ ] T041 [Infra] Move BPM/chord workers off Python 3.8 and the key worker off 3.9 (EOL); needs madmom/BeatNet compatibility testing
- [ ] T042 [Infra] Pin worker Python dependencies (lock files) for reproducible builds
- [ ] T043 [Infra] Run containers as a non-root user (needs a migration note for existing `./data` ownership)
- [ ] T044 [CI/CD] Publish `linux/arm64` images (native ARM runners; QEMU is too slow for the ML workers)
- [ ] T045 [Ops] Push job progress over SSE/WebSockets instead of polling; Prometheus metrics; library retention policy

### Analysis quality
- [ ] T046 [Feature] Keep BeatNet beat/downbeat times: beat grid, half/double-tempo correction
- [ ] T047 [Feature] Evaluate `allin1` for joint beats/downbeats/functional section labels (intro/verse/chorus/bridge)

### New features
- [ ] T048 [Feature] Stem separation worker (BS-RoFormer / Mel-RoFormer, HTDemucs fallback)
- [ ] T049 [Feature] Audio-to-MIDI export (Spotify Basic Pitch)
- [ ] T050 [Feature] Genre/mood/danceability tags and similar-track search (Essentia Discogs-EffNet embeddings)
- [ ] T051 [Feature] DJ workflow: Camelot wheel compatibility, energy level, Rekordbox/Traktor/Serato export with cues and beat grid
- [ ] T052 [Feature] Library search/filter/sort, playlists, duplicate detection, watch-folder import, CSV/JSON export
- [ ] T053 [Feature] Mastering views: loudness over time, stereo width, clipping/true-peak map, streaming loudness targets
