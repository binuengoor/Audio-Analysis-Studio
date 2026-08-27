import os
import sys
from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from fastapi.testclient import TestClient

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from main import app, INPUT_DIR

client = TestClient(app)

FAKE_WAV_BYTES = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    """Ensure clean auth environment variables before each test."""
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("API_KEYS", raising=False)


# --- 1. Authentication Tests ---

def test_auth_open_mode_when_no_api_key_set():
    """When no API key is configured in the environment, requests proceed without auth headers."""
    with patch("processor.BatchProcessor.analyze_bpm_only", new_callable=AsyncMock) as mock_bpm:
        mock_bpm.return_value = {"filename": "test.wav", "bpm": 120.0, "bpm_confidence": 0.9}
        response = client.post(
            "/api/v1/analyze/bpm",
            files={"file": ("test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert response.status_code == 200
        assert response.json()["bpm"] == 120.0


def test_auth_enforced_when_api_key_set(monkeypatch):
    """When API_KEY is set, requests without valid header must fail with 401."""
    monkeypatch.setenv("API_KEY", "prod_secret_key_123")

    with patch("processor.BatchProcessor.analyze_bpm_only", new_callable=AsyncMock) as mock_bpm:
        mock_bpm.return_value = {"filename": "test.wav", "bpm": 120.0, "bpm_confidence": 0.9}

        # 1. Missing header -> 401
        res_missing = client.post(
            "/api/v1/analyze/bpm",
            files={"file": ("test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res_missing.status_code == 401
        assert "API Key required" in res_missing.json()["detail"]

        # 2. Wrong header -> 401
        res_wrong = client.post(
            "/api/v1/analyze/bpm",
            headers={"X-API-Key": "wrong_key"},
            files={"file": ("test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res_wrong.status_code == 401
        assert "Invalid API Key" in res_wrong.json()["detail"]

        # 3. Valid X-API-Key -> 200
        res_valid = client.post(
            "/api/v1/analyze/bpm",
            headers={"X-API-Key": "prod_secret_key_123"},
            files={"file": ("test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res_valid.status_code == 200
        assert res_valid.json()["bpm"] == 120.0

        # 4. Valid Authorization Bearer header -> 200
        res_bearer = client.post(
            "/api/v1/analyze/bpm",
            headers={"Authorization": "Bearer prod_secret_key_123"},
            files={"file": ("test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res_bearer.status_code == 200
        assert res_bearer.json()["bpm"] == 120.0


def test_auth_multi_keys(monkeypatch):
    """When API_KEYS contains multiple comma-separated keys, any matching key is accepted."""
    monkeypatch.setenv("API_KEYS", "key_alpha, key_beta, key_gamma")

    with patch("processor.BatchProcessor.analyze_bpm_only", new_callable=AsyncMock) as mock_bpm:
        mock_bpm.return_value = {"filename": "test.wav", "bpm": 128.0, "bpm_confidence": 0.95}

        # Key Beta
        res_beta = client.post(
            "/api/v1/analyze/bpm",
            headers={"X-API-Key": "key_beta"},
            files={"file": ("test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res_beta.status_code == 200

        # Key Gamma
        res_gamma = client.post(
            "/api/v1/analyze/bpm",
            headers={"X-API-Key": "key_gamma"},
            files={"file": ("test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res_gamma.status_code == 200


# --- 2. Granular Analysis Endpoint Tests ---

def test_analyze_basic_endpoint():
    with patch("processor.BatchProcessor.analyze_basic", new_callable=AsyncMock) as mock_basic:
        mock_basic.return_value = {
            "filename": "track.mp3",
            "bpm": 124.0,
            "bpm_confidence": 0.95,
            "key_standard": "C major",
            "key_camelot": "8B",
            "key_confidence": 0.92,
            "duration_seconds": 210.5
        }
        res = client.post(
            "/api/v1/analyze/basic",
            files={"file": ("track.mp3", FAKE_WAV_BYTES, "audio/mpeg")}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["filename"] == "track.mp3"
        assert data["bpm"] == 124.0
        assert data["key_standard"] == "C major"
        assert data["key_camelot"] == "8B"
        assert data["duration_seconds"] == 210.5


def test_analyze_key_endpoint():
    with patch("processor.BatchProcessor.analyze_key_only", new_callable=AsyncMock) as mock_key:
        mock_key.return_value = {
            "filename": "solo.wav",
            "key_standard": "G minor",
            "key_camelot": "6A",
            "key_confidence": 0.94
        }
        res = client.post(
            "/api/v1/analyze/key",
            files={"file": ("solo.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["key_standard"] == "G minor"
        assert data["key_camelot"] == "6A"


def test_analyze_structure_endpoint():
    with patch("processor.BatchProcessor.analyze_structure_only", new_callable=AsyncMock) as mock_struct:
        mock_struct.return_value = {
            "filename": "structure_test.wav",
            "duration_seconds": 180.0,
            "segments": [
                {"start": 0.0, "end": 15.0, "label": "Intro", "color": "rgba(99, 102, 241, 0.20)"},
                {"start": 15.0, "end": 45.0, "label": "Verse 1", "color": "rgba(59, 130, 246, 0.20)"}
            ]
        }
        res = client.post(
            "/api/v1/analyze/structure",
            files={"file": ("structure_test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["segments"]) == 2
        assert data["segments"][0]["label"] == "Intro"


def test_analyze_chords_endpoint():
    with patch("processor.BatchProcessor.analyze_chords_only", new_callable=AsyncMock) as mock_chords:
        mock_chords.return_value = {
            "filename": "chords_test.wav",
            "duration_seconds": 120.0,
            "chords": [
                {"start": 0.0, "end": 4.0, "chord": "C:maj"},
                {"start": 4.0, "end": 8.0, "chord": "G:maj"}
            ]
        }
        res = client.post(
            "/api/v1/analyze/chords",
            files={"file": ("chords_test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["chords"]) == 2
        assert data["chords"][0]["chord"] == "C:maj"


def test_analyze_quality_endpoint():
    with patch("processor.BatchProcessor.analyze_quality_only", new_callable=AsyncMock) as mock_qual:
        mock_qual.return_value = {
            "filename": "lossless_test.flac",
            "container": {
                "codec": "FLAC",
                "stated_bitrate_kbps": 1411,
                "sample_rate_hz": 44100,
                "bit_depth": 16,
                "channels": 2
            },
            "mastering": {
                "lufs": -14.2,
                "peak_db": -0.5
            },
            "authenticity": {
                "cutoff_hz": 20500,
                "estimated_bitrate_kbps": "Lossless",
                "verdict": "GENUINE LOSSLESS"
            }
        }
        res = client.post(
            "/api/v1/analyze/quality",
            files={"file": ("lossless_test.flac", FAKE_WAV_BYTES, "audio/flac")}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["container"]["codec"] == "FLAC"
        assert data["mastering"]["lufs"] == -14.2
        assert data["authenticity"]["verdict"] == "GENUINE LOSSLESS"
        assert "spectrogram_image_path" not in data  # Pure JSON, no image artifact


def test_analyze_full_endpoint():
    with patch("processor.BatchProcessor.analyze_full", new_callable=AsyncMock) as mock_full:
        mock_full.return_value = {
            "filename": "full_test.wav",
            "bpm": 128.0,
            "bpm_confidence": 0.98,
            "key_standard": "A minor",
            "key_camelot": "8A",
            "key_confidence": 0.95,
            "duration_seconds": 195.4,
            "chords": [{"start": 0.0, "end": 4.0, "chord": "A:min"}],
            "quality": {
                "container": {"codec": "WAV", "stated_bitrate_kbps": 1411, "sample_rate_hz": 44100, "bit_depth": 16, "channels": 2},
                "mastering": {"lufs": -12.5, "peak_db": -0.1},
                "authenticity": {"cutoff_hz": 22050, "estimated_bitrate_kbps": "Lossless", "verdict": "GENUINE LOSSLESS"}
            },
            "segments": [{"start": 0.0, "end": 10.0, "label": "Intro", "color": "rgba(99, 102, 241, 0.20)"}]
        }
        res = client.post(
            "/api/v1/analyze/full",
            files={"file": ("full_test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["bpm"] == 128.0
        assert data["key_standard"] == "A minor"
        assert len(data["chords"]) == 1
        assert len(data["segments"]) == 1
        assert data["quality"]["container"]["codec"] == "WAV"


# --- 3. Temp File Cleanup Test ---

def test_temp_file_cleanup_after_request():
    """Verify that any uploaded temporary files prefixed with api_temp_ are cleaned up."""
    with patch("processor.BatchProcessor.analyze_bpm_only", new_callable=AsyncMock) as mock_bpm:
        mock_bpm.return_value = {"filename": "cleanup_test.wav", "bpm": 120.0, "bpm_confidence": 0.9}

        res = client.post(
            "/api/v1/analyze/bpm",
            files={"file": ("cleanup_test.wav", FAKE_WAV_BYTES, "audio/wav")}
        )
        assert res.status_code == 200

        # Verify no api_temp_ files remain in INPUT_DIR
        remaining_temp_files = [f for f in os.listdir(INPUT_DIR) if f.startswith("api_temp_")]
        assert len(remaining_temp_files) == 0


# --- 4. Downloader Stream & Info Endpoint Tests ---

def test_download_info_endpoint():
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "title": "Mock Track Title",
            "uploader": "Mock Channel",
            "duration": 180.0,
            "thumbnail": "https://img.youtube.com/vi/test/0.jpg",
            "source_url": "https://www.youtube.com/watch?v=123",
            "extractor": "youtube"
        }
        mock_post.return_value = mock_resp

        res = client.post(
            "/api/v1/download/info",
            json={"url": "https://www.youtube.com/watch?v=123"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["title"] == "Mock Track Title"
        assert data["duration"] == 180.0
        assert data["extractor"] == "youtube"


def test_download_stream_endpoint(tmp_path):
    test_flac_file = tmp_path / "mock_stream.flac"
    test_flac_file.write_bytes(FAKE_WAV_BYTES)

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "success": True,
            "filename": "mock_stream.flac",
            "file_path": str(test_flac_file),
            "title": "Mock Stream Title",
            "uploader": "Artist Name",
            "duration": 150.0,
            "extractor": "youtube",
            "audio_format": "flac"
        }
        mock_post.return_value = mock_resp

        res = client.post(
            "/api/v1/download/stream",
            json={"url": "https://www.youtube.com/watch?v=123", "audio_format": "flac"}
        )
        assert res.status_code == 200
        assert res.headers["content-type"] == "audio/flac"
        assert "X-Track-Title" in res.headers
        assert res.headers["X-Track-Duration"] == "150.0"
        assert len(res.content) == len(FAKE_WAV_BYTES)


def test_stretch_v1_endpoint():
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "success": True,
            "output_file_path": "/app/data/shared_audio/output/api_stretch_test.wav",
            "output_filename": "api_stretch_test.wav",
            "duration": 140.5,
            "pitch_semitones": 2.0,
            "tempo_ratio": 1.2,
            "target_bpm": 144.0,
            "engine": "Rubber Band Library v4.0"
        }
        mock_post.return_value = mock_resp

        res = client.post(
            "/api/v1/stretch",
            files={"file": ("input_test.wav", FAKE_WAV_BYTES, "audio/wav")},
            data={
                "pitch_semitones": 2.0,
                "tempo_ratio": 1.2,
                "target_bpm": 144.0,
                "original_bpm": 120.0,
                "preserve_formants": "true",
                "output_format": "wav"
            }
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["output_filename"] == "api_stretch_test.wav"
        assert data["pitch_semitones"] == 2.0
        assert data["tempo_ratio"] == 1.2
        assert data["target_bpm"] == 144.0
        assert "output_url" in data

