import os
from contextlib import asynccontextmanager
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Global estimator instance
estimator = None

def get_estimator():
    global estimator
    if estimator is None:
        from BeatNet.BeatNet import BeatNet
        # Initialize as per plan: BeatNet(1, mode='offline', inference_model='DBN', plot=[])
        estimator = BeatNet(1, mode='offline', inference_model='DBN', plot=[])
    return estimator

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up / initialize the estimator on startup
    try:
        get_estimator()
    except Exception as e:
        print(f"Warning: Deferred estimator initialization: {e}")
    yield

app = FastAPI(title="BeatNet BPM & Downbeat Worker", lifespan=lifespan)

class AnalyzeRequest(BaseModel):
    file_path: str

class BPMResponse(BaseModel):
    bpm: float
    bpm_confidence: float = 0.9

@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "bpm-worker"}

@app.post("/analyze", response_model=BPMResponse)
def analyze(request: AnalyzeRequest):
    file_path = request.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found on shared volume: {file_path}")

    try:
        model = get_estimator()
        output = model.process(file_path)
        
        bpm = 120.0
        confidence = 0.85

        if output is not None and len(output) > 1:
            # BeatNet offline output shape is (N, 2): column 0 is time (seconds), column 1 is beat/downbeat index
            beat_times = output[:, 0]
            intervals = np.diff(beat_times)
            # Filter realistic intervals between 0.15s (400 BPM) and 3.0s (20 BPM)
            valid_intervals = intervals[(intervals >= 0.15) & (intervals <= 3.0)]
            
            if len(valid_intervals) > 0:
                median_interval = float(np.median(valid_intervals))
                if median_interval > 0:
                    raw_bpm = 60.0 / median_interval
                    bpm = round(float(raw_bpm), 1)
                    std_dev = float(np.std(valid_intervals))
                    confidence = round(max(0.5, min(0.99, 1.0 - (std_dev / (median_interval + 1e-6)))), 2)

        return BPMResponse(bpm=bpm, bpm_confidence=confidence)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"BPM analysis failed: {str(e)}")
