import json
import os
import time
import uuid
from typing import List, Optional
from models import LibraryEntry, AnalysisResult

class LibraryManager:
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.db_path = os.path.join(data_dir, "library.json")
        self.entries: List[LibraryEntry] = []
        self.load()

    def load(self):
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, "r") as f:
                    data = json.load(f)
                    self.entries = [LibraryEntry(**item) for item in data]
            except Exception as e:
                print(f"Error loading library: {e}")
                self.entries = []
        else:
            self.entries = []

    def save(self):
        try:
            with open(self.db_path, "w") as f:
                dump_list = [entry.model_dump() if hasattr(entry, "model_dump") else entry.dict() for entry in self.entries]
                json.dump(dump_list, f, indent=2)
        except Exception as e:
            print(f"Error saving library: {e}")

    def add_entry(self, filename: str) -> LibraryEntry:
        entry = LibraryEntry(
            id=str(uuid.uuid4()),
            filename=filename,
            input_path=filename, # Relative to input dir
            created_at=time.time(),
            status="uploaded"
        )
        self.entries.append(entry)
        self.save()
        return entry

    def get_entry(self, id: str) -> Optional[LibraryEntry]:
        self.load()
        for entry in self.entries:
            if entry.id == id:
                return entry
        return None
    
    def get_entry_by_filename(self, filename: str) -> Optional[LibraryEntry]:
        self.load()
        for entry in self.entries:
            if entry.filename == filename:
                return entry
        return None

    def update_analysis(self, id: str, result: AnalysisResult):
        entry = self.get_entry(id)
        if entry:
            entry.analysis = result
            entry.status = "completed"
            self.save()

    def set_output(self, id: str, output_filename: str):
        entry = self.get_entry(id)
        if entry:
            entry.output_path = output_filename
            self.save()

    def delete_input(self, id: str):
        entry = self.get_entry(id)
        if entry:
            entry.input_path = None
            self.check_cleanup(entry)
            self.save()

    def delete_output(self, id: str):
        entry = self.get_entry(id)
        if entry:
            entry.output_path = None
            self.check_cleanup(entry)
            self.save()

    def check_cleanup(self, entry: LibraryEntry):
        # If both input and output are gone, remove the entry?
        # Or keep metadata? User requirement: "once input and output files are both deleted, the corresponding metadata should be deleted"
        if entry.input_path is None and entry.output_path is None:
            self.entries.remove(entry)

    def get_all(self) -> List[LibraryEntry]:
        self.load()
        return self.entries
    
    def clear_inputs(self):
        """
        Called when the input directory is wiped.
        1. Removes entries that have NO output_path (transient inputs).
        2. For entries with output_path, sets input_path to None (input is gone).
        """
        new_entries = []
        for entry in self.entries:
            if entry.output_path:
                # Keep this entry, but mark input as gone
                entry.input_path = None
                new_entries.append(entry)
            # Else: entry has no output, so it was just a transient input. Drop it.
        
        self.entries = new_entries
        self.save()
