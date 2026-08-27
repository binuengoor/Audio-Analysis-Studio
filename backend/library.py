import json
import os
import sqlite3
import time
import uuid
from typing import List, Optional
from models import LibraryEntry, AnalysisResult
from config import logger

class LibraryManager:
    """
    ACID-compliant, thread-safe, and process-safe SQLite database manager
    for the Audio Analysis Studio library.
    Replaces the legacy single-file library.json with WAL-enabled SQLite.
    """
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.db_path = os.path.join(data_dir, "library.db")
        self.legacy_json_path = os.path.join(data_dir, "library.json")
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for high-concurrency readers and writers
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        return conn

    def _init_db(self):
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            with self._get_connection() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS library (
                        id TEXT PRIMARY KEY,
                        filename TEXT NOT NULL,
                        input_path TEXT,
                        output_path TEXT,
                        analysis_json TEXT,
                        created_at REAL NOT NULL,
                        status TEXT NOT NULL
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_library_filename ON library(filename);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_library_created ON library(created_at DESC);")
                conn.commit()

            # Automatic migration from legacy library.json if present
            self._migrate_legacy_json()
        except Exception as e:
            logger.error("Failed to initialize SQLite database at %s: %s", self.db_path, e, exc_info=True)

    def _migrate_legacy_json(self):
        if not os.path.exists(self.legacy_json_path):
            return

        try:
            with self._get_connection() as conn:
                cursor = conn.execute("SELECT COUNT(*) as count FROM library;")
                row = cursor.fetchone()
                if row and row["count"] > 0:
                    return  # Already migrated

                with open(self.legacy_json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                if isinstance(data, list):
                    for item in data:
                        entry = LibraryEntry(**item)
                        analysis_str = (
                            entry.analysis.model_dump_json()
                            if hasattr(entry.analysis, "model_dump_json")
                            else (json.dumps(entry.analysis.dict()) if entry.analysis else None)
                        ) if entry.analysis else None

                        conn.execute(
                            """
                            INSERT OR REPLACE INTO library (id, filename, input_path, output_path, analysis_json, created_at, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?);
                            """,
                            (
                                entry.id,
                                entry.filename,
                                entry.input_path,
                                entry.output_path,
                                analysis_str,
                                entry.created_at,
                                entry.status,
                            ),
                        )
                    conn.commit()
                    logger.info("Successfully migrated %d entries from library.json to SQLite database.", len(data))
        except Exception as e:
            logger.warning("Legacy JSON migration skipped or failed: %s", e)

    def _row_to_entry(self, row: sqlite3.Row) -> LibraryEntry:
        analysis_data = None
        if row["analysis_json"]:
            try:
                parsed = json.loads(row["analysis_json"])
                analysis_data = AnalysisResult(**parsed)
            except Exception as e:
                logger.warning("Failed to deserialize analysis JSON for entry %s: %s", row["id"], e)

        return LibraryEntry(
            id=row["id"],
            filename=row["filename"],
            input_path=row["input_path"],
            output_path=row["output_path"],
            analysis=analysis_data,
            created_at=row["created_at"],
            status=row["status"],
        )

    def load(self):
        """Maintained for backward compatibility; queries execute against SQLite dynamically."""
        pass

    def save(self):
        """Maintained for backward compatibility; SQLite auto-commits on mutation."""
        pass

    def add_entry(self, filename: str) -> LibraryEntry:
        entry = LibraryEntry(
            id=str(uuid.uuid4()),
            filename=filename,
            input_path=filename,
            created_at=time.time(),
            status="uploaded",
        )
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO library (id, filename, input_path, output_path, analysis_json, created_at, status)
                VALUES (?, ?, ?, ?, NULL, ?, ?);
                """,
                (entry.id, entry.filename, entry.input_path, None, entry.created_at, entry.status),
            )
            conn.commit()
        return entry

    def get_entry(self, id: str) -> Optional[LibraryEntry]:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM library WHERE id = ?;", (id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_entry(row)
        return None

    def get_entry_by_filename(self, filename: str) -> Optional[LibraryEntry]:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM library WHERE filename = ? ORDER BY created_at DESC LIMIT 1;", (filename,))
            row = cursor.fetchone()
            if row:
                return self._row_to_entry(row)
        return None

    def update_analysis(self, id: str, result: AnalysisResult):
        analysis_str = (
            result.model_dump_json()
            if hasattr(result, "model_dump_json")
            else json.dumps(result.dict())
        )
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE library 
                SET analysis_json = ?, status = 'completed'
                WHERE id = ?;
                """,
                (analysis_str, id),
            )
            conn.commit()

    def set_output(self, id: str, output_filename: str):
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE library
                SET output_path = ?
                WHERE id = ?;
                """,
                (output_filename, id),
            )
            conn.commit()

    def delete_input(self, id: str):
        with self._get_connection() as conn:
            conn.execute("UPDATE library SET input_path = NULL WHERE id = ?;", (id,))
            # If both input and output are gone, clean up entry
            conn.execute("DELETE FROM library WHERE id = ? AND input_path IS NULL AND output_path IS NULL;", (id,))
            conn.commit()

    def delete_output(self, id: str):
        with self._get_connection() as conn:
            conn.execute("UPDATE library SET output_path = NULL WHERE id = ?;", (id,))
            # If both input and output are gone, clean up entry
            conn.execute("DELETE FROM library WHERE id = ? AND input_path IS NULL AND output_path IS NULL;", (id,))
            conn.commit()

    def delete_entry(self, id: str):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM library WHERE id = ?;", (id,))
            conn.commit()

    def get_all(self) -> List[LibraryEntry]:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM library ORDER BY created_at DESC;")
            rows = cursor.fetchall()
            return [self._row_to_entry(row) for row in rows]

    def clear_inputs(self):
        """
        Called when the input directory is wiped.
        1. Removes entries that have NO output_path.
        2. For entries with output_path, sets input_path to None.
        """
        with self._get_connection() as conn:
            conn.execute("DELETE FROM library WHERE output_path IS NULL;")
            conn.execute("UPDATE library SET input_path = NULL;")
            conn.commit()
