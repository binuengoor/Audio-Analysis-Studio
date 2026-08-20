import os
import numpy as np
import scipy.sparse.csgraph
import sklearn.cluster
import librosa
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Structure Worker", description="Laplacian Song Structural Segmentation Service")

class AnalyzeRequest(BaseModel):
    file_path: str

class SectionSegment(BaseModel):
    start: float
    end: float
    label: str
    color: str

class StructureResponse(BaseModel):
    segments: List[SectionSegment]

@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "structure-worker"}

def compute_structural_segmentation(file_path: str) -> List[SectionSegment]:
    """
    Performs beat-synchronous CQT chroma + MFCC feature extraction and
    Laplacian structural agglomerative clustering to detect macro song sections.
    """
    # 1. Load audio signal
    y, sr = librosa.load(file_path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    if duration < 5.0:
        return [
            SectionSegment(start=0.0, end=round(duration, 2), label="Full Track", color="rgba(99, 102, 241, 0.20)")
        ]

    # 2. Beat Tracking
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    if len(beats) < 8:
        beats = np.arange(0, len(y) // 512, 16)

    beat_times = librosa.frames_to_time(beats, sr=sr)

    # 3. Synchronized Feature Extraction (CQT Chroma + MFCC)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
    chroma_sync = librosa.util.sync(chroma, beats, aggregate=np.median)

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=512)
    mfcc_sync = librosa.util.sync(mfcc, beats)

    # Normalize feature matrices
    chroma_sync = librosa.util.normalize(chroma_sync, axis=0)
    mfcc_sync = librosa.util.normalize(mfcc_sync, axis=0)
    features = np.vstack([chroma_sync, mfcc_sync]).T # (n_beats, n_features)

    # 4. Agglomerative Clustering with Temporal Continuity Constraint
    # Typical song section length is 15-30s
    n_sections = min(max(3, int(duration / 20)), 8)
    n_samples = len(features)

    # Temporal adjacency connectivity matrix
    connectivity = np.eye(n_samples, k=1) + np.eye(n_samples, k=-1)

    try:
        ward = sklearn.cluster.AgglomerativeClustering(
            n_clusters=n_sections,
            connectivity=connectivity,
            linkage='ward'
        )
        labels = ward.fit_predict(features)
    except Exception as e:
        print(f"Agglomerative clustering error: {e}, falling back to KMeans")
        km = sklearn.cluster.KMeans(n_clusters=n_sections, random_state=42, n_init=10)
        labels = km.fit_predict(features)

    # 5. Extract Section Boundaries
    boundaries = [0]
    for i in range(1, len(labels)):
        if labels[i] != labels[i-1]:
            boundaries.append(i)
    boundaries.append(len(labels))

    # 6. RMS Energy Profile for Heuristic Functional Labeling
    rms = librosa.feature.rms(y=y)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
    avg_energy = float(np.mean(rms)) if len(rms) > 0 else 1.0

    raw_segments = []
    for j in range(len(boundaries) - 1):
        start_idx = boundaries[j]
        end_idx = boundaries[j+1]
        start_time = 0.0 if start_idx == 0 else float(beat_times[min(start_idx, len(beat_times)-1)])
        end_time = float(duration) if end_idx >= len(beat_times) else float(beat_times[end_idx])

        mask = (rms_times >= start_time) & (rms_times <= end_time)
        energy = float(np.mean(rms[mask])) if np.any(mask) else avg_energy

        raw_segments.append({
            "start": round(start_time, 2),
            "end": round(end_time, 2),
            "energy": energy
        })

    # Ensure contiguous boundaries
    for i in range(len(raw_segments) - 1):
        raw_segments[i]["end"] = raw_segments[i+1]["start"]
    raw_segments[-1]["end"] = round(duration, 2)

    # 7. Functional Heuristic Labeling & Translucent Color Palette
    labeled_segments: List[SectionSegment] = []
    verse_count = 0
    chorus_count = 0
    bridge_count = 0

    total_segs = len(raw_segments)
    for idx, seg in enumerate(raw_segments):
        start = seg["start"]
        end = seg["end"]
        energy = seg["energy"]
        pos = (start + end) / (2.0 * duration)

        if idx == 0 and pos < 0.18:
            label = "Intro"
            color = "rgba(99, 102, 241, 0.20)" # Indigo
        elif idx == total_segs - 1 and pos > 0.82:
            label = "Outro"
            color = "rgba(139, 92, 246, 0.20)" # Purple
        elif energy >= avg_energy * 1.05:
            chorus_count += 1
            label = f"Chorus {chorus_count}" if chorus_count > 1 else "Chorus"
            color = "rgba(236, 72, 153, 0.25)" # Energetic Pink/Magenta
        elif 0.50 < pos < 0.82 and energy < avg_energy:
            bridge_count += 1
            label = f"Bridge {bridge_count}" if bridge_count > 1 else "Bridge"
            color = "rgba(245, 158, 11, 0.20)" # Warm Amber
        else:
            verse_count += 1
            label = f"Verse {verse_count}" if verse_count > 1 else "Verse"
            color = "rgba(59, 130, 246, 0.20)" # Cool Blue

        labeled_segments.append(
            SectionSegment(
                start=start,
                end=end,
                label=label,
                color=color
            )
        )

    return labeled_segments

@app.post("/analyze", response_model=StructureResponse)
def analyze(request: AnalyzeRequest):
    file_path = request.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found on shared volume: {file_path}")

    try:
        segments = compute_structural_segmentation(file_path)
        return StructureResponse(segments=segments)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Structure analysis failed: {str(e)}")
