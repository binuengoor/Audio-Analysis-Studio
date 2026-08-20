import sys
import os
from unittest.mock import MagicMock, patch
import pytest

# Add backend to path so we can import main
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app, INPUT_DIR, OUTPUT_DIR, DATA_DIR
from library import LibraryManager

client = TestClient(app)

# Mock file content
FAKE_AUDIO_CONTENT = b"fake audio content"

@pytest.fixture
def clean_upload_dir():
    # Setup: Ensure upload dir exists and is clean
    os.makedirs(INPUT_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Clean before test
    for f in os.listdir(INPUT_DIR):
        if f.startswith("test_"):
            try:
                os.remove(os.path.join(INPUT_DIR, f))
            except Exception:
                pass
            
    yield INPUT_DIR
    
    # Teardown: Cleanup created files
    if os.path.exists(INPUT_DIR):
        for f in os.listdir(INPUT_DIR):
            if f.startswith("test_"):
                try:
                    os.remove(os.path.join(INPUT_DIR, f))
                except Exception:
                    pass

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Audio Analysis Backend is running"}

def test_upload_file(clean_upload_dir):
    filename = "test_upload.mp3"
    response = client.post(
        "/api/upload",
        files={"file": (filename, FAKE_AUDIO_CONTENT, "audio/mpeg")}
    )
    assert response.status_code == 200
    assert response.json()["filename"] == filename
    assert os.path.exists(os.path.join(clean_upload_dir, filename))

@patch("processor.BatchProcessor.process_file")
def test_analyze_file(mock_process, clean_upload_dir):
    # Mock the processor response
    mock_process.return_value = {
        "filename": "test_analyze.mp3",
        "bpm": 120.0,
        "bpm_confidence": 0.9,
        "key_standard": "C Major",
        "key_camelot": "8B",
        "key_confidence": 0.8,
        "duration": 180.0,
        "chords": [{"start": 0.0, "end": 2.0, "chord": "C:maj"}]
    }
    
    filename = "test_analyze.mp3"
    # Create dummy file
    with open(os.path.join(clean_upload_dir, filename), "wb") as f:
        f.write(FAKE_AUDIO_CONTENT)

    response = client.post("/api/analyze", json={"filename": filename})
    assert response.status_code == 200
    data = response.json()
    assert data["bpm"] == 120.0
    assert data["key_camelot"] == "8B"
    assert "chords" in data

def test_queue_and_status():
    # Test adding to queue
    filenames = ["song1.mp3", "song2.mp3"]
    response = client.post("/api/queue", json={"filenames": filenames})
    assert response.status_code == 200
    
    # Test status
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert "queue_length" in data
    assert "is_processing" in data

def test_process_output_file(clean_upload_dir):
    filename = "test_process.mp3"
    # Create dummy file in input dir
    with open(os.path.join(clean_upload_dir, filename), "wb") as f:
        f.write(FAKE_AUDIO_CONTENT)
    
    # Add entry to main library
    from main import library
    entry = library.add_entry(filename)
        
    response = client.post("/api/process", json={
        "filename": filename,
        "pattern": "{Camelot} - {BPM} - {OriginalName}",
        "bpm": 128.0,
        "key": "C Major",
        "camelot": "8B"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert "output_filename" in data
