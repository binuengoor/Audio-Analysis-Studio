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
- [ ] T024 [Bug] Investigate and fix static analysis results (ensure correct file paths and Essentia execution)
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


