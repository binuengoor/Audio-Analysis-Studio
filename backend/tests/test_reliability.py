"""
Regression tests for analysis correctness and gateway hardening:
- pooled HTTP client reuse across event loops (Celery tasks)
- failed engines are reported, never replaced with guessed values
- API key enforcement across all gateway routes
- upload size limits and same-name collisions
- stretch source files resolved server-side only
"""
import asyncio
import http.server
import json
import os
import sys
import threading
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app, INPUT_DIR
from processor import BatchProcessor, WorkerError
import celery_tasks

client = TestClient(app)


@pytest.fixture
def worker_server():
    """A keep-alive HTTP server standing in for an analysis worker."""

    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            body = json.dumps({"bpm": 128.0, "bpm_confidence": 0.9}).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


def test_http_client_survives_new_event_loops(worker_server):
    """Each Celery task runs in a fresh event loop; worker calls must keep working in every one."""
    processor = BatchProcessor("/tmp")
    for _ in range(3):
        loop = asyncio.new_event_loop()
        try:
            async def call():
                http_client = await processor.get_http_client()
                return await processor._call_worker(http_client, "bpm", worker_server, "/x.wav")

            assert loop.run_until_complete(call())["bpm"] == 128.0
        finally:
            loop.close()


def _fake_workers(failing):
    responses = {
        "bpm": {"bpm": 124.0, "bpm_confidence": 0.8},
        "key": {"key_camelot": "5A", "key_standard": "C minor", "key_confidence": 0.7},
        "chords": {"chords": [{"start": 0.0, "end": 1.0, "chord": "C:min"}]},
        "quality": {
            "container": {"codec": "WAV", "stated_bitrate_kbps": 1411, "sample_rate_hz": 44100, "bit_depth": 16, "channels": 2},
            "mastering": {"lufs": -9.0, "peak_db": -0.1},
            "authenticity": {"cutoff_hz": 22000, "estimated_bitrate_kbps": "Lossless", "verdict": "GENUINE"},
            "spectrogram_image_path": "",
        },
        "structure": {"segments": [{"start": 0.0, "end": 1.0, "label": "Intro", "color": "red"}]},
    }

    async def call(http_client, engine, url, file_path):
        if engine in failing:
            raise WorkerError(engine, "HTTP 503: down")
        return responses[engine]

    return call


@pytest.mark.asyncio
async def test_failed_engines_are_reported_not_guessed(tmp_path):
    audio = tmp_path / "track.wav"
    audio.write_bytes(b"RIFF")
    processor = BatchProcessor(str(tmp_path))

    with patch.object(processor, "_call_worker", side_effect=_fake_workers({"bpm", "key"})), \
            patch("processor.write_audio_metadata") as write_tags:
        result = await processor.analyze_file_microservices(str(audio))

    assert result["bpm"] is None and result["bpm_confidence"] is None
    assert result["key_camelot"] is None and result["key_standard"] is None
    assert set(result["engine_errors"]) == {"bpm", "key"}
    assert result["chords"][0]["chord"] == "C:min"
    # Nothing detected for BPM/key, so nothing may be written into the file's tags
    write_tags.assert_not_called()


@pytest.mark.asyncio
async def test_detected_values_are_tagged(tmp_path):
    audio = tmp_path / "track.wav"
    audio.write_bytes(b"RIFF")
    processor = BatchProcessor(str(tmp_path))

    with patch.object(processor, "_call_worker", side_effect=_fake_workers({"chords"})), \
            patch("processor.write_audio_metadata") as write_tags:
        result = await processor.analyze_file_microservices(str(audio))

    assert result["bpm"] == 124.0 and result["key_camelot"] == "5A"
    assert result["engine_errors"] == {"chords": "HTTP 503: down"}
    write_tags.assert_called_once_with(str(audio), 124.0, "5A", "C minor")


@pytest.mark.asyncio
async def test_all_engines_failing_raises(tmp_path):
    audio = tmp_path / "track.wav"
    audio.write_bytes(b"RIFF")
    processor = BatchProcessor(str(tmp_path))
    with patch.object(processor, "_call_worker", side_effect=_fake_workers({"bpm", "key", "chords", "quality", "structure"})):
        with pytest.raises(WorkerError):
            await processor.analyze_file_microservices(str(audio))


def test_v1_single_engine_failure_returns_502():
    with patch("processor.BatchProcessor._call_worker", side_effect=_fake_workers({"bpm"})):
        response = client.post("/api/v1/analyze/bpm", files={"file": ("a.wav", b"RIFF", "audio/wav")})
    assert response.status_code == 502
    assert response.json()["engine"] == "bpm"


def test_celery_task_marks_entry_as_error_on_failure():
    entry = celery_tasks.library.add_entry("test_celery_missing.wav")
    try:
        with patch.object(celery_tasks.analyze_audio_task, "update_state"), pytest.raises(FileNotFoundError):
            celery_tasks.analyze_audio_task.run("test_celery_missing.wav")
        assert celery_tasks.library.get_entry(entry.id).status == "error"
    finally:
        celery_tasks.library.delete_entry(entry.id)


@pytest.mark.parametrize("path", ["/api/library", "/api/health/services", "/files/input/x.wav", "/api/v1/download/info"])
def test_api_key_enforced_on_all_routes(monkeypatch, path):
    monkeypatch.setenv("API_KEY", "s3cret")
    assert client.get(path).status_code == 401
    assert client.get(path, headers={"X-API-Key": "wrong"}).status_code == 401


def test_api_key_accepts_header_and_bearer(monkeypatch):
    monkeypatch.setenv("API_KEY", "s3cret")
    assert client.get("/api/library", headers={"X-API-Key": "s3cret"}).status_code == 200
    assert client.get("/api/library", headers={"Authorization": "Bearer s3cret"}).status_code == 200
    # Root health check and docs stay public
    assert client.get("/").status_code == 200
    assert client.get("/openapi.json").status_code == 200


@pytest.fixture
def cleanup_inputs():
    yield
    for name in os.listdir(INPUT_DIR):
        if name.startswith("test_dupe") or name.startswith(".upload_"):
            os.remove(os.path.join(INPUT_DIR, name))


def test_same_name_upload_never_overwrites(cleanup_inputs):
    first = client.post("/api/upload", files={"file": ("test_dupe.wav", b"aaa", "audio/wav")}).json()
    again = client.post("/api/upload", files={"file": ("test_dupe.wav", b"aaa", "audio/wav")}).json()
    other = client.post("/api/upload", files={"file": ("test_dupe.wav", b"bbb", "audio/wav")}).json()

    assert again["id"] == first["id"]
    assert other["filename"] == "test_dupe (1).wav"
    with open(os.path.join(INPUT_DIR, "test_dupe.wav"), "rb") as f:
        assert f.read() == b"aaa"


def test_upload_size_limit(cleanup_inputs):
    with patch("routers.studio.STUDIO_MAX_FILE_SIZE_MB", 1):
        response = client.post(
            "/api/upload", files={"file": ("test_dupe_big.wav", b"0" * (2 * 1024 * 1024), "audio/wav")}
        )
    assert response.status_code == 413
    assert not os.path.exists(os.path.join(INPUT_DIR, "test_dupe_big.wav"))
    assert not any(n.startswith(".upload_") for n in os.listdir(INPUT_DIR))


def test_stretch_ignores_client_supplied_paths():
    response = client.post("/api/stretch", json={"file_path": "/etc/passwd"})
    assert response.status_code == 422

    with patch("httpx.AsyncClient.post") as worker_post:
        response = client.post("/api/stretch", json={"filename": "../../etc/passwd", "file_path": "/etc/passwd"})
    assert response.status_code == 404
    worker_post.assert_not_called()
