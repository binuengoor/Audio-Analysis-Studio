import os
import asyncio
from celery import Celery
from processor import BatchProcessor
from library import LibraryManager

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
DEFAULT_DATA_DIR = "/app/data/shared_audio" if os.path.exists("/app") else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
SHARED_DATA_DIR = os.getenv("SHARED_DATA_DIR", DEFAULT_DATA_DIR)
INPUT_DIR = os.path.join(SHARED_DATA_DIR, "input")

celery_app = Celery(
    "audio_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

processor = BatchProcessor(INPUT_DIR)
library = LibraryManager(SHARED_DATA_DIR)

@celery_app.task(bind=True, name="analyze_audio_task")
def analyze_audio_task(self, filename: str, file_path: str = ""):
    """
    Celery background task orchestrating parallel microservice calls
    (BeatNet BPM, MusicalKeyCNN Key, Madmom Chords, Quality Worker, Structure Worker).
    """
    self.update_state(state="PROCESSING", meta={"filename": filename})

    target_path = file_path or os.path.join(INPUT_DIR, filename)
    if not os.path.exists(target_path):
        # Search recursively
        for root, _, files in os.walk(INPUT_DIR):
            if filename in files:
                target_path = os.path.join(root, filename)
                break

    if not os.path.exists(target_path):
        raise FileNotFoundError(f"File not found on shared volume: {target_path}")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            processor.analyze_file_microservices(target_path, filename=filename)
        )

        # Update library database
        entry = library.get_entry_by_filename(filename)
        if not entry:
            entry = library.add_entry(filename)
        if entry:
            from models import AnalysisResult
            library.update_analysis(entry.id, AnalysisResult(**result))

        return result
    finally:
        loop.close()
