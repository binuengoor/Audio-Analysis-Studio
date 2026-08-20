import os
import shutil
import asyncio
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from celery.result import AsyncResult

from models import (
    AnalysisResult,
    AnalyzeRequest,
    BatchAnalyzeRequest,
    BatchAnalyzeResponse,
    JobStatusResponse,
    QueueRequest,
    QueueStatus,
    RenameRequest,
    LibraryEntry,
)
from processor import BatchProcessor
from metadata import generate_new_filename
from library import LibraryManager
from celery_tasks import celery_app, analyze_audio_task

app = FastAPI(title="Audio Analysis Studio API Gateway")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories (Shared Volume)
DEFAULT_DATA_DIR = "/app/data/shared_audio" if os.path.exists("/app") else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
SHARED_DATA_DIR = os.getenv("SHARED_DATA_DIR", DEFAULT_DATA_DIR)
DATA_DIR = SHARED_DATA_DIR
INPUT_DIR = os.path.join(SHARED_DATA_DIR, "input")
OUTPUT_DIR = os.path.join(SHARED_DATA_DIR, "output")

os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mount static files for audio preview streaming and spectrogram viewing
app.mount("/files/input", StaticFiles(directory=INPUT_DIR), name="input_files")
app.mount("/files/output", StaticFiles(directory=OUTPUT_DIR), name="output_files")

processor = BatchProcessor(INPUT_DIR)
library = LibraryManager(SHARED_DATA_DIR)

@app.get("/")
def read_root():
    return {"message": "Audio Analysis Studio Gateway Live"}

@app.post("/api/upload", response_model=LibraryEntry)
async def upload_audio(file: UploadFile = File(...)):
    try:
        file_path = os.path.join(INPUT_DIR, file.filename)
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

@app.post("/api/analyze/batch", response_model=BatchAnalyzeResponse)
async def analyze_batch(request: BatchAnalyzeRequest):
    """
    Enqueues asynchronous analysis tasks for multiple files to the Celery/Redis job queue.
    Returns a list of job_ids.
    """
    job_ids = []
    for filename in request.filenames:
        entry = library.get_entry_by_filename(filename)
        if not entry:
            entry = library.add_entry(filename)
        if entry:
            entry.status = "processing"
            library.save()

        task = analyze_audio_task.delay(filename)
        job_ids.append(task.id)

    return BatchAnalyzeResponse(job_ids=job_ids)

@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Polls the status of a Celery background job and retrieves the merged analysis JSON once complete.
    """
    res = AsyncResult(job_id, app=celery_app)
    state = res.state

    if state == "SUCCESS":
        raw_result = res.result
        analysis = AnalysisResult(**raw_result) if isinstance(raw_result, dict) else raw_result
        return JobStatusResponse(job_id=job_id, status="SUCCESS", result=analysis)
    elif state == "FAILURE":
        return JobStatusResponse(job_id=job_id, status="FAILURE", error=str(res.result))
    elif state in ("STARTED", "PROCESSING"):
        return JobStatusResponse(job_id=job_id, status="PROCESSING")
    else:
        return JobStatusResponse(job_id=job_id, status="PENDING")

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
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    new_name = generate_new_filename(
        entry.filename,
        request.pattern,
        request.bpm,
        request.key,
        request.camelot
    )
    dest_path = os.path.join(OUTPUT_DIR, new_name)

    shutil.copy2(source_path, dest_path)
    library.set_output(entry.id, new_name)

    return {
        "message": "File processed and renamed successfully",
        "output_filename": new_name,
        "library_entry": entry
    }

@app.get("/api/library", response_model=List[LibraryEntry])
def get_library():
    return library.get_all()

@app.get("/api/download/input/{filename}")
def download_input(filename: str):
    file_path = os.path.join(INPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path, filename=filename)

@app.get("/api/download/output/{filename}")
def download_output(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path, filename=filename)

@app.delete("/api/library/{id}/input")
def delete_input_file(id: str):
    entry = library.get_entry(id)
    if not entry or not entry.input_path:
        raise HTTPException(status_code=404, detail="Entry or input file not found")
    
    file_path = os.path.join(INPUT_DIR, entry.input_path)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    library.delete_input(id)
    return {"message": "Input file deleted successfully"}

@app.delete("/api/library/{id}/output")
def delete_output_file(id: str):
    entry = library.get_entry(id)
    if not entry or not entry.output_path:
        raise HTTPException(status_code=404, detail="Entry or output file not found")
    
    file_path = os.path.join(OUTPUT_DIR, entry.output_path)
    if os.path.exists(file_path):
        os.remove(file_path)
        
    library.delete_output(id)
    return {"message": "Output file deleted successfully"}

@app.delete("/api/library/{id}")
def delete_entry(id: str):
    entry = library.get_entry(id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    if entry.input_path:
        p = os.path.join(INPUT_DIR, entry.input_path)
        if os.path.exists(p):
            os.remove(p)
            
    if entry.output_path:
        p = os.path.join(OUTPUT_DIR, entry.output_path)
        if os.path.exists(p):
            os.remove(p)
            
    library.delete_input(id)
    library.delete_output(id)
    return {"message": "Entry and files deleted successfully"}

@app.delete("/api/library")
def clear_library():
    for f in os.listdir(INPUT_DIR):
        p = os.path.join(INPUT_DIR, f)
        if os.path.isfile(p) and not f.startswith("."):
            os.remove(p)
            
    for f in os.listdir(OUTPUT_DIR):
        p = os.path.join(OUTPUT_DIR, f)
        if os.path.isfile(p) and not f.startswith("."):
            os.remove(p)
            
    library.entries = []
    library.save()
    return {"message": "Library cleared completely"}
