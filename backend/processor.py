import asyncio
import os
from typing import List, Optional, Dict, Any
import httpx
from metadata import write_audio_metadata, get_audio_duration
from models import AnalysisResult, ChordSegment, SectionSegment

BPM_WORKER_URL = os.getenv("BPM_WORKER_URL", "http://bpm-worker:8001/analyze")
KEY_WORKER_URL = os.getenv("KEY_WORKER_URL", "http://key-worker:8002/analyze")
CHORD_WORKER_URL = os.getenv("CHORD_WORKER_URL", "http://chord-worker:8003/analyze")
QUALITY_WORKER_URL = os.getenv("QUALITY_WORKER_URL", "http://quality-worker:8004/analyze")
STRUCTURE_WORKER_URL = os.getenv("STRUCTURE_WORKER_URL", "http://structure-worker:8005/analyze")

class BatchProcessor:
    def __init__(self, upload_dir: str):
        self.upload_dir = upload_dir
        self.lock = asyncio.Lock()
        self.queue: List[str] = []
        self.current_file: Optional[str] = None
        self.is_processing = False
        self.results: Dict[str, AnalysisResult] = {}
        self.processed_count = 0
        self.total_count = 0

    async def _call_worker(self, client: httpx.AsyncClient, worker_url: str, file_path: str) -> Dict[str, Any]:
        """Send asynchronous HTTP POST request with absolute file_path to worker."""
        payload = {"file_path": file_path}
        try:
            response = await client.post(worker_url, json=payload, timeout=180.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error calling worker at {worker_url}: {e}")
            return {}

    async def analyze_file_microservices(self, file_path: str, filename: str = "") -> dict:
        """
        Coordinates asynchronous analysis across BPM, Key, Chord, Quality, and Structure workers using asyncio.gather.
        Embeds metadata into the audio file and returns aggregated results.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Send simultaneous requests across all 5 workers
        async with httpx.AsyncClient() as client:
            bpm_task = self._call_worker(client, BPM_WORKER_URL, file_path)
            key_task = self._call_worker(client, KEY_WORKER_URL, file_path)
            chord_task = self._call_worker(client, CHORD_WORKER_URL, file_path)
            quality_task = self._call_worker(client, QUALITY_WORKER_URL, file_path)
            structure_task = self._call_worker(client, STRUCTURE_WORKER_URL, file_path)

            bpm_res, key_res, chord_res, quality_res, structure_res = await asyncio.gather(
                bpm_task, key_task, chord_task, quality_task, structure_task
            )

        # 1. Parse BPM Worker Response
        bpm = float(bpm_res.get("bpm", 120.0))
        bpm_confidence = float(bpm_res.get("bpm_confidence", 0.9))

        # 2. Parse Key Worker Response
        key_camelot = str(key_res.get("key_camelot", key_res.get("key", "8A")))
        key_standard = str(key_res.get("key_standard", "A minor"))
        key_confidence = float(key_res.get("key_confidence", 0.95))

        # 3. Parse Chord Worker Response
        raw_chords = chord_res.get("chords", chord_res if isinstance(chord_res, list) else [])
        chords: List[Dict[str, Any]] = []
        if isinstance(raw_chords, list):
            for c in raw_chords:
                if isinstance(c, dict):
                    chords.append({
                        "start": float(c.get("start", 0.0)),
                        "end": float(c.get("end", 0.0)),
                        "chord": str(c.get("chord", "N"))
                    })

        # 4. Parse Quality Worker Response
        quality = None
        if quality_res and "container" in quality_res:
            quality = quality_res

        # 5. Parse Structure Worker Response (Segments)
        raw_segments = structure_res.get("segments", []) if isinstance(structure_res, dict) else []
        segments: List[Dict[str, Any]] = []
        if isinstance(raw_segments, list):
            for s in raw_segments:
                if isinstance(s, dict):
                    segments.append({
                        "start": float(s.get("start", 0.0)),
                        "end": float(s.get("end", 0.0)),
                        "label": str(s.get("label", "Section")),
                        "color": str(s.get("color", "rgba(99, 102, 241, 0.20)"))
                    })

        # 6. Get Duration
        duration = get_audio_duration(file_path)

        # 7. ID3 & Audio Metadata Writing via mutagen
        write_audio_metadata(file_path, bpm, key_camelot, key_standard)

        # 8. Aggregate Response
        clean_filename = filename or os.path.basename(file_path)
        result = {
            "filename": clean_filename,
            "bpm": bpm,
            "bpm_confidence": bpm_confidence,
            "key_standard": key_standard,
            "key_camelot": key_camelot,
            "key_confidence": key_confidence,
            "duration": duration,
            "chords": chords,
            "quality": quality,
            "segments": segments
        }
        return result

    async def process_file(self, filename: str) -> dict:
        """
        Process a single file immediately (Individual Analysis).
        Uses the lock to ensure it doesn't conflict with batch processing.
        """
        async with self.lock:
            file_path = os.path.join(self.upload_dir, filename)
            if not os.path.exists(file_path):
                found = False
                for root, _, files in os.walk(self.upload_dir):
                    if filename in files:
                        file_path = os.path.join(root, filename)
                        found = True
                        break
                if not found:
                    raise FileNotFoundError(f"File not found: {filename}")

            result = await self.analyze_file_microservices(file_path, filename=filename)
            self.results[filename] = AnalysisResult(**result)
            return result

    async def add_to_queue(self, filenames: List[str]):
        """Add files to the batch queue."""
        self.queue.extend(filenames)
        self.total_count += len(filenames)
        if not self.is_processing:
            asyncio.create_task(self._process_queue())

    def get_status(self) -> dict:
        return {
            "queue_length": len(self.queue),
            "is_processing": self.is_processing,
            "current_file": self.current_file,
            "processed_count": self.processed_count,
            "total_count": self.total_count,
            "results": self.results
        }

    async def _process_queue(self):
        """Internal loop to process the queue serially."""
        self.is_processing = True

        while self.queue:
            async with self.lock:
                if not self.queue:
                    break

                filename = self.queue.pop(0)
                self.current_file = filename

                try:
                    file_path = os.path.join(self.upload_dir, filename)
                    if not os.path.exists(file_path):
                        for root, _, files in os.walk(self.upload_dir):
                            if filename in files:
                                file_path = os.path.join(root, filename)
                                break

                    result = await self.analyze_file_microservices(file_path, filename=filename)
                    self.results[filename] = AnalysisResult(**result)
                    self.processed_count += 1
                    print(f"Processed {filename}")
                except Exception as e:
                    print(f"Error processing {filename}: {e}")
                finally:
                    self.current_file = None

        self.is_processing = False
