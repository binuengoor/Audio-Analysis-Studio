from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import shutil
import os
from typing import List
from models import AnalyzeRequest, AnalysisResult, QueueRequest, QueueStatus, RenameRequest, LibraryEntry
from processor import BatchProcessor
from library import LibraryManager
from metadata import write_audio_metadata

app = FastAPI(title="Audio Analysis Gateway")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory Setup with support for shared docker volume /app/data/shared_audio
if os.path.exists("/app/data/shared_audio"):
    DATA_DIR = "/app/data/shared_audio"
elif os.path.exists("/data"):
    DATA_DIR = "/data"
else:
    workspace_data = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
    DATA_DIR = workspace_data if os.path.exists(workspace_data) else "music_in"

INPUT_DIR = os.path.join(DATA_DIR, "input")
OUTPUT_DIR = os.path.join(DATA_DIR, "output")

os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Initialize Services
library = LibraryManager(DATA_DIR)
processor = BatchProcessor(INPUT_DIR)

# Mount directories for static access
app.mount("/files/input", StaticFiles(directory=INPUT_DIR), name="input_files")
app.mount("/files/output", StaticFiles(directory=OUTPUT_DIR), name="output_files")

@app.get("/")
def read_root():
    return {"message": "Audio Analysis Backend is running"}

@app.get("/api/library", response_model=List[LibraryEntry])
def get_library():
    return library.get_all()

@app.post("/api/upload", response_model=LibraryEntry)
async def upload_file(file: UploadFile = File(...)):
    file_path = os.path.join(INPUT_DIR, file.filename)
    print(f"Saving uploaded file to {file_path}")
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(file_path)
        print(f"Saved file size: {file_size} bytes")

        # Create or retrieve existing library entry
        entry = library.get_entry_by_filename(file.filename)
        if not entry:
            entry = library.add_entry(file.filename)
        else:
            entry.input_path = file.filename
            entry.status = "uploaded"
            library.save()
            
        return entry
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze", response_model=AnalysisResult)
async def analyze_audio(request: AnalyzeRequest):
    filename = request.filename
    if not filename and request.file_path:
        filename = os.path.basename(request.file_path)
    if not filename:
        raise HTTPException(status_code=400, detail="Either filename or file_path must be provided")

    try:
        entry = library.get_entry_by_filename(filename)
        if not entry:
            entry = library.add_entry(filename)

        result = await processor.process_file(filename)
        
        # Update library
        if entry:
            library.update_analysis(entry.id, AnalysisResult(**result))
            
        return result
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reanalyze", response_model=AnalysisResult)
async def reanalyze_audio(request: AnalyzeRequest):
    return await analyze_audio(request)

@app.post("/api/queue")
async def add_to_queue(request: QueueRequest):
    await processor.add_to_queue(request.filenames)
    return {"message": f"Added {len(request.filenames)} files to queue"}

@app.get("/api/status", response_model=QueueStatus)
async def get_status():
    status = processor.get_status()
    for filename, result in status["results"].items():
        entry = library.get_entry_by_filename(filename)
        if entry and entry.status != "completed":
            library.update_analysis(entry.id, result)
             
    return status

@app.post("/api/process")
async def process_output(request: RenameRequest):
    entry = library.get_entry_by_filename(request.filename)
    if not entry or not entry.input_path:
        raise HTTPException(status_code=404, detail="Input file not found in library")

    source_path = os.path.join(INPUT_DIR, entry.input_path)
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Source file missing on disk")

    name, ext = os.path.splitext(request.filename)
    new_name = request.pattern.format(
        OriginalName=name,
        Key=request.key,
        BPM=request.bpm,
        Camelot=request.camelot
    )
    new_name = "".join(c for c in new_name if c.isalnum() or c in (' ', '-', '_', '.', '#', '+', '(', ')', '[', ']'))
    new_filename = f"{new_name}{ext}"
    dest_path = os.path.join(OUTPUT_DIR, new_filename)

    counter = 1
    base_new_filename = new_filename
    while os.path.exists(dest_path):
        name_part, ext_part = os.path.splitext(base_new_filename)
        new_filename = f"{name_part}_{counter}{ext_part}"
        dest_path = os.path.join(OUTPUT_DIR, new_filename)
        counter += 1

    try:
        shutil.copy2(source_path, dest_path)
        # Automatically write ID3 metadata tags into the newly created output file
        write_audio_metadata(dest_path, request.bpm, request.camelot, request.key)
        library.set_output(entry.id, new_filename)
        return {"id": entry.id, "output_filename": new_filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/input/{filename}")
def download_input(filename: str):
    file_path = os.path.join(INPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=filename, media_type="application/octet-stream")

@app.get("/api/download/output/{filename}")
def download_output(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=filename, media_type="application/octet-stream")

@app.delete("/api/library/{id}/input")
def delete_input(id: str):
    entry = library.get_entry(id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    if entry.input_path:
        path = os.path.join(INPUT_DIR, entry.input_path)
        if os.path.exists(path):
            os.remove(path)
        library.delete_input(id)
    return {"status": "deleted"}

@app.delete("/api/library/{id}/output")
def delete_output(id: str):
    entry = library.get_entry(id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    if entry.output_path:
        path = os.path.join(OUTPUT_DIR, entry.output_path)
        if os.path.exists(path):
            os.remove(path)
        library.delete_output(id)
    return {"status": "deleted"}

@app.delete("/api/library/{id}")
def delete_entry(id: str):
    entry = library.get_entry(id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.input_path:
        path = os.path.join(INPUT_DIR, entry.input_path)
        if os.path.exists(path):
            os.remove(path)
    if entry.output_path:
        path = os.path.join(OUTPUT_DIR, entry.output_path)
        if os.path.exists(path):
            os.remove(path)
    library.entries.remove(entry)
    library.save()
    return {"status": "deleted"}

@app.delete("/api/library")
def clear_library():
    if os.path.exists(OUTPUT_DIR):
        for filename in os.listdir(OUTPUT_DIR):
            file_path = os.path.join(OUTPUT_DIR, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                print(f"Failed to delete {file_path}. Reason: {e}")

    if os.path.exists(INPUT_DIR):
        for filename in os.listdir(INPUT_DIR):
            file_path = os.path.join(INPUT_DIR, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                print(f"Failed to delete {file_path}. Reason: {e}")

    library.entries = []
    library.save()
    return {"status": "cleared"}
