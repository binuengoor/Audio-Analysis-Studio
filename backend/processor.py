import asyncio
import os
from collections import OrderedDict
from typing import List, Optional, Dict, Any, Tuple
import httpx
from metadata import write_audio_metadata, get_audio_duration
from models import AnalysisResult
from utils import resolve_audio_file_path
from config import (
    BPM_WORKER_URL,
    KEY_WORKER_URL,
    CHORD_WORKER_URL,
    QUALITY_WORKER_URL,
    STRUCTURE_WORKER_URL,
    logger,
)

# Upper bound on in-memory batch results kept for /api/status polling
MAX_CACHED_RESULTS = 200


class WorkerError(Exception):
    """Raised when an analysis engine fails or returns an unusable response."""

    def __init__(self, engine: str, message: str):
        self.engine = engine
        self.message = message
        label = "All analysis engines" if engine == "all" else f"Analysis engine '{engine}'"
        super().__init__(f"{label} failed: {message}")


def _parse_bpm(res: Dict[str, Any]) -> Tuple[float, float]:
    if "bpm" not in res:
        raise WorkerError("bpm", "response did not contain a BPM value")
    return float(res["bpm"]), float(res.get("bpm_confidence", 0.0))


def _parse_key(res: Dict[str, Any]) -> Tuple[str, str, float]:
    camelot = res.get("key_camelot") or res.get("key")
    standard = res.get("key_standard")
    if not camelot or not standard:
        raise WorkerError("key", "response did not contain a key")
    return str(camelot), str(standard), float(res.get("key_confidence", 0.0))


def _parse_chords(res: Any) -> List[Dict[str, Any]]:
    raw_chords = res.get("chords", []) if isinstance(res, dict) else res
    chords: List[Dict[str, Any]] = []
    if isinstance(raw_chords, list):
        for c in raw_chords:
            if isinstance(c, dict):
                chords.append({
                    "start": float(c.get("start", 0.0)),
                    "end": float(c.get("end", 0.0)),
                    "chord": str(c.get("chord", "N"))
                })
    return chords


def _parse_segments(res: Any) -> List[Dict[str, Any]]:
    raw_segments = res.get("segments", []) if isinstance(res, dict) else []
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
    return segments


def _parse_quality(res: Dict[str, Any]) -> Dict[str, Any]:
    if not all(k in res for k in ("container", "mastering", "authenticity")):
        raise WorkerError("quality", "response was missing container, mastering or authenticity data")
    return res


def _remove_spectrogram(quality_res: Dict[str, Any]) -> None:
    spec_path = quality_res.get("spectrogram_image_path")
    if spec_path and os.path.exists(spec_path):
        try:
            os.remove(spec_path)
        except Exception:
            pass


class BatchProcessor:
    def __init__(self, upload_dir: str):
        self.upload_dir = upload_dir
        self.lock = asyncio.Lock()
        self.queue: List[str] = []
        self.current_file: Optional[str] = None
        self.is_processing = False
        self.results: "OrderedDict[str, AnalysisResult]" = OrderedDict()
        self.processed_count = 0
        self.total_count = 0
        self._http_client: Optional[httpx.AsyncClient] = None
        self._http_client_loop: Optional[asyncio.AbstractEventLoop] = None

    async def get_http_client(self) -> httpx.AsyncClient:
        """
        Returns a pooled AsyncClient bound to the running event loop.
        Pooled connections cannot be reused across event loops (e.g. Celery tasks that
        each run in a fresh loop), so a new client is created whenever the loop changes.
        """
        loop = asyncio.get_running_loop()
        if (
            self._http_client is None
            or self._http_client.is_closed
            or self._http_client_loop is not loop
        ):
            limits = httpx.Limits(max_keepalive_connections=20, max_connections=50)
            self._http_client = httpx.AsyncClient(limits=limits, timeout=180.0)
            self._http_client_loop = loop
        return self._http_client

    async def close(self) -> None:
        """Closes shared AsyncClient session."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
        self._http_client = None
        self._http_client_loop = None

    async def _call_worker(self, client: httpx.AsyncClient, engine: str, worker_url: str, file_path: str) -> Dict[str, Any]:
        """Send asynchronous HTTP POST request with absolute file_path to worker. Raises WorkerError on failure."""
        endpoint = worker_url if worker_url.endswith("/analyze") else f"{worker_url}/analyze"
        payload = {"file_path": file_path}
        try:
            response = await client.post(endpoint, json=payload, timeout=180.0)
        except Exception as e:
            logger.warning("Error calling %s worker at %s for file %s: %s", engine, endpoint, file_path, e)
            raise WorkerError(engine, f"unreachable ({e.__class__.__name__}: {e})")

        if response.status_code != 200:
            try:
                detail = response.json().get("detail", response.text)
            except Exception:
                detail = response.text
            logger.warning("%s worker returned HTTP %d for %s: %s", engine, response.status_code, file_path, detail)
            raise WorkerError(engine, f"HTTP {response.status_code}: {detail}")

        try:
            return response.json()
        except Exception:
            raise WorkerError(engine, "returned invalid JSON")

    async def _try_worker(self, client: httpx.AsyncClient, engine: str, worker_url: str, file_path: str, parser):
        """Calls a worker and parses its response. Returns (parsed_value, error_message)."""
        try:
            res = await self._call_worker(client, engine, worker_url, file_path)
            return parser(res), None
        except WorkerError as e:
            return None, e.message
        except Exception as e:
            logger.warning("Could not parse %s worker response for %s: %s", engine, file_path, e)
            return None, f"invalid response ({e})"

    async def analyze_file_microservices(self, file_path: str, filename: str = "") -> dict:
        """
        Coordinates asynchronous analysis across BPM, Key, Chord, Quality, and Structure workers using asyncio.gather.
        Engines that fail are reported in `engine_errors` and their fields left empty rather than guessed.
        Embeds detected metadata into the audio file and returns aggregated results.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        (bpm_val, bpm_err), (key_val, key_err), (chords, chord_err), (quality, quality_err), (segments, structure_err) = await asyncio.gather(
            self._try_worker(client, "bpm", BPM_WORKER_URL, file_path, _parse_bpm),
            self._try_worker(client, "key", KEY_WORKER_URL, file_path, _parse_key),
            self._try_worker(client, "chords", CHORD_WORKER_URL, file_path, _parse_chords),
            self._try_worker(client, "quality", QUALITY_WORKER_URL, file_path, _parse_quality),
            self._try_worker(client, "structure", STRUCTURE_WORKER_URL, file_path, _parse_segments),
        )

        engine_errors = {
            engine: err
            for engine, err in (
                ("bpm", bpm_err),
                ("key", key_err),
                ("chords", chord_err),
                ("quality", quality_err),
                ("structure", structure_err),
            )
            if err
        }
        if len(engine_errors) == 5:
            raise WorkerError("all", "; ".join(f"{k}: {v}" for k, v in engine_errors.items()))

        bpm, bpm_confidence = bpm_val if bpm_val else (None, None)
        key_camelot, key_standard, key_confidence = key_val if key_val else (None, None, None)

        duration = get_audio_duration(file_path)

        # Only embed values that were actually detected
        if bpm is not None or key_camelot is not None:
            write_audio_metadata(file_path, bpm, key_camelot, key_standard or "")

        return {
            "filename": filename or os.path.basename(file_path),
            "bpm": bpm,
            "bpm_confidence": bpm_confidence,
            "key_standard": key_standard,
            "key_camelot": key_camelot,
            "key_confidence": key_confidence,
            "duration": duration,
            "chords": chords or [],
            "quality": quality,
            "segments": segments or [],
            "engine_errors": engine_errors,
        }

    async def analyze_basic(self, file_path: str, filename: str = "") -> dict:
        """Runs fast BPM and Key analysis in parallel and retrieves duration."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        (bpm_val, bpm_err), (key_val, key_err) = await asyncio.gather(
            self._try_worker(client, "bpm", BPM_WORKER_URL, file_path, _parse_bpm),
            self._try_worker(client, "key", KEY_WORKER_URL, file_path, _parse_key),
        )
        engine_errors = {k: v for k, v in (("bpm", bpm_err), ("key", key_err)) if v}
        if len(engine_errors) == 2:
            raise WorkerError("bpm+key", f"bpm: {bpm_err}; key: {key_err}")

        bpm, bpm_confidence = bpm_val if bpm_val else (None, None)
        key_camelot, key_standard, key_confidence = key_val if key_val else (None, None, None)

        return {
            "filename": filename or os.path.basename(file_path),
            "bpm": bpm,
            "bpm_confidence": bpm_confidence,
            "key_standard": key_standard,
            "key_camelot": key_camelot,
            "key_confidence": key_confidence,
            "duration_seconds": get_audio_duration(file_path),
            "engine_errors": engine_errors,
        }

    async def analyze_bpm_only(self, file_path: str, filename: str = "") -> dict:
        """Runs BPM analysis only. Raises WorkerError if the engine fails."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        bpm, bpm_confidence = _parse_bpm(await self._call_worker(client, "bpm", BPM_WORKER_URL, file_path))

        return {
            "filename": filename or os.path.basename(file_path),
            "bpm": bpm,
            "bpm_confidence": bpm_confidence,
        }

    async def analyze_key_only(self, file_path: str, filename: str = "") -> dict:
        """Runs Key analysis only. Raises WorkerError if the engine fails."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        key_camelot, key_standard, key_confidence = _parse_key(
            await self._call_worker(client, "key", KEY_WORKER_URL, file_path)
        )

        return {
            "filename": filename or os.path.basename(file_path),
            "key_standard": key_standard,
            "key_camelot": key_camelot,
            "key_confidence": key_confidence,
        }

    async def analyze_structure_only(self, file_path: str, filename: str = "") -> dict:
        """Runs structural segmentation analysis only. Raises WorkerError if the engine fails."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        structure_res = await self._call_worker(client, "structure", STRUCTURE_WORKER_URL, file_path)

        return {
            "filename": filename or os.path.basename(file_path),
            "duration_seconds": get_audio_duration(file_path),
            "segments": _parse_segments(structure_res),
        }

    async def analyze_chords_only(self, file_path: str, filename: str = "") -> dict:
        """Runs chord progression analysis only. Raises WorkerError if the engine fails."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        chord_res = await self._call_worker(client, "chords", CHORD_WORKER_URL, file_path)

        return {
            "filename": filename or os.path.basename(file_path),
            "duration_seconds": get_audio_duration(file_path),
            "chords": _parse_chords(chord_res),
        }

    async def analyze_quality_only(self, file_path: str, filename: str = "") -> dict:
        """Runs audio quality and authenticity analysis (omitting spectrogram image payload)."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        client = await self.get_http_client()
        quality_res = await self._call_worker(client, "quality", QUALITY_WORKER_URL, file_path)
        _remove_spectrogram(quality_res)
        quality_res = _parse_quality(quality_res)

        return {
            "filename": filename or os.path.basename(file_path),
            "container": quality_res["container"],
            "mastering": quality_res["mastering"],
            "authenticity": quality_res["authenticity"],
        }

    async def analyze_full(self, file_path: str, filename: str = "") -> dict:
        """Runs full analysis across all 5 workers in parallel and formats for API response."""
        res = await self.analyze_file_microservices(file_path, filename=filename)
        quality_data = None
        if res.get("quality"):
            q = res["quality"]
            _remove_spectrogram(q)
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
            "segments": res.get("segments", []),
            "engine_errors": res.get("engine_errors", {}),
        }

    def _remember_result(self, filename: str, result: AnalysisResult) -> None:
        self.results[filename] = result
        self.results.move_to_end(filename)
        while len(self.results) > MAX_CACHED_RESULTS:
            self.results.popitem(last=False)

    async def process_file(self, filename: str) -> dict:
        """
        Process a single file immediately (Individual Analysis).
        Runs concurrently with other requests; the workers handle their own load.
        Locates the file in either input_dir or output_dir.
        """
        file_path = resolve_audio_file_path(filename, input_dir=self.upload_dir)
        if not file_path or not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {filename}")

        result = await self.analyze_file_microservices(file_path, filename=filename)
        self._remember_result(filename, AnalysisResult(**result))
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
            "results": dict(self.results)
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
                    file_path = resolve_audio_file_path(filename, input_dir=self.upload_dir)
                    if not file_path:
                        raise FileNotFoundError(f"File not found: {filename}")

                    result = await self.analyze_file_microservices(file_path, filename=filename)
                    self._remember_result(filename, AnalysisResult(**result))
                    self.processed_count += 1
                    logger.info("Processed %s in background queue", filename)
                except Exception as e:
                    logger.error("Error processing %s in background queue: %s", filename, e, exc_info=True)
                finally:
                    self.current_file = None

        self.is_processing = False
