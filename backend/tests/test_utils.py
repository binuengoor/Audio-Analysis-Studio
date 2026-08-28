import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils import sanitize_filename, resolve_audio_file_path

def test_sanitize_filename_normal():
    assert sanitize_filename("song_track.wav") == "song_track.wav"
    assert sanitize_filename("My Favorite Song (Remix) [feat. Artist].mp3") == "My Favorite Song (Remix) [feat. Artist].mp3"

def test_sanitize_filename_path_traversal():
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("..\\..\\windows\\system32\\calc.exe") == "calc.exe"
    assert sanitize_filename("/var/data/shared/secret.flac") == "secret.flac"
    assert sanitize_filename("../../../malicious.mp3") == "malicious.mp3"

def test_sanitize_filename_dangerous_characters():
    assert sanitize_filename('bad:name*with?illegal<chars>.wav') == "bad_name_with_illegal_chars_.wav"
    assert sanitize_filename("null\x00byte.mp3") == "nullbyte.mp3"

def test_sanitize_filename_empty_or_dots():
    assert sanitize_filename("") == "upload.wav"
    assert sanitize_filename("...") == "upload.wav"
    assert sanitize_filename("   ") == "upload.wav"

def test_resolve_audio_file_path(tmp_path):
    in_dir = tmp_path / "input"
    out_dir = tmp_path / "output"
    in_dir.mkdir()
    out_dir.mkdir()

    # Create dummy files
    in_file = in_dir / "input_track.mp3"
    in_file.write_text("audio content")
    out_file = out_dir / "stretched_track.wav"
    out_file.write_text("stretched audio content")

    # Verify resolution in input
    assert resolve_audio_file_path("input_track.mp3", input_dir=str(in_dir), output_dir=str(out_dir)) == str(in_file)
    # Verify resolution in output
    assert resolve_audio_file_path("stretched_track.wav", input_dir=str(in_dir), output_dir=str(out_dir)) == str(out_file)
    # Verify non-existent file
    assert resolve_audio_file_path("non_existent.wav", input_dir=str(in_dir), output_dir=str(out_dir)) is None

