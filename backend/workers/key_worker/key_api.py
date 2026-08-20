import os
from pathlib import Path
from contextlib import asynccontextmanager
try:
    import torch
    import torchaudio
    device = torch.device('cpu')
except ImportError:
    torch = None
    torchaudio = None
    device = "cpu"

try:
    import librosa
except ImportError:
    librosa = None

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

model = None

# Camelot <-> Standard Key Maps
CAMELOT_TO_STANDARD = {
    "1A": "Ab minor", "1B": "B major",
    "2A": "Eb minor", "2B": "F# major",
    "3A": "Bb minor", "3B": "Db major",
    "4A": "F minor",  "4B": "Ab major",
    "5A": "C minor",  "5B": "Eb major",
    "6A": "G minor",  "6B": "Bb major",
    "7A": "D minor",  "7B": "F major",
    "8A": "A minor",  "8B": "C major",
    "9A": "E minor",  "9B": "G major",
    "10A": "B minor", "10B": "D major",
    "11A": "F# minor","11B": "A major",
    "12A": "C# minor","12B": "E major",
}

def get_model():
    global model
    if model is None:
        try:
            from eval import load_model
            checkpoint_path = Path("checkpoints/keynet.pt")
            if not checkpoint_path.exists() and Path("/app/checkpoints/keynet.pt").exists():
                checkpoint_path = Path("/app/checkpoints/keynet.pt")
            if checkpoint_path.exists():
                model = load_model(checkpoint_path, device)
                model.eval()
                print("Loaded MusicalKeyCNN model successfully.")
        except Exception as e:
            print(f"Warning: Could not load MusicalKeyCNN model: {e}")
    return model

@asynccontextmanager
async def lifespan(app: FastAPI):
    get_model()
    yield

app = FastAPI(title="MusicalKeyCNN Key Detection Worker", lifespan=lifespan)

class AnalyzeRequest(BaseModel):
    file_path: str

class KeyResponse(BaseModel):
    key_camelot: str
    key_standard: str
    key_confidence: float = 0.95
    key: Optional[str] = None

@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "key-worker"}

def preprocess_audio_universal(audio_path: str, sample_rate: int = 44100, n_bins: int = 105, hop_length: int = 8820):
    try:
        waveform, sr = torchaudio.load(audio_path)
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        if sr != sample_rate:
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=sample_rate)
            waveform = resampler(waveform)
        audio = waveform.squeeze(0).numpy().astype(np.float32)
    except Exception:
        audio, _ = librosa.load(audio_path, sr=sample_rate, mono=True)

    cqt = librosa.cqt(audio, sr=sample_rate, hop_length=hop_length, n_bins=n_bins, bins_per_octave=24, fmin=65)
    spec = np.abs(cqt)
    spec = np.log1p(spec)

    # Slice as expected by KeyNet
    if spec.shape[1] > 2:
        chunk = spec[:, 0:-2]
    else:
        chunk = spec
    spec_tensor = torch.tensor(chunk, dtype=torch.float32)
    if spec_tensor.ndim == 2:
        spec_tensor = spec_tensor.unsqueeze(0)
    return spec_tensor

@app.post("/analyze", response_model=KeyResponse)
def analyze(request: AnalyzeRequest):
    file_path = request.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found on shared volume: {file_path}")

    try:
        net = get_model()
        if net is not None:
            spec_tensor = preprocess_audio_universal(file_path)
            spec_tensor = spec_tensor.to(device)
            if spec_tensor.ndim == 3:
                spec_tensor = spec_tensor.unsqueeze(0)

            with torch.no_grad():
                outputs = net(spec_tensor)
                probs = torch.softmax(outputs, dim=1)
                confidence, pred_tensor = torch.max(probs, dim=1)
                pred = int(pred_tensor.cpu().item())
                conf_val = round(float(confidence.cpu().item()), 2)

            from predict_keys import camelot_output
            camelot_str, key_text = camelot_output(pred)
            standard_key = CAMELOT_TO_STANDARD.get(camelot_str, key_text)

            return KeyResponse(
                key_camelot=camelot_str,
                key_standard=standard_key,
                key_confidence=conf_val,
                key=camelot_str
            )
        else:
            return KeyResponse(
                key_camelot="8A",
                key_standard="A minor",
                key_confidence=0.5,
                key="8A"
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Key analysis failed: {str(e)}")
