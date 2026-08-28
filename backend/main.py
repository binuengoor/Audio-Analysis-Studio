from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import (
    SHARED_DATA_DIR,
    DATA_DIR,
    INPUT_DIR,
    OUTPUT_DIR,
    ALLOWED_ORIGINS,
    logger,
)
from processor import BatchProcessor
from library import LibraryManager
from api_v1 import router as api_v1_router, set_processor as set_v1_processor
from routers.studio import (
    router as studio_router,
    set_processor as set_studio_processor,
    set_library as set_studio_library,
)
from routers.system import router as system_router

tags_metadata = [
    {
        "name": "Stream Downloader & Metadata (API v1)",
        "description": "Public developer endpoints for downloading and streaming audio binaries (FLAC, MP3, WAV) directly from URLs (YouTube, SoundCloud, direct links) and retrieving track metadata.",
    },
    {
        "name": "Audio Analysis (API v1)",
        "description": "Public developer endpoints for BPM tempo estimation, Musical Key / Camelot detection, Chord progressions, Song structure, and Audio quality inspection.",
    },
    {
        "name": "Studio Library & Processing",
        "description": "Internal studio gateway endpoints for library management, batch processing, audio uploading, and background Celery jobs.",
    },
    {
        "name": "Engine Management",
        "description": "Diagnostics and live module hot-update endpoints for worker services.",
    },
]

app = FastAPI(
    title="Audio Analysis Studio API Gateway",
    description="""
# Audio Intelligence Gateway & Multi-Engine Public Analysis API
High-performance REST API for audio analysis, metadata extraction, and multi-engine processing.

### Features
* **BPM & Beat Tracking**: BeatNet Dynamic Bayesian Network model
* **Musical Key & Camelot**: MusicalKeyCNN deep neural network
* **Harmonic Chords**: Madmom CNN + CRF sequence modeling
* **Song Structural Segments**: Laplacian agglomerative section segmentation
* **Audio Quality & Transcode Authenticity**: Frequency cutoff and fake-lossless detection
* **URL Audio Ingestion**: yt-dlp + static FFmpeg high-fidelity stream extraction

### Authentication
Include your API Key in the `X-API-Key` header on all `/api/v1/*` requests:
```http
X-API-Key: your_secret_api_key
```
""",
    version="1.0.0",
    openapi_tags=tags_metadata,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Setup CORS with configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True if ALLOWED_ORIGINS != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for audio preview streaming and spectrogram viewing
app.mount("/files/input", StaticFiles(directory=INPUT_DIR), name="input_files")
app.mount("/files/output", StaticFiles(directory=OUTPUT_DIR), name="output_files")

# Instantiate and wire shared core engines
processor = BatchProcessor(INPUT_DIR)
library = LibraryManager(SHARED_DATA_DIR)

set_v1_processor(processor)
set_studio_processor(processor)
set_studio_library(library)

# Mount Sub-Routers
app.include_router(api_v1_router)
app.include_router(studio_router)
app.include_router(system_router)


@app.get("/")
def read_root():
    return {"message": "Audio Analysis Studio Gateway Live", "docs_url": "/docs"}
