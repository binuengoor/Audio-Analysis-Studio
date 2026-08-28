import asyncio
import os
from typing import List, Optional, Dict, Any
import httpx
from metadata import write_audio_metadata, get_audio_duration
from models import AnalysisResult, ChordSegment, SectionSegment
from utils import resolve_audio_file_path
from config import (
    BPM_WORKER_URL,
    KEY_WORKER_URL,
    CHORD_WORKER_URL,
    QUALITY_WORKER_URL,
    STRUCTURE_WORKER_URL,
    logger,
)

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
        self._http_client: Optional[httpx.AsyncClient] = None

    async def get_http_client(self) -> httpx.AsyncClient:
        """Returns shared pooled AsyncClient or creates one if not initialized."""
        if self._http_client is None or self._http_client.is_closed:
            limits = httpx.Limits(max_keepalive_connections=20, max_connections=50)
            self._http_client = httpx.AsyncClient(limits=limits, timeout=180.0)
        return self._http_client

    async def close(self) -> None:
        """Closes shared AsyncClient session."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
            self._http_client = None

    async def _call_worker(self, client: httpx.AsyncClient, worker_url: str, file_path: str) -> Dict[str, Any]:
        """Send asynchronous HTTP POST request with absolute file_path to worker."""
        # Ensure /analyze endpoint is targeted
        endpoint = worker_url if worker_url.endswith("/analyze") else f"{worker_url}/analyze"
        payload = {"file_path": file_path}
        try:
            response = await client.post(endpoint, json=payload, timeout=180.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning("Error calling worker at %s for file %s: %s", endpoint, file_path, e)
            return {}

    async def analyze_file_microservices(self, file_path: str, filename: str = "") -> dict:
        """
        Coordinates asynchronous analysis across BPM, Key, Chord, Quality, and Structure workers using asyncio.gather.
        Embeds metadata into the audio file and returns aggregated results.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Send simultaneous requests across all 5 workers using pooled client
        client = await self.get_http_client()
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

    async def analyze_basic(self, file_path: str, filename: str = "") -> dict:
        """Runs fast BPM and Key analysis in parallel and retrieves duration."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        bpm_task = self._call_worker(client, BPM_WORKER_URL, file_path)
        key_task = self._call_worker(client, KEY_WORKER_URL, file_path)
        bpm_res, key_res = await asyncio.gather(bpm_task, key_task)

        bpm = float(bpm_res.get("bpm", 120.0))
        bpm_confidence = float(bpm_res.get("bpm_confidence", 0.9))
        key_camelot = str(key_res.get("key_camelot", key_res.get("key", "8A")))
        key_standard = str(key_res.get("key_standard", "A minor"))
        key_confidence = float(key_res.get("key_confidence", 0.95))
        duration = get_audio_duration(file_path)

        return {
            "filename": filename or os.path.basename(file_path),
            "bpm": bpm,
            "bpm_confidence": bpm_confidence,
            "key_standard": key_standard,
            "key_camelot": key_camelot,
            "key_confidence": key_confidence,
            "duration_seconds": duration,
        }

    async def analyze_bpm_only(self, file_path: str, filename: str = "") -> dict:
        """Runs BPM analysis only."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        bpm_res = await self._call_worker(client, BPM_WORKER_URL, file_path)

        return {
            "filename": filename or os.path.basename(file_path),
            "bpm": float(bpm_res.get("bpm", 120.0)),
            "bpm_confidence": float(bpm_res.get("bpm_confidence", 0.9)),
        }

    async def analyze_key_only(self, file_path: str, filename: str = "") -> dict:
        """Runs Key analysis only."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        key_res = await self._call_worker(client, KEY_WORKER_URL, file_path)

        return {
            "filename": filename or os.path.basename(file_path),
            "key_standard": str(key_res.get("key_standard", "A minor")),
            "key_camelot": str(key_res.get("key_camelot", key_res.get("key", "8A"))),
            "key_confidence": float(key_res.get("key_confidence", 0.95)),
        }

    async def analyze_structure_only(self, file_path: str, filename: str = "") -> dict:
        """Runs structural segmentation analysis only."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        structure_res = await self._call_worker(client, STRUCTURE_WORKER_URL, file_path)

        raw_segments = structure_res.get("segments", []) if isinstance(structure_res, dict) else []
        segments = []
        if isinstance(raw_segments, list):
            for s in raw_segments:
                if isinstance(s, dict):
                    segments.append({
                        "start": float(s.get("start", 0.0)),
                        "end": float(s.get("end", 0.0)),
                        "label": str(s.get("label", "Section")),
                        "color": str(s.get("color", "rgba(99, 102, 241, 0.20)"))
                    })

        duration = get_audio_duration(file_path)
        return {
            "filename": filename or os.path.basename(file_path),
            "duration_seconds": duration,
            "segments": segments,
        }

    async def analyze_chords_only(self, file_path: str, filename: str = "") -> dict:
        """Runs chord progression analysis only."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        chord_res = await self._call_worker(client, CHORD_WORKER_URL, file_path)

        raw_chords = chord_res.get("chords", chord_res if isinstance(chord_res, list) else [])
        chords = []
        if isinstance(raw_chords, list):
            for c in raw_chords:
                if isinstance(c, dict):
                    chords.append({
                        "start": float(c.get("start", 0.0)),
                        "end": float(c.get("end", 0.0)),
                        "chord": str(c.get("chord", "N"))
                    })

        duration = get_audio_duration(file_path)
        return {
            "filename": filename or os.path.basename(file_path),
            "duration_seconds": duration,
            "chords": chords,
        }

    async def analyze_quality_only(self, file_path: str, filename: str = "") -> dict:
        """Runs audio quality and authenticity analysis (omitting spectrogram image payload)."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        quality_res = await self._call_worker(client, QUALITY_WORKER_URL, file_path)

        # Cleanup generated spectrogram image from disk if created by worker
        if quality_res and "spectrogram_image_path" in quality_res:
            spec_path = quality_res["spectrogram_image_path"]
            if spec_path and os.path.exists(spec_path):
                try:
                    os.remove(spec_path)
                except Exception:
                    pass

        container = quality_res.get("container", {
            "codec": "UNKNOWN",
            "stated_bitrate_kbps": 0,
            "sample_rate_hz": 44100,
            "bit_depth": 16,
            "channels": 2
        })
        mastering = quality_res.get("mastering", {
            "lufs": -70.0,
            "peak_db": 0.0
        })
        authenticity = quality_res.get("authenticity", {
            "cutoff_hz": 0,
            "estimated_bitrate_kbps": "Unknown",
            "verdict": "Unknown"
        })

        return {
            "filename": filename or os.path.basename(file_path),
            "container": container,
            "mastering": mastering,
            "authenticity": authenticity,
        }

    async def analyze_full(self, file_path: str, filename: str = "") -> dict:
        """Runs full analysis across all 5 workers in parallel and formats for API response."""
        res = await self.analyze_file_microservices(file_path, filename=filename)
        quality_data = None
        if res.get("quality"):
            q = res["quality"]
            # Cleanup spectrogram file if generated
            if "spectrogram_image_path" in q and q["spectrogram_image_path"]:
                spec_p = q["spectrogram_image_path"]
                if os.path.exists(spec_p):
                    try:
                        os.remove(spec_p)
                    except Exception:
                        pass
            quality_data = {
                "container": q.get("container"),
                "mastering": q.get("mastering"),
                "authenticity": q.get("authenticity")
            }

        return {
            "filename": res.get("filename"),
            "bpm": res.get("bpm"),
            "bpm_confidence": res.get("bpm_confidence"),
            "key_standard": res.get("key_standard"),
            "key_camelot": res.get("key_camelot"),
            "key_confidence": res.get("key_confidence"),
            "duration_seconds": res.get("duration", 0.0),
            "chords": res.get("chords", []),
            "quality": quality_data,
            "segments": res.get("segments", [])
        }

    async def process_file(self, filename: str) -> dict:
        """
        Process a single file immediately (Individual Analysis).
        Uses the lock to ensure it doesn't conflict with batch processing.
        Locates the file in either input_dir or output_dir.
        """
        async with self.lock:
            file_path = resolve_audio_file_path(filename, input_dir=self.upload_dir)
            if not file_path or not os.path.exists(file_path):
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
                    logger.info("Processed %s in background queue", filename)
                except Exception as e:
                    logger.error("Error processing %s in background queue: %s", filename, e, exc_info=True)
                finally:
                    self.current_file = None

        self.is_processing = False
