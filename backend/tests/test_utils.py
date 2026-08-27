import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils import sanitize_filename

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
