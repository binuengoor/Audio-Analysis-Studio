import os
import asyncio
from celery import Celery
from processor import BatchProcessor
from library import LibraryManager
from utils import resolve_audio_file_path
from models import AnalysisResult
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
def analyze_audio_task(self, filename: str):
    """
    Celery background task orchestrating parallel microservice calls
    (BeatNet BPM, MusicalKeyCNN Key, Madmom Chords, Quality Worker, Structure Worker).
    Marks the library entry as 'error' if the analysis fails so it never stays stuck in 'processing'.
    """
    self.update_state(state="PROCESSING", meta={"filename": filename})

    entry = library.get_entry_by_filename(filename)
    try:
        target_path = resolve_audio_file_path(filename)
        if not target_path or not os.path.exists(target_path):
            raise FileNotFoundError(f"File not found on shared volume: {filename}")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                processor.analyze_file_microservices(target_path, filename=filename)
            )
        finally:
            # The pooled HTTP client is bound to this loop; close it before the loop goes away
            loop.run_until_complete(processor.close())
            loop.close()
            asyncio.set_event_loop(None)

        if not entry:
            entry = library.add_entry(filename)
        library.update_analysis(entry.id, AnalysisResult(**result))

        logger.info("Celery task completed analysis for %s", filename)
        return result
    except Exception as e:
        logger.error("Celery task failed for %s: %s", filename, e)
        if entry:
            library.set_status(entry.id, "error")
        raise
