import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

feat_proc = None
chord_proc = None

def get_processors():
    global feat_proc, chord_proc
    if feat_proc is None or chord_proc is None:
        from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor
        feat_proc = CNNChordFeatureProcessor()
        chord_proc = CRFChordRecognitionProcessor()
    return feat_proc, chord_proc

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_processors()
    except Exception as e:
        print(f"Warning: Deferred Madmom processor initialization: {e}")
    yield

app = FastAPI(title="Madmom Chord Progression Worker", lifespan=lifespan)

class AnalyzeRequest(BaseModel):
    file_path: str

class ChordSegment(BaseModel):
    start: float
    end: float
    chord: str

class ChordResponse(BaseModel):
    chords: List[ChordSegment]

@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "chord-worker"}

@app.post("/analyze", response_model=ChordResponse)
def analyze(request: AnalyzeRequest):
    file_path = request.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found on shared volume: {file_path}")

    try:
        f_proc, c_proc = get_processors()
        feats = f_proc(file_path)
        chords_raw = c_proc(feats)

        chord_segments = []
        if chords_raw is not None:
            for seg in chords_raw:
                try:
                    start = float(seg[0]) if hasattr(seg, '__getitem__') else float(getattr(seg, 'start', 0.0))
                    end = float(seg[1]) if hasattr(seg, '__getitem__') else float(getattr(seg, 'end', 0.0))
                    chord_label = str(seg[2]) if hasattr(seg, '__getitem__') else str(getattr(seg, 'chord', 'N'))
                    chord_segments.append(ChordSegment(
                        start=round(start, 2),
                        end=round(end, 2),
                        chord=chord_label
                    ))
                except Exception as ex:
                    print(f"Error parsing chord segment {seg}: {ex}")

        # Fallback if no chords detected
        if not chord_segments:
            chord_segments.append(ChordSegment(start=0.0, end=1.0, chord="N"))

        return ChordResponse(chords=chord_segments)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chord analysis failed: {str(e)}")
