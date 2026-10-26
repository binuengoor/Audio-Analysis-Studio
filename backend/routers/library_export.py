from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from config import SHARED_DATA_DIR
from library import LibraryManager
from library_export import to_csv, to_json, to_rekordbox_xml
from models import LibraryEntry
from routers.studio import get_library
from utils import resolve_audio_file_path

router = APIRouter(tags=["Studio Library & Processing"])


def _locate(entry: LibraryEntry) -> Optional[str]:
    name = entry.output_path or entry.input_path
    return resolve_audio_file_path(name) if name else None


@router.get("/api/export/library")
def export_library(
    format: str = Query("csv", pattern="^(csv|json|rekordbox)$"),
    ids: Optional[str] = Query(None, description="Comma-separated library ids; default all"),
    path_prefix: Optional[str] = Query(None, description="Rekordbox only: folder where ./data lives on the DJ machine"),
    library: LibraryManager = Depends(get_library),
):
    """Exports analysed tracks as CSV, JSON or a Rekordbox XML collection."""
    entries: List[LibraryEntry] = library.get_all()
    if ids:
        wanted = {i.strip() for i in ids.split(",") if i.strip()}
        entries = [e for e in entries if e.id in wanted]
    entries = [e for e in entries if e.analysis]
    if not entries:
        raise HTTPException(status_code=404, detail="No analysed tracks to export")

    if format == "csv":
        body, media, ext = to_csv(entries), "text/csv", "csv"
    elif format == "json":
        body, media, ext = to_json(entries), "application/json", "json"
    else:
        body = to_rekordbox_xml(entries, _locate, SHARED_DATA_DIR, path_prefix)
        media, ext = "application/xml", "xml"
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="audio-analysis-library.{ext}"'},
    )
