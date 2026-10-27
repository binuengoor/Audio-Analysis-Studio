"""Library export: CSV, JSON and Rekordbox XML (DJ_PLAYLISTS)."""
import csv
import io
import json
import os
import re
import urllib.parse
from typing import Callable, List, Optional
from xml.etree import ElementTree as ET

from models import LibraryEntry

CSV_COLUMNS = [
    "filename", "output_filename", "bpm", "key_camelot", "key_standard", "duration_seconds",
    "codec", "bit_depth", "sample_rate_hz", "lufs", "peak_db", "verdict", "manual_edits", "engine_errors", "rating", "tags", "notes",
]

_KEY_RE = re.compile(r"^([A-G][#b]?)\s+(major|minor)$", re.IGNORECASE)


def short_key(key_standard: Optional[str]) -> str:
    """'A minor' -> 'Am', 'C# minor' -> 'C#m', 'F major' -> 'F' (the notation Rekordbox writes in Tonality)."""
    m = _KEY_RE.match((key_standard or "").strip())
    if not m:
        return ""
    return m.group(1) + ("m" if m.group(2).lower() == "minor" else "")


def entry_to_row(entry: LibraryEntry) -> dict:
    a = entry.analysis
    q = a.quality if a else None
    return {
        "filename": entry.filename,
        "output_filename": entry.output_path or "",
        "bpm": a.bpm if a and a.bpm is not None else "",
        "key_camelot": (a.key_camelot or "") if a else "",
        "key_standard": (a.key_standard or "") if a else "",
        "duration_seconds": a.duration if a else "",
        "codec": q.container.codec if q else "",
        "bit_depth": q.container.bit_depth if q else "",
        "sample_rate_hz": q.container.sample_rate_hz if q else "",
        "lufs": q.mastering.lufs if q else "",
        "peak_db": q.mastering.peak_db if q else "",
        "verdict": q.authenticity.verdict if q else "",
        "manual_edits": ",".join(a.manual_overrides) if a else "",
        "engine_errors": ",".join(sorted(a.engine_errors)) if a else "",
        "rating": entry.rating or "",
        "tags": ",".join(entry.tags),
        "notes": entry.notes,
    }


def _csv_safe(value):
    """Neutralise spreadsheet formula injection from attacker-controlled filenames."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def to_csv(entries: List[LibraryEntry]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for entry in entries:
        writer.writerow({k: _csv_safe(v) for k, v in entry_to_row(entry).items()})
    return buf.getvalue()


def to_json(entries: List[LibraryEntry]) -> str:
    return json.dumps([e.model_dump() for e in entries], indent=2)


def to_rekordbox_xml(
    entries: List[LibraryEntry],
    locate: Callable[[LibraryEntry], Optional[str]],
    data_dir: str,
    path_prefix: Optional[str] = None,
) -> str:
    """
    Rekordbox `DJ_PLAYLISTS` collection with BPM and key per track.

    Tracks are stored under container paths (`data_dir`); pass `path_prefix` (the same folder as seen on the
    machine running Rekordbox, e.g. `/Users/me/Audio-Analysis-Studio/data`) so Location points at real files.
    No TEMPO (beat grid) nodes are written: only a tempo, not a downbeat offset, is detected, and a wrong
    grid is worse than none - let Rekordbox analyze the grid itself.
    """
    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    ET.SubElement(root, "PRODUCT", Name="Audio Analysis Studio", Version="1.0", Company="")
    tracks = []
    for entry in entries:
        path = locate(entry)
        if path:
            tracks.append((entry, path))

    collection = ET.SubElement(root, "COLLECTION", Entries=str(len(tracks)))
    for track_id, (entry, path) in enumerate(tracks, start=1):
        a = entry.analysis
        if path_prefix:
            rel = os.path.relpath(path, data_dir)
            path = os.path.join(path_prefix, rel)
        posix_path = path.replace("\\", "/")
        if not posix_path.startswith("/"):  # Windows drive path -> /C:/...
            posix_path = "/" + posix_path
        attrs = {
            "TrackID": str(track_id),
            "Name": os.path.splitext(os.path.basename(path))[0],
            "Location": "file://localhost" + urllib.parse.quote(posix_path, safe="/:"),
        }
        if a:
            if a.duration:
                attrs["TotalTime"] = str(int(round(a.duration)))
            if a.bpm is not None:
                attrs["AverageBpm"] = f"{a.bpm:.2f}"
            key = short_key(a.key_standard)
            if key:
                attrs["Tonality"] = key
        if entry.tags:
            attrs["Comments"] = " ".join(f"#{t.replace(' ', '_')}" for t in entry.tags)[:250]
        ET.SubElement(collection, "TRACK", attrs)

    playlists = ET.SubElement(root, "PLAYLISTS")
    top = ET.SubElement(playlists, "NODE", Type="0", Name="ROOT", Count="1")
    folder = ET.SubElement(top, "NODE", Name="Audio Analysis Studio", Type="1", KeyType="0", Entries=str(len(tracks)))
    for track_id in range(1, len(tracks) + 1):
        ET.SubElement(folder, "TRACK", Key=str(track_id))

    ET.indent(root)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")
