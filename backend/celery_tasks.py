import os
import asyncio
from celery import Celery
from processor import BatchProcessor
from library import LibraryManager
from config import (
    REDIS_URL,
    SHARED_DATA_DIR,
    INPUT_DIR,
    logger,
)

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
        # Search recursively in input directory
        for root, _, files in os.walk(INPUT_DIR):
            if filename in files:
                target_path = os.path.join(root, filename)
                break

    if not os.path.exists(target_path):
        logger.error("Celery task failed: File not found on shared volume: %s", target_path)
        raise FileNotFoundError(f"File not found on shared volume: {target_path}")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            processor.analyze_file_microservices(target_path, filename=filename)
        )

        # Update SQLite library database
        entry = library.get_entry_by_filename(filename)
        if not entry:
            entry = library.add_entry(filename)
        if entry:
            from models import AnalysisResult
            library.update_analysis(entry.id, AnalysisResult(**result))

        logger.info("Celery task completed analysis for %s", filename)
        return result
    finally:
        loop.close()
