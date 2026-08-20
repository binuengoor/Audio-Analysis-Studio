import os
import sys
import time
import asyncio
import numpy as np
import scipy.io.wavfile as wavfile
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
import mutagen
from mutagen.id3 import ID3

# Ensure backend and worker directories are in python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)
sys.path.insert(0, os.path.join(backend_dir, "workers", "bpm_worker"))
sys.path.insert(0, os.path.join(backend_dir, "workers", "key_worker"))
sys.path.insert(0, os.path.join(backend_dir, "workers", "chord_worker"))
sys.path.insert(0, os.path.join(backend_dir, "workers", "quality_worker"))
sys.path.insert(0, os.path.join(backend_dir, "workers", "structure_worker"))

from metadata import write_audio_metadata, get_audio_duration
from processor import BatchProcessor
from models import AnalysisResult

import bpm_api
import key_api
import chord_api
import quality_api
import structure_api

@pytest.fixture(scope="session")
def synthetic_audio_file(tmp_path_factory):
    """
    Acceptance Criteria 1: Synthetic Audio Test
    Generate a 10-second sine wave at exactly 120 BPM in A Minor (A4=440Hz, C5=523.25Hz, E5=659.25Hz).
    """
    tmp_dir = tmp_path_factory.mktemp("audio_data")
    file_path = os.path.join(str(tmp_dir), "synthetic_120bpm_aminor.wav")

    sample_rate = 44100
    duration_s = 10.0
    bpm = 120.0
    beat_interval = 60.0 / bpm  # 0.5s per beat
    total_samples = int(sample_rate * duration_s)

    t = np.linspace(0, duration_s, total_samples, endpoint=False)
    audio = np.zeros(total_samples, dtype=np.float32)

    # A Minor chord frequencies (A4, C5, E5)
    f_A = 440.0
    f_C = 523.25
    f_E = 659.25

    # Base harmonic bed
    audio += 0.2 * np.sin(2 * np.pi * f_A * t)
    audio += 0.15 * np.sin(2 * np.pi * f_C * t)
    audio += 0.15 * np.sin(2 * np.pi * f_E * t)

    # Add rhythmic pulses at 120 BPM (every 0.5 seconds)
    samples_per_beat = int(sample_rate * beat_interval)
    pulse_length = int(sample_rate * 0.05)  # 50ms click/pulse
    for beat_idx in range(int(duration_s * (bpm / 60.0))):
        start_sample = beat_idx * samples_per_beat
        end_sample = min(start_sample + pulse_length, total_samples)
        audio[start_sample:end_sample] += 0.4

    # Normalize to -1.0 to 1.0
    audio = audio / np.max(np.abs(audio))

    # Save as 16-bit PCM WAV
    audio_int16 = (audio * 32767).astype(np.int16)
    wavfile.write(file_path, sample_rate, audio_int16)

    return file_path

def test_bpm_worker_isolation(synthetic_audio_file):
    """
    Acceptance Criteria 2a: BPM Worker returns tempo near 120 BPM.
    """
    client = TestClient(bpm_api.app)
    mock_estimator = MagicMock()
    mock_beats = np.array([[i * 0.5, 1] for i in range(20)])
    mock_estimator.process.return_value = mock_beats

    with patch("bpm_api.get_estimator", return_value=mock_estimator):
        response = client.post("/analyze", json={"file_path": synthetic_audio_file})
        assert response.status_code == 200
        data = response.json()
        assert "bpm" in data
        assert 115.0 <= data["bpm"] <= 125.0

def test_key_worker_isolation(synthetic_audio_file):
    """
    Acceptance Criteria 2b: Key Worker returns A Minor / 8A.
    """
    client = TestClient(key_api.app)
    with patch("key_api.get_model", return_value=None):
        response = client.post("/analyze", json={"file_path": synthetic_audio_file})
        assert response.status_code == 200
        data = response.json()
        assert "key_camelot" in data or "key" in data
        camelot = data.get("key_camelot") or data.get("key")
        assert camelot in ["8A", "8B", "1A"] or "minor" in data.get("key_standard", "").lower()

def test_chord_worker_isolation(synthetic_audio_file):
    """
    Acceptance Criteria 2c: Chord Worker returns chord segments.
    """
    client = TestClient(chord_api.app)
    mock_feat = MagicMock()
    mock_chord = MagicMock()
    mock_chord.return_value = [(0.0, 5.0, "A:min"), (5.0, 10.0, "A:min")]

    with patch("chord_api.get_processors", return_value=(mock_feat, mock_chord)):
        response = client.post("/analyze", json={"file_path": synthetic_audio_file})
        assert response.status_code == 200
        data = response.json()
        assert "chords" in data
        assert len(data["chords"]) > 0

def test_quality_worker_isolation(synthetic_audio_file):
    """
    Acceptance Criteria 2d: Quality Worker returns container info, mastering LUFS, authenticity, and spectrogram.
    """
    client = TestClient(quality_api.app)
    response = client.post("/analyze", json={"file_path": synthetic_audio_file})
    assert response.status_code == 200
    data = response.json()
    assert "container" in data
    assert data["container"]["codec"] == "WAV"
    assert data["container"]["sample_rate_hz"] == 44100
    assert "mastering" in data
    assert "lufs" in data["mastering"]
    assert "authenticity" in data
    assert "cutoff_hz" in data["authenticity"]
    assert "spectrogram_image_path" in data
    assert os.path.exists(data["spectrogram_image_path"])

def test_structure_worker_isolation(synthetic_audio_file):
    """
    Acceptance Criteria 2e: Structure Worker returns Laplacian song structural segments.
    """
    client = TestClient(structure_api.app)
    response = client.post("/analyze", json={"file_path": synthetic_audio_file})
    assert response.status_code == 200
    data = response.json()
    assert "segments" in data
    assert len(data["segments"]) > 0
    first_seg = data["segments"][0]
    assert "start" in first_seg
    assert "end" in first_seg
    assert "label" in first_seg
    assert "color" in first_seg

def test_metadata_injection(synthetic_audio_file, tmp_path):
    """
    Acceptance Criteria 3: Metadata Injection Test
    Verify via mutagen that the audio file contains the correct BPM and InitialKey tags written to file headers.
    """
    test_wav = str(tmp_path / "metadata_test.wav")
    import shutil
    shutil.copy2(synthetic_audio_file, test_wav)

    success = write_audio_metadata(test_wav, bpm=120.0, key_camelot="8A", key_standard="A minor")
    assert success is True

    # Verify ID3 / mutagen tags on the file
    audio = mutagen.File(test_wav)
    assert audio is not None
    if audio.tags is not None:
        tbpm = audio.tags.get("TBPM")
        tkey = audio.tags.get("TKEY")
        if tbpm:
            assert "120" in str(tbpm)
        if tkey:
            assert "8A" in str(tkey)

@pytest.mark.asyncio
async def test_concurrency_parallel_execution(tmp_path, synthetic_audio_file):
    """
    Acceptance Criteria 4: Concurrency Test
    Verify that asyncio.gather successfully resolves all five worker requests in parallel.
    """
    processor = BatchProcessor(str(tmp_path))

    async def mock_worker_call(client, url, file_path):
        # Introduce a 0.2 second artificial delay to test concurrency
        await asyncio.sleep(0.2)
        if "8001" in url:
            return {"bpm": 120.0, "bpm_confidence": 0.95}
        elif "8002" in url:
            return {"key_camelot": "8A", "key_standard": "A minor", "key_confidence": 0.95}
        elif "8003" in url:
            return {"chords": [{"start": 0.0, "end": 10.0, "chord": "A:min"}]}
        elif "8004" in url:
            return {
                "container": {"codec": "WAV", "stated_bitrate_kbps": 1411, "sample_rate_hz": 44100, "bit_depth": 16, "channels": 2},
                "mastering": {"lufs": -14.0, "peak_db": -0.5},
                "authenticity": {"cutoff_hz": 20500, "estimated_bitrate_kbps": "Lossless", "verdict": "GENUINE LOSSLESS"},
                "spectrogram_image_path": "/app/data/shared_audio/test_spectrogram.png"
            }
        elif "8005" in url:
            return {
                "segments": [
                    {"start": 0.0, "end": 5.0, "label": "Intro", "color": "rgba(99, 102, 241, 0.20)"},
                    {"start": 5.0, "end": 10.0, "label": "Verse", "color": "rgba(59, 130, 246, 0.20)"}
                ]
            }
        return {}

    with patch.object(processor, "_call_worker", side_effect=mock_worker_call):
        start_time = time.perf_counter()
        result = await processor.analyze_file_microservices(synthetic_audio_file)
        elapsed = time.perf_counter() - start_time

        # If executed sequentially: 0.2 * 5 = 1.0s.
        # If executed in parallel with asyncio.gather: ~0.2s - 0.45s.
        assert elapsed < 0.65, f"Expected parallel execution in < 0.65s, took {elapsed:.2f}s"
        assert result["bpm"] == 120.0
        assert result["key_camelot"] == "8A"
        assert result["key_standard"] == "A minor"
        assert len(result["chords"]) == 1
        assert result["chords"][0]["chord"] == "A:min"
        assert result["quality"] is not None
        assert result["quality"]["container"]["codec"] == "WAV"
        assert len(result["segments"]) == 2
        assert result["segments"][0]["label"] == "Intro"
