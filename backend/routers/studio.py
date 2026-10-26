import hashlib
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
    MAX_FILE_SIZE_MB,
    STRETCH_WORKER_URL,
    logger,
)
from utils import sanitize_filename, resolve_audio_file_path, unique_upload_name
from models import (
    AnalysisOverrideRequest,
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
from processor import BatchProcessor
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
        entry.input_path = filename
        entry.status = "uploaded"
        with library._get_connection() as conn:
            conn.execute(
                "UPDATE library SET input_path = ?, status = 'uploaded' WHERE id = ?;",
                (filename, entry.id),
            )
            conn.commit()

    job_id = None
    if request.auto_analyze:
        with library._get_connection() as conn:
            conn.execute(
                "UPDATE library SET status = 'processing' WHERE id = ?;", (entry.id,)
            )
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
    file_path = request.file_path
    raw_filename = request.filename
    filename = sanitize_filename(raw_filename) if raw_filename else None

    if not file_path and filename:
        file_path = resolve_audio_file_path(filename)

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"Source audio file not found on disk: {filename or file_path}",
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
    """Stores an upload in the input dir, enforcing MAX_FILE_SIZE_MB and never overwriting a different file."""
    tmp_path = os.path.join(INPUT_DIR, f".upload_{uuid.uuid4().hex}.part")
    try:
        raw_name = file.filename or "upload.wav"
        safe_filename = sanitize_filename(raw_name, fallback="upload.wav")
        max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024

        digest = hashlib.sha256()
        size = 0
        with open(tmp_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {MAX_FILE_SIZE_MB} MB upload limit (set MAX_FILE_SIZE_MB to raise it).",
                    )
                digest.update(chunk)
                buffer.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        final_name = unique_upload_name(INPUT_DIR, safe_filename, digest.hexdigest())
        file_path = os.path.join(INPUT_DIR, final_name)
        if os.path.exists(file_path):
            os.remove(tmp_path)  # identical content already stored
        else:
            os.replace(tmp_path, file_path)
        logger.info("Saved upload %s (%d bytes)", final_name, size)

        entry = library.get_entry_by_filename(final_name)
        if not entry:
            entry = library.add_entry(final_name)
        else:
            entry.input_path = final_name
            entry.status = "uploaded"
            with library._get_connection() as conn:
                conn.execute(
                    "UPDATE library SET input_path = ?, status = 'uploaded' WHERE id = ?;",
                    (final_name, entry.id),
                )
                conn.commit()

        return entry
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Upload error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


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

    try:
        entry = library.get_entry_by_filename(filename)
        if not entry:
            resolved_p = resolve_audio_file_path(filename)
            if resolved_p and resolved_p.startswith(OUTPUT_DIR):
                entry = library.add_entry(filename, input_path=None, output_path=filename)
            else:
                entry = library.add_entry(filename, input_path=filename, output_path=None)

        result = await processor.process_file(filename)

        if entry:
            library.update_analysis(entry.id, AnalysisResult(**result))

        return result
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Audio file '{filename}' not found in library storage",
        )
    except Exception as e:
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
        if entry:
            with library._get_connection() as conn:
                conn.execute(
                    "UPDATE library SET status = 'processing' WHERE id = ?;",
                    (entry.id,),
                )
                conn.commit()

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


@router.patch("/api/library/{id}/analysis", response_model=LibraryEntry)
def override_analysis(
    id: str,
    request: AnalysisOverrideRequest,
    library: LibraryManager = Depends(get_library),
):
    """Manually corrects BPM and/or key (e.g. half-time fix). Marked as overridden and kept across re-analysis."""
    entry = library.get_entry(id)
    if not entry:
        raise HTTPException(status_code=404, detail="Library entry not found")
    if request.bpm is None and request.key_camelot is None:
        raise HTTPException(status_code=400, detail="Provide bpm and/or key_camelot")

    analysis = entry.analysis or AnalysisResult(filename=entry.filename)
    overrides = set(analysis.manual_overrides)
    if request.bpm is not None:
        analysis.bpm = round(request.bpm, 1)
        analysis.bpm_confidence = 1.0
        overrides.add("bpm")
    if request.key_camelot is not None:
        analysis.key_camelot = request.key_camelot
        analysis.key_standard = request.key_standard or analysis.key_standard
        analysis.key_confidence = 1.0
        overrides.add("key")
    for group in overrides:
        analysis.engine_errors.pop(group, None)
    analysis.manual_overrides = sorted(overrides)

    library.update_analysis(entry.id, analysis, preserve_overrides=False)
    return library.get_entry(entry.id)


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

    with library._get_connection() as conn:
        conn.execute("DELETE FROM library;")
        conn.commit()

    return {"message": "Library cleared completely"}
