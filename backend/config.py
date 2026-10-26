import os
import logging
from typing import List, Set

# --- Base Directories ---
DEFAULT_DATA_DIR = (
    "/app/data/shared_audio"
    if os.path.exists("/app")
    else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
)
SHARED_DATA_DIR: str = os.getenv("SHARED_DATA_DIR", DEFAULT_DATA_DIR)
DATA_DIR: str = SHARED_DATA_DIR
INPUT_DIR: str = os.path.join(SHARED_DATA_DIR, "input")
OUTPUT_DIR: str = os.path.join(SHARED_DATA_DIR, "output")
SQLITE_DB_PATH: str = os.path.join(SHARED_DATA_DIR, "library.db")
LEGACY_JSON_DB_PATH: str = os.path.join(SHARED_DATA_DIR, "library.json")

# Directory initialization helper
def ensure_directories() -> None:
    """Ensures input and output directories exist on disk."""
    os.makedirs(INPUT_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

# Call on import as safe default, but allow explicit invocation during app lifespan
ensure_directories()

# --- Microservice URLs ---
BPM_WORKER_URL: str = os.getenv("BPM_WORKER_URL", "http://bpm-worker:8001")
KEY_WORKER_URL: str = os.getenv("KEY_WORKER_URL", "http://key-worker:8002")
CHORD_WORKER_URL: str = os.getenv("CHORD_WORKER_URL", "http://chord-worker:8003")
QUALITY_WORKER_URL: str = os.getenv("QUALITY_WORKER_URL", "http://quality-worker:8004")
STRUCTURE_WORKER_URL: str = os.getenv("STRUCTURE_WORKER_URL", "http://structure-worker:8005")
DOWNLOADER_URL: str = os.getenv("DOWNLOADER_URL", "http://downloader-worker:8006")
STRETCH_WORKER_URL: str = os.getenv("STRETCH_WORKER_URL", "http://stretch-worker:8007")

# --- Redis & Celery ---
REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")

# --- Security & Rate Limiting ---
MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "500"))

def get_configured_api_keys() -> Set[str]:
    """Dynamically reads configured API keys from environment."""
    keys = set()
    single_key = os.getenv("API_KEY", "").strip()
    if single_key:
        keys.add(single_key)
    multiple_keys = os.getenv("API_KEYS", "").strip()
    if multiple_keys:
        for k in multiple_keys.split(","):
            cleaned = k.strip()
            if cleaned:
                keys.add(cleaned)
    return keys

# CORS Configuration
ALLOWED_ORIGINS_ENV = os.getenv("ALLOWED_ORIGINS", "*")
if ALLOWED_ORIGINS_ENV == "*":
    ALLOWED_ORIGINS: List[str] = ["*"]
else:
    ALLOWED_ORIGINS: List[str] = [orig.strip() for orig in ALLOWED_ORIGINS_ENV.split(",") if orig.strip()]

# --- Logging Configuration ---
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger("audio_studio")

# --- Watch folder ---
# Audio dropped into <data>/watch is moved to input and analysed automatically (off by default).
WATCH_FOLDER_ENABLED: bool = os.getenv("WATCH_FOLDER", "false").lower() in ("1", "true", "yes")
WATCH_DIR: str = os.path.join(SHARED_DATA_DIR, "watch")
WATCH_INTERVAL_SECONDS: int = max(2, int(os.getenv("WATCH_INTERVAL_SECONDS", "10")))
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".aif", ".aiff"}
