"""Watch folder: files dropped into <data>/watch are ingested and queued for analysis."""
import asyncio
import hashlib
import os
import shutil
import time
from typing import Callable, List

from config import AUDIO_EXTENSIONS, INPUT_DIR, WATCH_DIR, WATCH_INTERVAL_SECONDS, logger
from library import LibraryManager
from utils import sanitize_filename, unique_upload_name

# A file must be unchanged for this long before ingest, so half-copied files are never picked up
SETTLE_SECONDS = 3.0


def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def scan_watch_folder(
    library: LibraryManager,
    enqueue: Callable[[str], None],
    watch_dir: str = WATCH_DIR,
    input_dir: str = INPUT_DIR,
    now: float | None = None,
) -> List[str]:
    """Ingests settled audio files from `watch_dir`; returns the library filenames that were queued."""
    now = time.time() if now is None else now
    os.makedirs(watch_dir, exist_ok=True)
    ingested: List[str] = []
    for root, _, files in os.walk(watch_dir):
        for name in sorted(files):
            src = os.path.join(root, name)
            if os.path.splitext(name)[1].lower() not in AUDIO_EXTENSIONS or name.startswith("."):
                continue
            try:
                if now - os.path.getmtime(src) < SETTLE_SECONDS:
                    continue
                content_hash = _sha256(src)
                final_name = unique_upload_name(input_dir, sanitize_filename(name), content_hash)
                dest = os.path.join(input_dir, final_name)
                if os.path.exists(dest):
                    os.remove(src)  # identical file already in the library
                    continue
                shutil.move(src, dest)
                entry = library.get_entry_by_filename(final_name) or library.add_entry(final_name)
                library.set_content_hash(entry.id, content_hash)
                enqueue(final_name)
                ingested.append(final_name)
                logger.info("Watch folder ingested %s", final_name)
            except Exception as e:  # keep scanning other files
                logger.warning("Watch folder could not ingest %s: %s", src, e)
    return ingested


async def watch_loop(library: LibraryManager, enqueue: Callable[[str], None]) -> None:
    logger.info("Watch folder enabled: %s (every %ss)", WATCH_DIR, WATCH_INTERVAL_SECONDS)
    while True:
        try:
            await asyncio.to_thread(scan_watch_folder, library, enqueue)
        except Exception as e:
            logger.warning("Watch folder scan failed: %s", e)
        await asyncio.sleep(WATCH_INTERVAL_SECONDS)
