import os
import shutil
import asyncio
import time
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx
from celery.result import AsyncResult

from config import (
    SHARED_DATA_DIR,
    DATA_DIR,
    INPUT_DIR,
    OUTPUT_DIR,
    BPM_WORKER_URL,
    KEY_WORKER_URL,
    CHORD_WORKER_URL,
    QUALITY_WORKER_URL,
    STRUCTURE_WORKER_URL,
    DOWNLOADER_URL,
    STRETCH_WORKER_URL,
    REDIS_URL,
    ALLOWED_ORIGINS,
    logger,
)
from utils import sanitize_filename
from models import (
    AnalysisResult,
    AnalyzeRequest,
    BatchAnalyzeRequest,
    BatchAnalyzeResponse,
    JobStatusResponse,
    QueueRequest,
    QueueStatus,
    RenameRequest,
    LibraryEntry,
    UrlIntakeRequest,
    UrlIntakeResponse,
    DownloaderVersionResponse,
    DownloaderUpdateResponse,
    StretchRequest,
    StretchResponse,
)
from processor import BatchProcessor
from metadata import generate_new_filename
from library import LibraryManager
from celery_tasks import celery_app, analyze_audio_task
from api_v1 import router as api_v1_router, set_processor

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
    openapi_url="/openapi.json"
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

processor = BatchProcessor(INPUT_DIR)
set_processor(processor)
library = LibraryManager(SHARED_DATA_DIR)

# Mount Public API Router (v1)
app.include_router(api_v1_router)

@app.get("/")
def read_root():
    return {"message": "Audio Analysis Studio Gateway Live", "docs_url": "/docs"}

async def _ping_worker(client: httpx.AsyncClient, name: str, base_url: str, port: int, engine: str) -> Dict[str, Any]:
    start = time.perf_counter()
    try:
        resp = await client.get(f"{base_url}/health", timeout=2.0)
        latency = round((time.perf_counter() - start) * 1000, 1)
        if resp.status_code == 200:
            return {
                "name": name,
                "status": "ok",
                "port": port,
                "latency_ms": latency,
                "engine": engine,
            }
        return {
            "name": name,
            "status": "error",
            "port": port,
            "latency_ms": latency,
            "engine": engine,
            "error": f"HTTP {resp.status_code}",
        }
    except Exception as e:
        latency = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name": name,
            "status": "error",
            "port": port,
            "latency_ms": latency,
            "engine": engine,
            "error": str(e),
        }

async def _ping_redis() -> Dict[str, Any]:
    start = time.perf_counter()
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(REDIS_URL, socket_timeout=2.0)
        pong = await r.ping()
        await r.aclose()
        latency = round((time.perf_counter() - start) * 1000, 1)
        if pong:
            return {
                "name": "Redis Task Broker",
                "status": "ok",
                "port": 6379,
                "latency_ms": latency,
                "engine": "Redis Queue & PubSub",
            }
        return {
            "name": "Redis Task Broker",
            "status": "error",
            "port": 6379,
            "latency_ms": latency,
            "engine": "Redis Queue & PubSub",
            "error": "No response",
        }
    except Exception as e:
        latency = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name": "Redis Task Broker",
            "status": "error",
            "port": 6379,
            "latency_ms": latency,
            "engine": "Redis Queue & PubSub",
            "error": str(e),
        }

@app.get("/api/health/services", tags=["Engine Management"])
async def get_all_services_health():
    """
    Polls the health and response latency of all 8 microservices and workers in the stack.
    """
    workers = [
        ("BeatNet BPM Worker", BPM_WORKER_URL, 8001, "BeatNet (DBN Beat & Downbeat)"),
        ("MusicalKeyCNN Key Worker", KEY_WORKER_URL, 8002, "MusicalKeyCNN (Deep Key & Camelot)"),
        ("Madmom Chord Worker", CHORD_WORKER_URL, 8003, "Madmom (CNN + CRF Chord Progression)"),
        ("WhatsMyBitrate Quality Worker", QUALITY_WORKER_URL, 8004, "WhatsMyBitrate & PyLoudNorm (LUFS & Cutoff)"),
        ("Laplacian Structure Worker", STRUCTURE_WORKER_URL, 8005, "Librosa Laplacian Agglomerative Segmentation"),
        ("yt-dlp Downloader Worker", DOWNLOADER_URL, 8006, "yt-dlp & FFmpeg Audio Stream Extractor"),
        ("Rubber Band Stretch Worker", STRETCH_WORKER_URL, 8007, "Rubber Band Library v4.0 (Pitch & Stretch)"),
    ]

    async with httpx.AsyncClient() as client:
        worker_tasks = [_ping_worker(client, name, url, port, engine) for name, url, port, engine in workers]
        results = await asyncio.gather(*worker_tasks, _ping_redis())

    healthy_count = sum(1 for r in results if r.get("status") == "ok")
    total_count = len(results)

    if healthy_count == total_count:
        overall_status = "healthy"
    elif healthy_count > 0:
        overall_status = "degraded"
    else:
        overall_status = "unhealthy"

    return {
        "status": overall_status,
        "healthy_count": healthy_count,
        "total_count": total_count,
        "services": results,
        "timestamp": time.time(),
    }

@app.post("/api/intake/url", response_model=UrlIntakeResponse, tags=["Studio Library & Processing"])
async def intake_audio_url(request: UrlIntakeRequest):
    """
    Intakes an audio track via URL (YouTube, SoundCloud, etc.) using yt-dlp + FFmpeg.
    Saves the extracted high-quality audio directly to the shared library input directory
    and automatically enqueues Celery analysis if requested.
    """
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{DOWNLOADER_URL}/download",
                json={
                    "url": url,
                    "audio_format": request.audio_format or "flac",
                    "audio_quality": "0"
                }
            )
            if resp.status_code != 200:
                try:
                    error_detail = resp.json().get("detail", resp.text)
                except Exception:
                    error_detail = resp.text
                raise HTTPException(status_code=resp.status_code, detail=error_detail)

            dl_data = resp.json()
    except httpx.RequestError as e:
        logger.error("Downloader microservice unreachable during URL intake: %s", e)
        raise HTTPException(
            status_code=503,
            detail=f"Downloader microservice unreachable at {DOWNLOADER_URL}: {str(e)}"
        )

    filename = sanitize_filename(dl_data["filename"])

    # Create or update library entry in SQLite
    entry = library.get_entry_by_filename(filename)
    if not entry:
        entry = library.add_entry(filename)
    else:
        entry.input_path = filename
        entry.status = "uploaded"
        # Persist updated status
        with library._get_connection() as conn:
            conn.execute("UPDATE library SET input_path = ?, status = 'uploaded' WHERE id = ?;", (filename, entry.id))
            conn.commit()

    job_id = None
    if request.auto_analyze:
        with library._get_connection() as conn:
            conn.execute("UPDATE library SET status = 'processing' WHERE id = ?;", (entry.id,))
            conn.commit()
        entry.status = "processing"
        task = analyze_audio_task.delay(filename)
        job_id = task.id

    return UrlIntakeResponse(
        success=True,
        entry=entry,
        job_id=job_id,
        title=dl_data.get("title", filename),
        duration=dl_data.get("duration", 0.0),
        thumbnail=dl_data.get("thumbnail"),
        uploader=dl_data.get("uploader"),
        filename=filename
    )

@app.get("/api/downloader/version", response_model=DownloaderVersionResponse, tags=["Engine Management"])
async def get_downloader_engine_version():
    """Returns the current yt-dlp version, FFmpeg version, and cookies status from the downloader worker."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{DOWNLOADER_URL}/version")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail="Downloader worker error")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Downloader microservice unreachable: {str(e)}")

@app.post("/api/downloader/update", response_model=DownloaderUpdateResponse, tags=["Engine Management"])
async def update_downloader_engine():
    """Triggers in-container upgrade of yt-dlp to hotfix any YouTube extractor changes."""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{DOWNLOADER_URL}/update-engine")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail="Downloader update failed")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Downloader microservice unreachable: {str(e)}")

@app.get("/api/stretch/version", tags=["Engine Management"])
async def get_stretch_engine_version():
    """Returns the Rubber Band Library engine status and version from the stretch worker."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{STRETCH_WORKER_URL}/version")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail="Stretch worker error")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Stretch worker unreachable: {str(e)}")

@app.post("/api/stretch", response_model=StretchResponse, tags=["Studio Library & Processing"])
async def stretch_audio(request: StretchRequest):
    """
    Applies pitch shifting (semitones/cents) and tempo time stretching (speed multiplier/target BPM)
    to an audio file using the Rubber Band Library v4.0 microservice.
    """
    file_path = request.file_path
    raw_filename = request.filename
    filename = sanitize_filename(raw_filename) if raw_filename else None

    if not file_path and filename:
        candidate = os.path.join(INPUT_DIR, filename)
        if os.path.exists(candidate):
            file_path = candidate
        else:
            candidate_out = os.path.join(OUTPUT_DIR, filename)
            if os.path.exists(candidate_out):
                file_path = candidate_out
            else:
                for root, _, files in os.walk(INPUT_DIR):
                    if filename in files:
                        file_path = os.path.join(root, filename)
                        break

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"Source audio file not found on disk: {filename or file_path}"
        )

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            payload = {
                "file_path": file_path,
                "pitch_semitones": request.pitch_semitones,
                "tempo_ratio": request.tempo_ratio,
                "target_bpm": request.target_bpm,
                "original_bpm": request.original_bpm,
                "preserve_formants": request.preserve_formants,
                "crispness": request.crispness,
                "output_format": request.output_format or "wav",
                "output_filename": sanitize_filename(request.output_filename) if request.output_filename else None,
            }
            resp = await client.post(f"{STRETCH_WORKER_URL}/process", json=payload)
            if resp.status_code != 200:
                try:
                    err_msg = resp.json().get("detail", resp.text)
                except Exception:
                    err_msg = resp.text
                raise HTTPException(status_code=resp.status_code, detail=err_msg)

            data = resp.json()
    except httpx.RequestError as e:
        logger.error("Stretch worker request error: %s", e)
        raise HTTPException(
            status_code=503,
            detail=f"Rubber Band stretch microservice unreachable at {STRETCH_WORKER_URL}: {str(e)}"
        )

    out_name = sanitize_filename(data["output_filename"])
    entry = None
    if request.add_to_library:
        entry = library.get_entry_by_filename(out_name)
        if not entry:
            entry = library.add_entry(out_name)
        if entry:
            library.set_output(entry.id, out_name)
            # Re-fetch with output set
            entry = library.get_entry(entry.id)

    return StretchResponse(
        success=True,
        output_filename=out_name,
        output_url=f"/files/output/{out_name}",
        duration=data.get("duration", 0.0),
        pitch_semitones=data.get("pitch_semitones", request.pitch_semitones),
        tempo_ratio=data.get("tempo_ratio", request.tempo_ratio),
        target_bpm=data.get("target_bpm", request.target_bpm),
        library_entry=entry,
        engine="Rubber Band Library v4.0"
    )

@app.post("/api/upload", response_model=LibraryEntry, tags=["Studio Library & Processing"])
async def upload_audio(file: UploadFile = File(...)):
    try:
        raw_name = file.filename or "upload.wav"
        safe_filename = sanitize_filename(raw_name, fallback="upload.wav")
        file_path = os.path.join(INPUT_DIR, safe_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(file_path)
        logger.info("Saved upload %s (%d bytes)", safe_filename, file_size)

        # Create or retrieve existing library entry in SQLite
        entry = library.get_entry_by_filename(safe_filename)
        if not entry:
            entry = library.add_entry(safe_filename)
        else:
            entry.input_path = safe_filename
            entry.status = "uploaded"
            with library._get_connection() as conn:
                conn.execute("UPDATE library SET input_path = ?, status = 'uploaded' WHERE id = ?;", (safe_filename, entry.id))
                conn.commit()
            
        return entry
    except Exception as e:
        logger.error("Upload error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze", response_model=AnalysisResult, tags=["Studio Library & Processing"])
@app.post("/api/reanalyze", response_model=AnalysisResult, tags=["Studio Library & Processing"])
async def analyze_audio(request: AnalyzeRequest):
    filename = request.filename
    if not filename and request.file_path:
        filename = os.path.basename(request.file_path)
    if not filename:
        raise HTTPException(status_code=400, detail="Either filename or file_path must be provided")

    filename = sanitize_filename(filename)

    try:
        entry = library.get_entry_by_filename(filename)
        if not entry:
            entry = library.add_entry(filename)

        result = await processor.process_file(filename)
        
        # Update SQLite database
        if entry:
            library.update_analysis(entry.id, AnalysisResult(**result))
            
        return result
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        logger.error("Analyze error for %s: %s", filename, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/batch", response_model=BatchAnalyzeResponse, tags=["Studio Library & Processing"])
async def analyze_batch(request: BatchAnalyzeRequest):
    """
    Enqueues asynchronous analysis tasks for multiple files to the Celery/Redis job queue.
    Returns a list of job_ids.
    """
    job_ids = []
    for raw_name in request.filenames:
        filename = sanitize_filename(raw_name)
        entry = library.get_entry_by_filename(filename)
        if not entry:
            entry = library.add_entry(filename)
        if entry:
            with library._get_connection() as conn:
                conn.execute("UPDATE library SET status = 'processing' WHERE id = ?;", (entry.id,))
                conn.commit()

        task = analyze_audio_task.delay(filename)
        job_ids.append(task.id)

    return BatchAnalyzeResponse(job_ids=job_ids)

@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse, tags=["Studio Library & Processing"])
async def get_job_status(job_id: str):
    """
    Polls the status of a Celery background job and retrieves the merged analysis JSON once complete.
    """
    res = AsyncResult(job_id, app=celery_app)
    state = res.state

    if state == "SUCCESS":
        raw_result = res.result
        analysis = AnalysisResult(**raw_result) if isinstance(raw_result, dict) else raw_result
        return JobStatusResponse(job_id=job_id, status="SUCCESS", result=analysis)
    elif state == "FAILURE":
        return JobStatusResponse(job_id=job_id, status="FAILURE", error=str(res.result))
    elif state in ("STARTED", "PROCESSING"):
        return JobStatusResponse(job_id=job_id, status="PROCESSING")
    else:
        return JobStatusResponse(job_id=job_id, status="PENDING")

@app.post("/api/queue", tags=["Studio Library & Processing"])
async def add_to_queue(request: QueueRequest):
    safe_names = [sanitize_filename(name) for name in request.filenames]
    await processor.add_to_queue(safe_names)
    return {"message": f"Added {len(safe_names)} files to queue"}

@app.get("/api/status", response_model=QueueStatus, tags=["Studio Library & Processing"])
async def get_status():
    status = processor.get_status()
    for filename, result in status["results"].items():
        entry = library.get_entry_by_filename(filename)
        if entry and entry.status != "completed":
            library.update_analysis(entry.id, result)
             
    return status

@app.post("/api/process", tags=["Studio Library & Processing"])
async def process_output(request: RenameRequest):
    raw_name = request.filename
    filename = sanitize_filename(raw_name)
    entry = library.get_entry_by_filename(filename)
    if not entry or not entry.input_path:
        raise HTTPException(status_code=404, detail="Input file not found in library")

    source_path = os.path.join(INPUT_DIR, entry.input_path)
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    new_name = generate_new_filename(
        entry.filename,
        request.pattern,
        request.bpm,
        request.key,
        request.camelot
    )
    new_name = sanitize_filename(new_name)
    dest_path = os.path.join(OUTPUT_DIR, new_name)

    shutil.copy2(source_path, dest_path)
    library.set_output(entry.id, new_name)
    entry = library.get_entry(entry.id)

    return {
        "message": "File processed and renamed successfully",
        "output_filename": new_name,
        "library_entry": entry
    }

@app.get("/api/library", response_model=List[LibraryEntry], tags=["Studio Library & Processing"])
def get_library():
    return library.get_all()

@app.get("/api/download/input/{filename}", tags=["Studio Library & Processing"])
def download_input(filename: str):
    safe_filename = sanitize_filename(filename)
    file_path = os.path.join(INPUT_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path, filename=safe_filename)

@app.get("/api/download/output/{filename}", tags=["Studio Library & Processing"])
def download_output(filename: str):
    safe_filename = sanitize_filename(filename)
    file_path = os.path.join(OUTPUT_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path, filename=safe_filename)

@app.delete("/api/library/{id}/input", tags=["Studio Library & Processing"])
def delete_input_file(id: str):
    entry = library.get_entry(id)
    if not entry or not entry.input_path:
        raise HTTPException(status_code=404, detail="Entry or input file not found")
    
    file_path = os.path.join(INPUT_DIR, entry.input_path)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    library.delete_input(id)
    return {"message": "Input file deleted successfully"}

@app.delete("/api/library/{id}/output", tags=["Studio Library & Processing"])
def delete_output_file(id: str):
    entry = library.get_entry(id)
    if not entry or not entry.output_path:
        raise HTTPException(status_code=404, detail="Entry or output file not found")
    
    file_path = os.path.join(OUTPUT_DIR, entry.output_path)
    if os.path.exists(file_path):
        os.remove(file_path)
        
    library.delete_output(id)
    return {"message": "Output file deleted successfully"}

@app.delete("/api/library/{id}", tags=["Studio Library & Processing"])
def delete_entry(id: str):
    entry = library.get_entry(id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    if entry.input_path:
        p = os.path.join(INPUT_DIR, entry.input_path)
        if os.path.exists(p):
            os.remove(p)
            
    if entry.output_path:
        p = os.path.join(OUTPUT_DIR, entry.output_path)
        if os.path.exists(p):
            os.remove(p)
            
    library.delete_entry(id)
    return {"message": "Entry and files deleted successfully"}

@app.delete("/api/library", tags=["Studio Library & Processing"])
def clear_library():
    for f in os.listdir(INPUT_DIR):
        p = os.path.join(INPUT_DIR, f)
        if os.path.isfile(p) and not f.startswith("."):
            os.remove(p)
            
    for f in os.listdir(OUTPUT_DIR):
        p = os.path.join(OUTPUT_DIR, f)
        if os.path.isfile(p) and not f.startswith("."):
            os.remove(p)
            
    with library._get_connection() as conn:
        conn.execute("DELETE FROM library;")
        conn.commit()

    return {"message": "Library cleared completely"}
