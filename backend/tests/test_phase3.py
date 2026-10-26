import csv
import io
import os
import sys
import tempfile
import time
from xml.etree import ElementTree as ET

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from library import LibraryManager
from library_export import short_key, to_csv, to_rekordbox_xml
from main import app, INPUT_DIR
from models import AnalysisResult
from watcher import scan_watch_folder

client = TestClient(app)


@pytest.fixture
def lib():
    with tempfile.TemporaryDirectory() as d:
        yield LibraryManager(d)


def _analysed(lib, name, **kw):
    e = lib.add_entry(name)
    lib.update_analysis(e.id, AnalysisResult(filename=name, **kw))
    return lib.get_entry(e.id)


def test_short_key():
    assert short_key("A minor") == "Am"
    assert short_key("C# minor") == "C#m"
    assert short_key("F major") == "F"
    assert short_key("Db major") == "Db"
    assert short_key(None) == "" and short_key("nonsense") == ""


def test_csv_export_neutralises_formula_injection_and_blanks_failed_engines(lib):
    ok = _analysed(lib, "=HYPERLINK(\"x\").mp3", bpm=124.0, key_camelot="8A", key_standard="A minor", duration=60)
    bad = _analysed(lib, "bad.mp3", engine_errors={"bpm": "x"})
    rows = list(csv.DictReader(io.StringIO(to_csv([ok, bad]))))
    assert rows[0]["filename"].startswith("'=")
    assert rows[0]["bpm"] == "124.0" and rows[0]["key_camelot"] == "8A"
    assert rows[1]["bpm"] == "" and rows[1]["key_camelot"] == "" and rows[1]["engine_errors"] == "bpm"


def test_rekordbox_xml_structure_and_path_rewrite(lib):
    a = _analysed(lib, "My Song.mp3", bpm=124.04, key_camelot="8A", key_standard="A minor", duration=213.4)
    b = _analysed(lib, "missing.mp3", bpm=100.0)
    paths = {a.id: "/app/data/shared_audio/input/My Song.mp3", b.id: None}
    xml = to_rekordbox_xml([a, b], lambda e: paths[e.id], "/app/data/shared_audio", "/Users/dj/data")
    root = ET.fromstring(xml)
    assert root.tag == "DJ_PLAYLISTS"
    coll = root.find("COLLECTION")
    assert coll.get("Entries") == "1"  # tracks without a file are skipped, not exported with bad paths
    t = coll.find("TRACK")
    assert t.get("AverageBpm") == "124.04" and t.get("Tonality") == "Am" and t.get("TotalTime") == "213"
    assert t.get("Location") == "file://localhost/Users/dj/data/input/My%20Song.mp3"
    assert t.find("TEMPO") is None  # no guessed beat grid
    assert root.find("PLAYLISTS/NODE/NODE/TRACK").get("Key") == "1"


def test_export_endpoint(monkeypatch):
    from routers.studio import get_library
    library = get_library()
    entry = library.add_entry("test_export.wav")
    library.update_analysis(entry.id, AnalysisResult(filename="test_export.wav", bpm=128.0, key_camelot="9A", key_standard="E minor"))
    try:
        res = client.get(f"/api/export/library?format=csv&ids={entry.id}")
        assert res.status_code == 200 and "test_export.wav" in res.text
        assert "attachment" in res.headers["content-disposition"]
        assert client.get(f"/api/export/library?format=json&ids={entry.id}").json()[0]["analysis"]["bpm"] == 128.0
        assert client.get("/api/export/library?format=xls").status_code == 422
        assert client.get("/api/export/library?format=csv&ids=nope").status_code == 404
        monkeypatch.setenv("API_KEY", "k")
        assert client.get("/api/export/library?format=csv").status_code == 401
        assert client.get("/api/export/library?format=csv&ids=" + entry.id + "&api_key=k").status_code == 200
    finally:
        library.delete_entry(entry.id)


def test_duplicate_detection_groups_identical_files_only(lib, tmp_path):
    files = {"a.wav": b"same", "b.wav": b"same", "c.wav": b"different"}
    entries = {}
    for name, data in files.items():
        (tmp_path / name).write_bytes(data)
        entries[name] = lib.add_entry(name)
    groups = lib.find_duplicate_groups(lambda e: str(tmp_path / e.filename))
    assert [sorted(x.filename for x in g) for g in groups] == [["a.wav", "b.wav"]]
    # hashes are cached: works again even if files vanish
    for name in files:
        os.remove(tmp_path / name)
    assert len(lib.find_duplicate_groups(lambda e: None)) == 1


def test_upload_records_hash_for_duplicates_endpoint():
    names = []
    try:
        for n in ("test_dup1.wav", "test_dup2.wav"):
            r = client.post("/api/upload", files={"file": (n, b"identical-bytes", "audio/wav")})
            names.append(r.json())
        groups = client.get("/api/library/duplicates").json()
        flat = [sorted(e["filename"] for e in g) for g in groups]
        assert any("test_dup1.wav" in g and "test_dup2.wav" in g for g in flat)
    finally:
        from routers.studio import get_library
        for entry in names:
            get_library().delete_entry(entry["id"])
            p = os.path.join(INPUT_DIR, entry["filename"])
            if os.path.exists(p):
                os.remove(p)


def test_legacy_database_gets_hash_column(tmp_path):
    import sqlite3
    db = tmp_path / "library.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE library (id TEXT PRIMARY KEY, filename TEXT NOT NULL, input_path TEXT, output_path TEXT, analysis_json TEXT, created_at REAL NOT NULL, status TEXT NOT NULL);")
    conn.execute("INSERT INTO library VALUES ('1','old.wav','old.wav',NULL,NULL,1.0,'uploaded');")
    conn.commit(); conn.close()
    lib = LibraryManager(str(tmp_path))
    assert lib.get_entry("1").filename == "old.wav"
    lib.set_content_hash("1", "abc")


def test_watch_folder_ingests_settled_audio_once(lib, tmp_path):
    watch, inp = tmp_path / "watch", tmp_path / "input"
    (watch / "sub").mkdir(parents=True)
    inp.mkdir()
    (watch / "song.mp3").write_bytes(b"audio")
    (watch / "sub" / "deep.flac").write_bytes(b"flac")
    (watch / "notes.txt").write_text("ignore me")
    (watch / "fresh.wav").write_bytes(b"still copying")
    old = time.time() - 60
    for p in (watch / "song.mp3", watch / "sub" / "deep.flac", watch / "notes.txt"):
        os.utime(p, (old, old))

    queued = []
    done = scan_watch_folder(lib, queued.append, str(watch), str(inp))
    assert sorted(done) == ["deep.flac", "song.mp3"] and sorted(queued) == sorted(done)
    assert (inp / "song.mp3").exists() and not (watch / "song.mp3").exists()
    assert (watch / "notes.txt").exists() and (watch / "fresh.wav").exists()  # non-audio / unsettled untouched
    assert lib.get_entry_by_filename("song.mp3") is not None

    # same content dropped again is discarded, not re-queued
    (watch / "song.mp3").write_bytes(b"audio")
    os.utime(watch / "song.mp3", (old, old))
    assert scan_watch_folder(lib, queued.append, str(watch), str(inp)) == []
    assert not (watch / "song.mp3").exists()
