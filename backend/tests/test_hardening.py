import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "workers", "downloader_worker"))

from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app, INPUT_DIR
from processor import BatchProcessor, WORKER_ERROR_KEY
from utils import unique_upload_name

client = TestClient(app)


@pytest.fixture
def api_key(monkeypatch):
    monkeypatch.setenv("API_KEY", "secret")
    yield "secret"


def test_failed_engines_report_errors_instead_of_fake_values(tmp_path):
    audio = tmp_path / "t.wav"
    audio.write_bytes(b"x")
    proc = BatchProcessor(str(tmp_path))

    async def fake_call(client_, url, path):
        if "8001" in url:
            return {WORKER_ERROR_KEY: "boom"}
        if "8002" in url:
            return {"key_standard": "C major", "key_camelot": "8B", "key_confidence": 0.8}
        return {}

    with patch.object(BatchProcessor, "_call_worker", side_effect=fake_call), \
         patch("processor.write_audio_metadata") as tag, \
         patch("processor.get_audio_duration", return_value=1.0):
        result = asyncio.run(proc.analyze_file_microservices(str(audio), "t.wav"))

    assert result["bpm"] is None and result["bpm_confidence"] is None
    assert result["key_camelot"] == "8B"
    assert list(result["engine_errors"]) == ["bpm"]
    # only the real key is tagged, never an invented BPM
    assert tag.call_args.args[1] == 0.0 and tag.call_args.args[2] == "8B"


def test_both_engines_failed_skips_tagging(tmp_path):
    audio = tmp_path / "t.wav"
    audio.write_bytes(b"x")
    proc = BatchProcessor(str(tmp_path))
    with patch.object(BatchProcessor, "_call_worker", new=AsyncMock(return_value={WORKER_ERROR_KEY: "down"})), \
         patch("processor.write_audio_metadata") as tag, \
         patch("processor.get_audio_duration", return_value=1.0):
        result = asyncio.run(proc.analyze_file_microservices(str(audio), "t.wav"))
    assert result["bpm"] is None and result["key_camelot"] is None
    tag.assert_not_called()


def test_single_engine_failure_is_502():
    with patch.object(BatchProcessor, "_call_worker", new=AsyncMock(return_value={WORKER_ERROR_KEY: "down"})):
        res = client.post("/api/v1/analyze/bpm", files={"file": ("a.wav", b"data", "audio/wav")})
    assert res.status_code == 502
    assert res.json()["engine"] == "bpm"


def test_studio_routes_require_key_when_configured(api_key):
    assert client.get("/api/library").status_code == 401
    assert client.get("/api/library", headers={"X-API-Key": api_key}).status_code == 200
    assert client.delete("/api/library").status_code == 401
    assert client.post("/api/downloader/update").status_code == 401
    # health stays open for the status badge / container healthchecks
    assert client.get("/api/health/services").status_code != 401


def test_media_files_require_key_via_header_or_query(api_key):
    name = "test_media_guard.wav"
    path = os.path.join(INPUT_DIR, name)
    with open(path, "wb") as f:
        f.write(b"RIFF")
    try:
        assert client.get(f"/files/input/{name}").status_code == 401
        assert client.get(f"/files/input/{name}?api_key=wrong").status_code == 401
        assert client.get(f"/files/input/{name}?api_key={api_key}").status_code == 200
        assert client.get(f"/files/input/{name}", headers={"X-API-Key": api_key}).status_code == 200
    finally:
        os.remove(path)


def test_upload_rejects_oversize(monkeypatch):
    monkeypatch.setattr("routers.studio.MAX_FILE_SIZE_MB", 0)
    res = client.post("/api/upload", files={"file": ("test_big.wav", b"abc", "audio/wav")})
    assert res.status_code == 413
    assert not [f for f in os.listdir(INPUT_DIR) if f.startswith(".upload_")]


def test_upload_same_name_different_content_does_not_overwrite():
    names = []
    try:
        for content in (b"first", b"second", b"first"):
            res = client.post("/api/upload", files={"file": ("test_collide.wav", content, "audio/wav")})
            assert res.status_code == 200
            names.append(res.json()["filename"])
        assert names[0] == "test_collide.wav"
        assert names[1] != names[0]
        assert names[2] == names[0]  # identical content is deduplicated
        assert open(os.path.join(INPUT_DIR, names[0]), "rb").read() == b"first"
    finally:
        for n in set(names):
            p = os.path.join(INPUT_DIR, n)
            if os.path.exists(p):
                os.remove(p)


def test_unique_upload_name_free_name(tmp_path):
    assert unique_upload_name(str(tmp_path), "a.wav", "abc") == "a.wav"


@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "ftp://example.com/a.mp3",
    "http://127.0.0.1:6379/",
    "http://localhost/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/a.mp3",
    "http://redis:6379/",
])
def test_ssrf_guard_rejects_internal_targets(url):
    import downloader_api
    with pytest.raises(HTTPException) as exc:
        downloader_api.assert_public_url(url)
    assert exc.value.status_code == 400


def test_ssrf_guard_allows_private_when_opted_in(monkeypatch):
    import downloader_api
    monkeypatch.setattr(downloader_api, "ALLOW_PRIVATE_URLS", True)
    downloader_api.assert_public_url("http://192.168.1.10/a.mp3")


def _seed_entry(name):
    from routers.studio import get_library
    from models import AnalysisResult
    lib = get_library()
    entry = lib.add_entry(name)
    lib.update_analysis(entry.id, AnalysisResult(filename=name, bpm=70.0, key_camelot="8A", key_standard="A minor",
                                                 engine_errors={"bpm": "x"}))
    return lib, entry


def test_manual_override_is_validated_persisted_and_survives_reanalysis():
    from models import AnalysisResult
    lib, entry = _seed_entry("test_override.wav")
    try:
        assert client.patch(f"/api/library/{entry.id}/analysis", json={}).status_code == 400
        assert client.patch(f"/api/library/{entry.id}/analysis", json={"bpm": 5}).status_code == 422
        assert client.patch(f"/api/library/{entry.id}/analysis", json={"key_camelot": "13A"}).status_code == 422
        assert client.patch("/api/library/nope/analysis", json={"bpm": 100}).status_code == 404

        res = client.patch(f"/api/library/{entry.id}/analysis",
                           json={"bpm": 140, "key_camelot": "9B", "key_standard": "G major"})
        assert res.status_code == 200
        a = res.json()["analysis"]
        assert a["bpm"] == 140 and a["key_camelot"] == "9B" and a["manual_overrides"] == ["bpm", "key"]
        assert a["engine_errors"] == {}

        # editing again replaces the earlier correction
        again = client.patch(f"/api/library/{entry.id}/analysis", json={"bpm": 150}).json()["analysis"]
        assert again["bpm"] == 150 and again["key_camelot"] == "9B"

        # a fresh engine run must not clobber the correction
        lib.update_analysis(entry.id, AnalysisResult(filename=entry.filename, bpm=70.0, key_camelot="8A",
                                                     key_standard="A minor", chords=[]))
        kept = lib.get_entry(entry.id).analysis
        assert kept.bpm == 150 and kept.key_camelot == "9B" and kept.manual_overrides == ["bpm", "key"]
    finally:
        lib.delete_entry(entry.id) if hasattr(lib, "delete_entry") else None
