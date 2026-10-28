import os
import uuid
import urllib.parse
from typing import Optional
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, Request, BackgroundTasks
from fastapi.responses import FileResponse

from auth import verify_api_key
from processor import BatchProcessor
from utils import sanitize_filename, save_upload_stream, UploadTooLargeError
from config import (
    SHARED_DATA_DIR,
    INPUT_DIR,
    MAX_FILE_SIZE_MB,
    DOWNLOADER_URL,
    STRETCH_WORKER_URL,
    logger,
)
from models import (
    BasicAnalysisResponse,
    BPMAnalysisResponse,
    KeyAnalysisResponse,
    StructureAnalysisResponse,
    ChordAnalysisResponse,
    QualityAnalysisResponse,
    FullAnalysisResponse,
    UrlIntakeRequest,
    StretchResponse,
)

router = APIRouter(
    prefix="/api/v1",
    dependencies=[Depends(verify_api_key)]
)

_default_processor: Optional[BatchProcessor] = None

def get_processor() -> BatchProcessor:
    global _default_processor
    if _default_processor is None:
        _default_processor = BatchProcessor(INPUT_DIR)
    return _default_processor

def set_processor(proc: BatchProcessor):
    global _default_processor
    _default_processor = proc

async def _save_temp_upload(file: UploadFile) -> tuple[str, str]:
    """
    Saves uploaded file to a temporary location in INPUT_DIR so microservices can access it.
    Sanitizes filenames to eliminate directory traversal risks.
    Returns (temp_file_path, sanitized_original_filename).
    """
    os.makedirs(INPUT_DIR, exist_ok=True)
    raw_name = file.filename or "upload.wav"
    orig_name = sanitize_filename(raw_name, fallback="upload.wav")
    
    _, ext = os.path.splitext(orig_name)
    temp_filename = f"api_temp_{uuid.uuid4().hex[:8]}_{orig_name}"
    temp_path = os.path.join(INPUT_DIR, temp_filename)

    try:
        save_upload_stream(file.file, temp_path, MAX_FILE_SIZE_MB)
        return temp_path, orig_name
    except UploadTooLargeError as e:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(e))
    except Exception as e:
        logger.error("Failed to process temp upload %s: %s", raw_name, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process upload: {str(e)}")

def _cleanup_temp_file(temp_path: str):
    """Safely cleans up temporary uploaded audio files and any worker artifact."""
    if temp_path and os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass

    # Also clean up any matching spectrogram image created by quality worker
    base, _ = os.path.splitext(temp_path)
    spec_path = f"{base}_spectrogram.png"
    if os.path.exists(spec_path):
        try:
            os.remove(spec_path)
        except Exception:
            pass

@router.post(
    "/analyze/basic",
    tags=["Audio Analysis (API v1)"],
    response_model=BasicAnalysisResponse,
    summary="BPM & Key Analysis",
    description="Analyzes audio file for tempo (BPM), BPM confidence, Standard Key (e.g. C major), Camelot Key (e.g. 8B), Key confidence, and duration in seconds."
)
async def analyze_basic(
    file: UploadFile = File(..., description="Audio file (MP3, WAV, FLAC, M4A, OGG, AIFF)"),
    processor: BatchProcessor = Depends(get_processor)
):
    temp_path, orig_name = await _save_temp_upload(file)
    try:
        result = await processor.analyze_basic(temp_path, filename=orig_name)
        return BasicAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(temp_path)

@router.post(
    "/analyze/bpm",
    tags=["Audio Analysis (API v1)"],
    response_model=BPMAnalysisResponse,
    summary="BPM / Tempo Analysis",
    description="Detects tempo in Beats Per Minute (BPM) and confidence score."
)
async def analyze_bpm(
    file: UploadFile = File(..., description="Audio file (MP3, WAV, FLAC, M4A, OGG, AIFF)"),
    processor: BatchProcessor = Depends(get_processor)
):
    temp_path, orig_name = await _save_temp_upload(file)
    try:
        result = await processor.analyze_bpm_only(temp_path, filename=orig_name)
        return BPMAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(temp_path)

@router.post(
    "/analyze/key",
    tags=["Audio Analysis (API v1)"],
    response_model=KeyAnalysisResponse,
    summary="Musical Key Detection",
    description="Detects musical key in Standard notation (e.g. A minor, C major) and Camelot notation (e.g. 8A, 8B) with confidence."
)
async def analyze_key(
    file: UploadFile = File(..., description="Audio file (MP3, WAV, FLAC, M4A, OGG, AIFF)"),
    processor: BatchProcessor = Depends(get_processor)
):
    temp_path, orig_name = await _save_temp_upload(file)
    try:
        result = await processor.analyze_key_only(temp_path, filename=orig_name)
        return KeyAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(temp_path)

@router.post(
    "/analyze/structure",
    tags=["Audio Analysis (API v1)"],
    response_model=StructureAnalysisResponse,
    summary="Song Structural Segmentation",
    description="Detects song structure boundaries and functional sections (Intro, Verse, Chorus, Bridge, Outro) with timestamps."
)
async def analyze_structure(
    file: UploadFile = File(..., description="Audio file (MP3, WAV, FLAC, M4A, OGG, AIFF)"),
    processor: BatchProcessor = Depends(get_processor)
):
    temp_path, orig_name = await _save_temp_upload(file)
    try:
        result = await processor.analyze_structure_only(temp_path, filename=orig_name)
        return StructureAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(temp_path)

@router.post(
    "/analyze/chords",
    tags=["Audio Analysis (API v1)"],
    response_model=ChordAnalysisResponse,
    summary="Chord Progression Recognition",
    description="Transcribes harmonic chord progression with precise start and end timestamps across the track."
)
async def analyze_chords(
    file: UploadFile = File(..., description="Audio file (MP3, WAV, FLAC, M4A, OGG, AIFF)"),
    processor: BatchProcessor = Depends(get_processor)
):
    temp_path, orig_name = await _save_temp_upload(file)
    try:
        result = await processor.analyze_chords_only(temp_path, filename=orig_name)
        return ChordAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(temp_path)

@router.post(
    "/analyze/quality",
    tags=["Audio Analysis (API v1)"],
    response_model=QualityAnalysisResponse,
    summary="Audio Quality & Authenticity Analysis",
    description="Inspects container codec, bit depth, sample rate, integrated LUFS loudness, true peak dBFS, cutoff frequency (Hz), and fake-lossless transcode authenticity verdict."
)
async def analyze_quality(
    file: UploadFile = File(..., description="Audio file (MP3, WAV, FLAC, M4A, OGG, AIFF)"),
    processor: BatchProcessor = Depends(get_processor)
):
    temp_path, orig_name = await _save_temp_upload(file)
    try:
        result = await processor.analyze_quality_only(temp_path, filename=orig_name)
        return QualityAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(temp_path)

@router.post(
    "/analyze/full",
    tags=["Audio Analysis (API v1)"],
    response_model=FullAnalysisResponse,
    summary="Comprehensive Full Audio Analysis",
    description="Runs full multi-worker analysis pipeline across BPM, Key, Structure, Chords, and Quality in parallel and returns aggregated JSON report."
)
async def analyze_full(
    file: UploadFile = File(..., description="Audio file (MP3, WAV, FLAC, M4A, OGG, AIFF)"),
    processor: BatchProcessor = Depends(get_processor)
):
    temp_path, orig_name = await _save_temp_upload(file)
    try:
        result = await processor.analyze_full(temp_path, filename=orig_name)
        return FullAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(temp_path)

@router.post(
    "/download/stream",
    tags=["Stream Downloader & Metadata (API v1)"],
    summary="Download and Stream Audio from URL",
    description="Downloads highest quality audio from a YouTube, SoundCloud, or audio link via yt-dlp + FFmpeg and streams the audio binary directly back to the caller (FLAC, MP3, or WAV). Automatically cleans up temporary files after streaming."
)
async def download_and_stream_audio(
    req: UrlIntakeRequest,
    background_tasks: BackgroundTasks,
):
    fmt = (req.audio_format or "flac").lower()
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{DOWNLOADER_URL}/download",
                json={"url": req.url, "audio_format": fmt, "audio_quality": "0"}
            )
            if resp.status_code != 200:
                try:
                    err_msg = resp.json().get("detail", resp.text)
                except Exception:
                    err_msg = resp.text
                raise HTTPException(status_code=resp.status_code, detail=err_msg)
            dl_data = resp.json()
    except httpx.RequestError as e:
        logger.error("Downloader microservice request error: %s", e)
        raise HTTPException(status_code=503, detail=f"Downloader microservice unreachable: {str(e)}")

    file_path = dl_data["file_path"]
    filename = dl_data["filename"]

    if not os.path.exists(file_path):
        raise HTTPException(status_code=500, detail="Downloaded file not found on volume.")

    # MIME types
    media_map = {
        "flac": "audio/flac",
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "m4a": "audio/mp4",
        "opus": "audio/opus",
    }
    media_type = media_map.get(fmt, "application/octet-stream")

    # Queue cleanup after response is sent
    background_tasks.add_task(_cleanup_temp_file, file_path)

    # Encode custom headers safely (ASCII-only)
    clean_title = urllib.parse.quote(str(dl_data.get("title", "")).encode("utf-8"))
    clean_uploader = urllib.parse.quote(str(dl_data.get("uploader", "") or "").encode("utf-8"))

    headers = {
        "X-Track-Title": clean_title,
        "X-Track-Duration": str(dl_data.get("duration", 0.0)),
        "X-Track-Uploader": clean_uploader,
        "X-Track-Format": fmt,
        "X-Track-Extractor": str(dl_data.get("extractor", "")),
    }

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
        headers=headers
    )

@router.post(
    "/download/info",
    tags=["Stream Downloader & Metadata (API v1)"],
    summary="Extract Track Info & Metadata from URL",
    description="Inspects URL (YouTube, SoundCloud, etc.) and returns metadata (title, duration, uploader, thumbnail) without downloading."
)
async def get_url_info(
    req: UrlIntakeRequest,
):
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{DOWNLOADER_URL}/info",
                json={"url": req.url}
            )
            if resp.status_code != 200:
                try:
                    err_msg = resp.json().get("detail", resp.text)
                except Exception:
                    err_msg = resp.text
                raise HTTPException(status_code=resp.status_code, detail=err_msg)
            return resp.json()
    except httpx.RequestError as e:
        logger.error("Downloader microservice info request error: %s", e)
        raise HTTPException(status_code=503, detail=f"Downloader microservice unreachable: {str(e)}")

@router.post(
    "/analyze/basic/url",
    tags=["Audio Analysis (API v1)"],
    response_model=BasicAnalysisResponse,
    summary="Direct URL Basic Audio Analysis (BPM & Key)",
    description="Fetches audio from a YouTube, SoundCloud, or direct audio link via yt-dlp + FFmpeg and executes fast BPM and Key detection."
)
async def analyze_basic_from_url(
    req: UrlIntakeRequest,
    processor: BatchProcessor = Depends(get_processor)
):
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{DOWNLOADER_URL}/download",
                json={"url": req.url, "audio_format": req.audio_format or "flac", "audio_quality": "0"}
            )
            if resp.status_code != 200:
                try:
                    err_msg = resp.json().get("detail", resp.text)
                except Exception:
                    err_msg = resp.text
                raise HTTPException(status_code=resp.status_code, detail=err_msg)
            dl_data = resp.json()
    except httpx.RequestError as e:
        logger.error("Downloader microservice download request error: %s", e)
        raise HTTPException(status_code=503, detail=f"Downloader microservice unreachable: {str(e)}")

    file_path = dl_data["file_path"]
    filename = dl_data["filename"]
    try:
        result = await processor.analyze_basic(file_path, filename=filename)
        return BasicAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(file_path)

@router.post(
    "/analyze/url",
    tags=["Audio Analysis (API v1)"],
    response_model=FullAnalysisResponse,
    summary="Direct URL Full Audio Analysis",
    description="Fetches audio from a YouTube, SoundCloud, or direct audio link via yt-dlp + FFmpeg and executes full multi-worker analysis."
)
async def analyze_from_url(
    req: UrlIntakeRequest,
    processor: BatchProcessor = Depends(get_processor)
):
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{DOWNLOADER_URL}/download",
                json={"url": req.url, "audio_format": req.audio_format or "flac", "audio_quality": "0"}
            )
            if resp.status_code != 200:
                try:
                    err_msg = resp.json().get("detail", resp.text)
                except Exception:
                    err_msg = resp.text
                raise HTTPException(status_code=resp.status_code, detail=err_msg)
            dl_data = resp.json()
    except httpx.RequestError as e:
        logger.error("Downloader microservice full analysis request error: %s", e)
        raise HTTPException(status_code=503, detail=f"Downloader microservice unreachable: {str(e)}")

    file_path = dl_data["file_path"]
    filename = dl_data["filename"]
    try:
        result = await processor.analyze_full(file_path, filename=filename)
        return FullAnalysisResponse(**result)
    finally:
        _cleanup_temp_file(file_path)

@router.post(
    "/stretch",
    tags=["Audio Pitch & Tempo Transformation (API v1)"],
    response_model=StretchResponse,
    summary="Pitch Shifting & Time Stretching via Rubber Band v4",
    description="Shifts audio pitch by semitones (-12 to +12) and/or stretches time/tempo (0.5x to 2.0x) using the Rubber Band Library v4.0 engine."
)
async def stretch_audio_v1(
    file: UploadFile = File(..., description="Audio file (MP3, WAV, FLAC, M4A, OGG)"),
    pitch_semitones: float = Form(0.0, description="Pitch shift in semitones (-12.0 to +12.0)"),
    tempo_ratio: float = Form(1.0, description="Tempo multiplier (0.5 to 2.0, e.g. 1.25 for 125% speed)"),
    target_bpm: Optional[float] = Form(None, description="Optional target BPM"),
    original_bpm: Optional[float] = Form(None, description="Optional original BPM"),
    preserve_formants: bool = Form(False, description="Preserve vocal formants"),
    output_format: str = Form("wav", description="Target format: wav, mp3, flac"),
):
    temp_path, orig_name = await _save_temp_upload(file)

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            payload = {
                "file_path": temp_path,
                "pitch_semitones": pitch_semitones,
                "tempo_ratio": tempo_ratio,
                "target_bpm": target_bpm,
                "original_bpm": original_bpm,
                "preserve_formants": preserve_formants,
                "output_format": output_format,
            }
            resp = await client.post(f"{STRETCH_WORKER_URL}/process", json=payload)
            if resp.status_code != 200:
                try:
                    err_msg = resp.json().get("detail", resp.text)
                except Exception:
                    err_msg = resp.text
                raise HTTPException(status_code=resp.status_code, detail=err_msg)

            data = resp.json()
            out_filename = data["output_filename"]
            return StretchResponse(
                success=True,
                output_filename=out_filename,
                output_url=f"/files/output/{out_filename}",
                duration=data.get("duration", 0.0),
                pitch_semitones=data.get("pitch_semitones", pitch_semitones),
                tempo_ratio=data.get("tempo_ratio", tempo_ratio),
                target_bpm=data.get("target_bpm", target_bpm),
                engine="Rubber Band Library v4.0"
            )
    except httpx.RequestError as e:
        logger.error("Stretch worker unreachable: %s", e)
        raise HTTPException(status_code=503, detail=f"Stretch worker unreachable: {str(e)}")
    finally:
        _cleanup_temp_file(temp_path)
