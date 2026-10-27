from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import (
    SHARED_DATA_DIR,
    DATA_DIR,
    INPUT_DIR,
    OUTPUT_DIR,
    ALLOWED_ORIGINS,
    ensure_directories,
    logger,
)
from processor import BatchProcessor, WorkerError
from auth import PUBLIC_PATHS, extract_api_key, check_api_key
from library import LibraryManager
from api_v1 import router as api_v1_router, set_processor as set_v1_processor
from routers.studio import (
    router as studio_router,
    set_processor as set_studio_processor,
    set_library as set_studio_library,
)
from routers.system import router as system_router

# Instantiate and wire shared core engines
processor = BatchProcessor(INPUT_DIR)
library = LibraryManager(SHARED_DATA_DIR)

set_v1_processor(processor)
set_studio_processor(processor)
set_studio_library(library)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages application lifecycle, directory initialization, and connection pooling."""
    ensure_directories()
    logger.info("Audio Analysis Studio Gateway started")
    yield
    await processor.close()
    logger.info("Audio Analysis Studio Gateway shutdown complete")


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
    lifespan=lifespan,
)

@app.middleware("http")
async def require_api_key(request: Request, call_next):
    """
    Enforces API_KEY / API_KEYS on every route (studio, library, files, health, /api/v1),
    not just the public API. Open mode when no key is configured.
    Registered before CORS so CORS stays the outermost layer and 401s carry CORS headers.
    """
    if request.method != "OPTIONS" and request.url.path not in PUBLIC_PATHS:
        error = check_api_key(
            extract_api_key(request.headers.get("x-api-key"), request.headers.get("authorization"))
        )
        if error:
            return JSONResponse(status_code=401, content={"detail": error})
    return await call_next(request)


# Setup CORS with configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True if ALLOWED_ORIGINS != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(WorkerError)
async def worker_error_handler(request: Request, exc: WorkerError):
    """An analysis engine failed: report it instead of returning guessed values."""
    return JSONResponse(status_code=502, content={"detail": str(exc), "engine": exc.engine})


# Mount static files for audio preview streaming and spectrogram viewing
app.mount("/files/input", StaticFiles(directory=INPUT_DIR), name="input_files")
app.mount("/files/output", StaticFiles(directory=OUTPUT_DIR), name="output_files")

# Mount Sub-Routers
app.include_router(api_v1_router)
app.include_router(studio_router)
app.include_router(system_router)


@app.get("/")
def read_root():
    return {"message": "Audio Analysis Studio Gateway Live", "docs_url": "/docs"}
