import os
import sys
import re
import glob
import logging
import subprocess
import importlib
import ipaddress
import socket
import urllib.parse
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("downloader-worker")

app = FastAPI(
    title="Audio Analysis Studio - Downloader Worker",
    description="Microservice for audio-only stream extraction via yt-dlp & FFmpeg",
    version="1.0.0"
)

# Directories & Configuration
DEFAULT_DATA_DIR = "/app/data/shared_audio" if os.path.exists("/app") else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data")
)
SHARED_DATA_DIR = os.getenv("SHARED_DATA_DIR", DEFAULT_DATA_DIR)
INPUT_DIR = os.path.join(SHARED_DATA_DIR, "input")
COOKIES_FILE = os.getenv("COOKIES_FILE", "/app/cookies/cookies.txt")

ALLOW_PRIVATE_URLS = os.getenv("ALLOW_PRIVATE_URLS", "false").lower() in ("1", "true", "yes")

os.makedirs(INPUT_DIR, exist_ok=True)


def assert_public_url(url: str) -> None:
    """
    SSRF guard: only http(s) URLs whose host resolves exclusively to public addresses are accepted,
    so the downloader cannot be pointed at redis, other workers, or cloud metadata endpoints.
    Set ALLOW_PRIVATE_URLS=true to fetch from LAN hosts (e.g. a self-hosted music server).
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Only http(s) URLs are supported.")
    if ALLOW_PRIVATE_URLS:
        return
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Could not resolve host '{parsed.hostname}'.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global:
            raise HTTPException(
                status_code=400,
                detail="URL resolves to a private or reserved address (set ALLOW_PRIVATE_URLS=true to allow).",
            )


class DownloadRequest(BaseModel):
    url: str
    audio_format: Optional[str] = "flac"  # "flac", "mp3", "wav", "m4a", "opus"
    audio_quality: Optional[str] = "0"    # 0 = highest VBR / bitrate


class DownloadResponse(BaseModel):
    success: bool
    filename: str
    file_path: str
    title: str
    uploader: Optional[str] = None
    duration: float = 0.0
    thumbnail: Optional[str] = None
    source_url: str
    extractor: str
    audio_format: str
    file_size_bytes: int = 0


class EngineVersionResponse(BaseModel):
    ytdlp_version: str
    ffmpeg_version: str
    cookies_present: bool
    cookies_path: str


class UpdateEngineResponse(BaseModel):
    success: bool
    message: str
    previous_version: str
    new_version: str
    output: Optional[str] = None


def get_ytdlp_version() -> str:
    try:
        import yt_dlp
        return getattr(yt_dlp.version, "__version__", "unknown")
    except Exception:
        return "not installed"


def get_ffmpeg_version() -> str:
    try:
        res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=5)
        first_line = res.stdout.splitlines()[0] if res.stdout else "unknown"
        return first_line
    except Exception as e:
        return f"ffmpeg not found: {e}"


def _perform_ytdlp_download(url: str, audio_format: str = "flac", audio_quality: str = "0", use_cookies: bool = True) -> dict:
    import yt_dlp

    # Validate audio format
    allowed_formats = {"flac", "mp3", "wav", "m4a", "opus", "aac"}
    fmt = audio_format.lower() if audio_format else "flac"
    if fmt not in allowed_formats:
        fmt = "flac"

    output_template = os.path.join(INPUT_DIR, "%(title).150B [%(id)s].%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": fmt,
                "preferredquality": audio_quality,
            },
            {
                "key": "FFmpegMetadata",
            },
        ],
        "noplaylist": True,
        "quiet": False,
        "no_warnings": False,
        "ignoreerrors": False,
        "prefer_ffmpeg": True,
    }

    # Attach cookies if requested and available
    if use_cookies and COOKIES_FILE and os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0:
        working_cookies = "/tmp/cookies_working.txt"
        try:
            import shutil
            shutil.copyfile(COOKIES_FILE, working_cookies)
            ydl_opts["cookiefile"] = working_cookies
            logger.info(f"Using cookies file (staged to {working_cookies})")
        except Exception as e:
            logger.warning(f"Could not stage cookies to /tmp, using direct path: {e}")
            ydl_opts["cookiefile"] = COOKIES_FILE
    else:
        logger.info("Executing download without cookies.")

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        logger.info(f"Extracting audio from URL: {url} (target format: {fmt}, cookies={use_cookies})")
        info = ydl.extract_info(url, download=True)
        if info is None:
            raise HTTPException(status_code=400, detail="Could not extract video/audio stream from provided URL.")

        original_filepath = ydl.prepare_filename(info)
        base, _ = os.path.splitext(original_filepath)
        expected_filepath = f"{base}.{fmt}"

        actual_path = None
        if os.path.exists(expected_filepath):
            actual_path = expected_filepath
        else:
            matches = glob.glob(f"{glob.escape(base)}.*")
            if matches:
                actual_path = matches[0]

        if not actual_path or not os.path.exists(actual_path):
            raise HTTPException(
                status_code=500,
                detail=f"Audio extraction completed but resulting file was not found on shared volume: {expected_filepath}"
            )

        file_size = os.path.getsize(actual_path)
        filename = os.path.basename(actual_path)

        return {
            "success": True,
            "filename": filename,
            "file_path": actual_path,
            "title": info.get("title") or filename,
            "uploader": info.get("uploader") or info.get("channel"),
            "duration": float(info.get("duration") or 0.0),
            "thumbnail": info.get("thumbnail"),
            "source_url": url,
            "extractor": info.get("extractor") or "unknown",
            "audio_format": fmt,
            "file_size_bytes": file_size,
        }


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "downloader-worker"}


@app.get("/version", response_model=EngineVersionResponse)
def get_version():
    cookies_exist = bool(COOKIES_FILE and os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0)
    return EngineVersionResponse(
        ytdlp_version=get_ytdlp_version(),
        ffmpeg_version=get_ffmpeg_version(),
        cookies_present=cookies_exist,
        cookies_path=COOKIES_FILE,
    )


@app.post("/update-engine", response_model=UpdateEngineResponse)
def update_engine():
    prev_version = get_ytdlp_version()
    try:
        res = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--no-cache-dir", "--upgrade", "yt-dlp", "yt-dlp-ejs"],
            capture_output=True,
            text=True,
            check=True,
            timeout=60
        )
        import yt_dlp
        importlib.reload(yt_dlp)
        new_version = getattr(yt_dlp.version, "__version__", "unknown")

        return UpdateEngineResponse(
            success=True,
            message=f"yt-dlp successfully updated from {prev_version} to {new_version}",
            previous_version=prev_version,
            new_version=new_version,
            output=res.stdout,
        )
    except Exception as e:
        logger.error(f"Failed to update yt-dlp: {e}")
        return UpdateEngineResponse(
            success=False,
            message=f"Failed to update yt-dlp: {str(e)}",
            previous_version=prev_version,
            new_version=prev_version,
            output=str(e),
        )


@app.post("/download", response_model=DownloadResponse)
def download_audio(req: DownloadRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    assert_public_url(url)

    import yt_dlp

    has_cookies = bool(COOKIES_FILE and os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0)

    # Strategy: Try with cookies first if available
    try:
        result = _perform_ytdlp_download(url, req.audio_format, req.audio_quality, use_cookies=has_cookies)
        return DownloadResponse(**result)
    except yt_dlp.utils.DownloadError as e:
        err_msg = str(e)
        logger.warning(f"Initial yt-dlp download attempt error: {err_msg}")

        # If cookies triggered 'The page needs to be reloaded' or 403, fallback to unauthenticated extraction
        if has_cookies and ("The page needs to be reloaded" in err_msg or "403" in err_msg or "Requested format is not available" in err_msg):
            logger.info("Retrying extraction without cookies due to cookie challenge/reload error...")
            try:
                result = _perform_ytdlp_download(url, req.audio_format, req.audio_quality, use_cookies=False)
                return DownloadResponse(**result)
            except Exception as fallback_err:
                logger.warning(f"Unauthenticated fallback also failed: {fallback_err}")
                err_msg = str(fallback_err)

        # If unauthenticated failed due to bot sign-in and we have cookies, or need cookies
        if "Sign in to confirm you’re not a bot" in err_msg or "Sign in to confirm you're not a bot" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="YouTube requested bot verification. Please provide a fresh cookies.txt file in ./config/cookies.txt."
            )

        # Attempt self-healing hot-update if extractor signature error detected
        if "Unable to extract" in err_msg or "RegexNotFoundError" in err_msg or "Signature extraction failed" in err_msg:
            logger.info("Attempting automatic yt-dlp hot upgrade to resolve extractor issue...")
            try:
                subprocess.run([sys.executable, "-m", "pip", "install", "--no-cache-dir", "-U", "yt-dlp", "yt-dlp-ejs"], timeout=45)
                importlib.reload(yt_dlp)
                result = _perform_ytdlp_download(url, req.audio_format, req.audio_quality, use_cookies=False)
                return DownloadResponse(**result)
            except Exception as retry_err:
                logger.error(f"Hot-update retry failed: {retry_err}")

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Download failed: {err_msg}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in download_audio: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal download processing error: {str(e)}")


class InfoRequest(BaseModel):
    url: str


class InfoResponse(BaseModel):
    title: str
    uploader: Optional[str] = None
    duration: float = 0.0
    thumbnail: Optional[str] = None
    source_url: str
    extractor: str


@app.post("/info", response_model=InfoResponse)
def get_track_info(req: InfoRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    assert_public_url(url)

    import yt_dlp

    def _extract_meta(use_cookies: bool = True):
        ydl_opts = {
            "noplaylist": True,
            "quiet": True,
        }
        if use_cookies and COOKIES_FILE and os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0:
            working_cookies = "/tmp/cookies_working.txt"
            try:
                import shutil
                shutil.copyfile(COOKIES_FILE, working_cookies)
                ydl_opts["cookiefile"] = working_cookies
            except Exception:
                ydl_opts["cookiefile"] = COOKIES_FILE

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title") or "Unknown Title",
                "uploader": info.get("uploader") or info.get("channel"),
                "duration": float(info.get("duration") or 0.0),
                "thumbnail": info.get("thumbnail"),
                "source_url": url,
                "extractor": info.get("extractor") or "unknown",
            }

    try:
        data = _extract_meta(use_cookies=True)
        return InfoResponse(**data)
    except Exception as e:
        try:
            data = _extract_meta(use_cookies=False)
            return InfoResponse(**data)
        except Exception as e2:
            raise HTTPException(status_code=400, detail=f"Failed to extract metadata: {str(e2)}")

