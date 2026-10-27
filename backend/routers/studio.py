import os
import shutil
import uuid
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
import httpx
from celery.result import AsyncResult

from config import (
    SHARED_DATA_DIR,
    INPUT_DIR,
    OUTPUT_DIR,
    DOWNLOADER_URL,
    STRETCH_WORKER_URL,
    STUDIO_MAX_FILE_SIZE_MB,
    logger,
)
from utils import (
    sanitize_filename,
    resolve_audio_file_path,
    save_upload_stream,
    file_sha256,
    unique_filename,
    UploadTooLargeError,
)
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
    StretchRequest,
    StretchResponse,
)
from processor import BatchProcessor, WorkerError
from metadata import generate_new_filename
from library import LibraryManager
from celery_tasks import celery_app, analyze_audio_task

router = APIRouter(tags=["Studio Library & Processing"])

# Module-level instances with dependency injection support
_processor: Optional[BatchProcessor] = None
_library: Optional[LibraryManager] = None


def get_processor() -> BatchProcessor:
    global _processor
    if _processor is None:
        _processor = BatchProcessor(INPUT_DIR)
    return _processor


def set_processor(proc: BatchProcessor) -> None:
    global _processor
    _processor = proc


def get_library() -> LibraryManager:
    global _library
    if _library is None:
        _library = LibraryManager(SHARED_DATA_DIR)
    return _library


def set_library(lib: LibraryManager) -> None:
    global _library
    _library = lib


@router.post("/api/intake/url", response_model=UrlIntakeResponse)
async def intake_audio_url(
    request: UrlIntakeRequest,
    library: LibraryManager = Depends(get_library),
):
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
                    "audio_quality": "0",
                },
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
            detail=f"Downloader microservice unreachable at {DOWNLOADER_URL}: {str(e)}",
        )

    filename = sanitize_filename(dl_data["filename"])

    # Create or update library entry in SQLite
    entry = library.get_entry_by_filename(filename)
    if not entry:
        entry = library.add_entry(filename)
    else:
        library.set_input(entry.id, filename)
        entry.input_path = filename
        entry.status = "uploaded"

    job_id = None
    if request.auto_analyze:
        library.set_status(entry.id, "processing")
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
        filename=filename,
    )


@router.post("/api/stretch", response_model=StretchResponse)
async def stretch_audio(
    request: StretchRequest,
    library: LibraryManager = Depends(get_library),
):
    """
    Applies pitch shifting (semitones/cents) and tempo time stretching (speed multiplier/target BPM)
    to an audio file using the Rubber Band Library v4.0 microservice.
    """
    # Source files are only ever resolved server-side from the library's input/output folders
    filename = sanitize_filename(request.filename)
    file_path = resolve_audio_file_path(filename)

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"Source audio file not found on disk: {filename}",
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
                "output_filename": sanitize_filename(request.output_filename)
                if request.output_filename
                else None,
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
            detail=f"Rubber Band stretch microservice unreachable at {STRETCH_WORKER_URL}: {str(e)}",
        )

    out_name = sanitize_filename(data["output_filename"])
    entry = None
    if request.add_to_library:
        entry = library.get_entry_by_filename(out_name)
        if not entry:
            entry = library.add_entry(out_name, input_path=None, output_path=out_name)
        else:
            library.set_output(entry.id, out_name)
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
        engine="Rubber Band Library v4.0",
    )


@router.post("/api/upload", response_model=LibraryEntry)
async def upload_audio(
    file: UploadFile = File(...),
    library: LibraryManager = Depends(get_library),
):
    raw_name = file.filename or "upload.wav"
    safe_filename = sanitize_filename(raw_name, fallback="upload.wav")
    temp_path = os.path.join(INPUT_DIR, f".upload_{uuid.uuid4().hex}")
    try:
        digest = save_upload_stream(file.file, temp_path, STUDIO_MAX_FILE_SIZE_MB)
    except UploadTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        logger.error("Upload error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    try:
        existing_path = os.path.join(INPUT_DIR, safe_filename)
        if os.path.exists(existing_path):
            if file_sha256(existing_path) == digest:
                # Same file re-uploaded: keep the existing copy and its library entry
                os.remove(temp_path)
            else:
                # Different content with the same name: never overwrite, store alongside
                safe_filename = unique_filename(INPUT_DIR, safe_filename)
                os.replace(temp_path, os.path.join(INPUT_DIR, safe_filename))
        else:
            os.replace(temp_path, existing_path)

        file_size = os.path.getsize(os.path.join(INPUT_DIR, safe_filename))
        logger.info("Saved upload %s (%d bytes)", safe_filename, file_size)

        entry = library.get_entry_by_filename(safe_filename)
        if not entry:
            entry = library.add_entry(safe_filename)
        else:
            library.set_input(entry.id, safe_filename)
            entry.input_path = safe_filename
            entry.status = "uploaded"

        return entry
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.error("Upload error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/analyze", response_model=AnalysisResult)
@router.post("/api/reanalyze", response_model=AnalysisResult)
async def analyze_audio(
    request: AnalyzeRequest,
    processor: BatchProcessor = Depends(get_processor),
    library: LibraryManager = Depends(get_library),
):
    filename = request.filename
    if not filename and request.file_path:
        filename = os.path.basename(request.file_path)
    if not filename:
        raise HTTPException(
            status_code=400, detail="Either filename or file_path must be provided"
        )

    filename = sanitize_filename(filename)

    resolved_path = resolve_audio_file_path(filename)
    if not resolved_path:
        raise HTTPException(
            status_code=404,
            detail=f"Audio file '{filename}' not found in library storage",
        )

    entry = library.get_entry_by_filename(filename)
    if not entry:
        if resolved_path.startswith(OUTPUT_DIR):
            entry = library.add_entry(filename, input_path=None, output_path=filename)
        else:
            entry = library.add_entry(filename, input_path=filename, output_path=None)

    library.set_status(entry.id, "processing")
    try:
        result = await processor.process_file(filename)
        library.update_analysis(entry.id, AnalysisResult(**result))
        return result
    except FileNotFoundError:
        library.set_status(entry.id, "error")
        raise HTTPException(
            status_code=404,
            detail=f"Audio file '{filename}' not found in library storage",
        )
    except WorkerError as e:
        library.set_status(entry.id, "error")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        library.set_status(entry.id, "error")
        logger.error("Analyze error for %s: %s", filename, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/analyze/batch", response_model=BatchAnalyzeResponse)
async def analyze_batch(
    request: BatchAnalyzeRequest,
    library: LibraryManager = Depends(get_library),
):
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
        library.set_status(entry.id, "processing")

        task = analyze_audio_task.delay(filename)
        job_ids.append(task.id)

    return BatchAnalyzeResponse(job_ids=job_ids)


@router.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Polls the status of a Celery background job and retrieves the merged analysis JSON once complete.
    """
    res = AsyncResult(job_id, app=celery_app)
    state = res.state

    if state == "SUCCESS":
        raw_result = res.result
        analysis = (
            AnalysisResult(**raw_result)
            if isinstance(raw_result, dict)
            else raw_result
        )
        return JobStatusResponse(job_id=job_id, status="SUCCESS", result=analysis)
    elif state == "FAILURE":
        return JobStatusResponse(job_id=job_id, status="FAILURE", error=str(res.result))
    elif state in ("STARTED", "PROCESSING"):
        return JobStatusResponse(job_id=job_id, status="PROCESSING")
    else:
        return JobStatusResponse(job_id=job_id, status="PENDING")


@router.post("/api/queue")
async def add_to_queue(
    request: QueueRequest,
    processor: BatchProcessor = Depends(get_processor),
):
    safe_names = [sanitize_filename(name) for name in request.filenames]
    await processor.add_to_queue(safe_names)
    return {"message": f"Added {len(safe_names)} files to queue"}


@router.get("/api/status", response_model=QueueStatus)
async def get_status(
    processor: BatchProcessor = Depends(get_processor),
    library: LibraryManager = Depends(get_library),
):
    status = processor.get_status()
    for filename, result in status["results"].items():
        entry = library.get_entry_by_filename(filename)
        if entry and entry.status != "completed":
            library.update_analysis(entry.id, result)

    return status


@router.post("/api/process")
async def process_output(
    request: RenameRequest,
    library: LibraryManager = Depends(get_library),
):
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
        request.camelot,
    )
    new_name = sanitize_filename(new_name)
    dest_path = os.path.join(OUTPUT_DIR, new_name)

    shutil.copy2(source_path, dest_path)
    library.set_output(entry.id, new_name)
    entry = library.get_entry(entry.id)

    return {
        "message": "File processed and renamed successfully",
        "output_filename": new_name,
        "library_entry": entry,
    }


@router.get("/api/library", response_model=List[LibraryEntry])
def get_library_entries(library: LibraryManager = Depends(get_library)):
    return library.get_all()


@router.get("/api/download/input/{filename}")
def download_input(filename: str):
    safe_filename = sanitize_filename(filename)
    file_path = os.path.join(INPUT_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=safe_filename)


@router.get("/api/download/output/{filename}")
def download_output(filename: str):
    safe_filename = sanitize_filename(filename)
    file_path = os.path.join(OUTPUT_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=safe_filename)


@router.delete("/api/library/{id}/input")
def delete_input_file(
    id: str,
    library: LibraryManager = Depends(get_library),
):
    entry = library.get_entry(id)
    if not entry or not entry.input_path:
        raise HTTPException(status_code=404, detail="Entry or input file not found")

    file_path = os.path.join(INPUT_DIR, entry.input_path)
    if os.path.exists(file_path):
        os.remove(file_path)

    library.delete_input(id)
    return {"message": "Input file deleted successfully"}


@router.delete("/api/library/{id}/output")
def delete_output_file(
    id: str,
    library: LibraryManager = Depends(get_library),
):
    entry = library.get_entry(id)
    if not entry or not entry.output_path:
        raise HTTPException(status_code=404, detail="Entry or output file not found")

    file_path = os.path.join(OUTPUT_DIR, entry.output_path)
    if os.path.exists(file_path):
        os.remove(file_path)

    library.delete_output(id)
    return {"message": "Output file deleted successfully"}


@router.delete("/api/library/{id}")
def delete_entry(
    id: str,
    library: LibraryManager = Depends(get_library),
):
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


@router.delete("/api/library")
def clear_library(library: LibraryManager = Depends(get_library)):
    for f in os.listdir(INPUT_DIR):
        p = os.path.join(INPUT_DIR, f)
        if os.path.isfile(p) and not f.startswith("."):
            os.remove(p)

    for f in os.listdir(OUTPUT_DIR):
        p = os.path.join(OUTPUT_DIR, f)
        if os.path.isfile(p) and not f.startswith("."):
            os.remove(p)

    library.clear_all()

    return {"message": "Library cleared completely"}
