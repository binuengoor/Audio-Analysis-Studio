import sys
import os
import json
import tempfile
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from library import LibraryManager
from models import AnalysisResult

@pytest.fixture
def temp_library_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir

def test_sqlite_library_crud(temp_library_dir):
    lib = LibraryManager(temp_library_dir)
    
    # 1. Add entry
    entry = lib.add_entry("test_track.wav")
    assert entry.id is not None
    assert entry.filename == "test_track.wav"
    assert entry.status == "uploaded"
    
    # 2. Get entry
    fetched = lib.get_entry(entry.id)
    assert fetched is not None
    assert fetched.filename == "test_track.wav"
    
    # 3. Get entry by filename
    by_name = lib.get_entry_by_filename("test_track.wav")
    assert by_name is not None
    assert by_name.id == entry.id
    
    # 4. Update analysis
    analysis = AnalysisResult(
        filename="test_track.wav",
        bpm=128.0,
        bpm_confidence=0.98,
        key_standard="C major",
        key_camelot="8B",
        key_confidence=0.99,
        duration=180.5,
    )
    lib.update_analysis(entry.id, analysis)
    updated = lib.get_entry(entry.id)
    assert updated.status == "completed"
    assert updated.analysis is not None
    assert updated.analysis.bpm == 128.0
    assert updated.analysis.key_camelot == "8B"
    
    # 5. Set output
    lib.set_output(entry.id, "test_track_8B_128.wav")
    out_updated = lib.get_entry(entry.id)
    assert out_updated.output_path == "test_track_8B_128.wav"
    
    # 6. Get all
    all_entries = lib.get_all()
    assert len(all_entries) == 1
    assert all_entries[0].id == entry.id
    
    # 7. Delete input / output
    lib.delete_input(entry.id)
    after_input_del = lib.get_entry(entry.id)
    assert after_input_del.input_path is None
    assert after_input_del.output_path == "test_track_8B_128.wav"
    
    lib.delete_output(entry.id)
    # Both input and output deleted -> entry automatically pruned
    assert lib.get_entry(entry.id) is None

def test_legacy_json_migration(temp_library_dir):
    legacy_json_path = os.path.join(temp_library_dir, "library.json")
    mock_legacy_data = [
        {
            "id": "legacy-uuid-1",
            "filename": "old_track.flac",
            "input_path": "old_track.flac",
            "output_path": "old_track_12A_124.flac",
            "analysis": {
                "filename": "old_track.flac",
                "bpm": 124.0,
                "bpm_confidence": 0.9,
                "key_standard": "C# minor",
                "key_camelot": "12A",
                "key_confidence": 0.95,
                "duration": 200.0,
                "chords": [],
                "quality": None,
                "segments": []
            },
            "created_at": 1700000000.0,
            "status": "completed"
        }
    ]
    with open(legacy_json_path, "w", encoding="utf-8") as f:
        json.dump(mock_legacy_data, f)
        
    lib = LibraryManager(temp_library_dir)
    all_entries = lib.get_all()
    assert len(all_entries) == 1
    assert all_entries[0].id == "legacy-uuid-1"
    assert all_entries[0].filename == "old_track.flac"
    assert all_entries[0].analysis.key_camelot == "12A"
    assert all_entries[0].analysis.bpm == 124.0
