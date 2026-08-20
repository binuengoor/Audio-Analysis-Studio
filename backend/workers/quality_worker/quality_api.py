import os
import re
import math
import json
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
import mutagen
import librosa
import librosa.display
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Quality & Bitrate Worker (WhatsMyBitrate Engine)")

class AnalyzeRequest(BaseModel):
    file_path: str

class ContainerInfo(BaseModel):
    codec: str
    stated_bitrate_kbps: int
    sample_rate_hz: int
    bit_depth: int
    channels: int

class MasteringInfo(BaseModel):
    lufs: float
    peak_db: float

class AuthenticityInfo(BaseModel):
    cutoff_hz: int
    estimated_bitrate_kbps: str
    verdict: str

class QualityResponse(BaseModel):
    container: ContainerInfo
    mastering: MasteringInfo
    authenticity: AuthenticityInfo
    spectrogram_image_path: str

@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "quality-worker"}

def map_perceptual_bitrate(cutoff_hz: int) -> str:
    """
    Estimates the perceptual bitrate based on detected cutoff frequency:
    < 11500 Hz = 64 kbps
    11500 - 16500 Hz = 128 kbps
    16500 - 19000 Hz = 192 kbps
    19000 - 20500 Hz = 320 kbps
    > 20500 Hz = Lossless (Full Spectrum)
    """
    if cutoff_hz < 11500:
        return "64"
    elif cutoff_hz < 16500:
        return "128"
    elif cutoff_hz < 19000:
        return "192"
    elif cutoff_hz <= 20500:
        return "320"
    else:
        return "Lossless"

def extract_container_info(file_path: str) -> ContainerInfo:
    """Extracts codec, bit depth, sample rate, channels, and stated bitrate."""
    # 1. Inspect via soundfile
    try:
        sf_info = sf.info(file_path)
        sample_rate = int(sf_info.samplerate)
        channels = int(sf_info.channels)
        fmt = sf_info.format.upper()
        subtype = sf_info.subtype.upper()
        
        # Determine bit depth from subtype
        if "16" in subtype:
            bit_depth = 16
        elif "24" in subtype:
            bit_depth = 24
        elif "32" in subtype or "FLOAT" in subtype:
            bit_depth = 32
        elif "DOUBLE" in subtype:
            bit_depth = 64
        else:
            bit_depth = 16
    except Exception:
        sample_rate = 44100
        channels = 2
        fmt = "UNKNOWN"
        bit_depth = 16

    # 2. Inspect via Mutagen for codec and bitrate
    stated_bitrate = 0
    codec = fmt
    try:
        mut = mutagen.File(file_path)
        if mut is not None:
            type_name = type(mut).__name__.upper()
            if "FLAC" in type_name:
                codec = "FLAC"
                if hasattr(mut.info, "bits_per_sample") and mut.info.bits_per_sample:
                    bit_depth = int(mut.info.bits_per_sample)
            elif "MP3" in type_name or "ID3" in type_name:
                codec = "MP3"
            elif "WAVE" in type_name:
                codec = "WAV"
            elif "OGG" in type_name:
                codec = "OGG"
            elif "MP4" in type_name or "AAC" in type_name:
                codec = "AAC"
            elif "AIFF" in type_name:
                codec = "AIFF"

            if hasattr(mut.info, "bitrate") and mut.info.bitrate:
                raw_br = mut.info.bitrate
                stated_bitrate = int(raw_br / 1000) if raw_br > 1000 else int(raw_br)
    except Exception as e:
        print(f"Mutagen inspection error: {e}")

    # If uncompressed PCM or FLAC without explicit stated bitrate, calculate standard bit rate
    if stated_bitrate <= 0:
        stated_bitrate = int((sample_rate * bit_depth * channels) / 1000)

    return ContainerInfo(
        codec=codec,
        stated_bitrate_kbps=stated_bitrate,
        sample_rate_hz=sample_rate,
        bit_depth=bit_depth,
        channels=channels
    )

def calculate_mastering_metrics(audio_data: np.ndarray, rate: int) -> MasteringInfo:
    """Calculates integrated LUFS loudness and peak dB."""
    # Peak in dBFS
    sample_peak = float(np.max(np.abs(audio_data)))
    peak_db = round(float(20 * math.log10(sample_peak + 1e-9)), 1)

    # Integrated LUFS via pyloudnorm
    try:
        meter = pyln.Meter(rate)
        # pyloudnorm expects shape (samples, channels) or (samples,)
        loudness = meter.integrated_loudness(audio_data)
        if math.isinf(loudness) or math.isnan(loudness):
            lufs = -70.0
        else:
            lufs = round(float(loudness), 1)
    except Exception as e:
        print(f"LUFS calculation error: {e}")
        lufs = -70.0

    return MasteringInfo(lufs=lufs, peak_db=peak_db)

def analyze_authenticity_and_cutoff(file_path: str, codec: str, stated_bitrate: int) -> tuple[int, str, str]:
    """
    Executes flac-detective for FLAC files or high-accuracy STFT power spectrum analysis
    to detect true brickwall cutoff frequency (Hz), estimated perceptual bitrate, and transcode verdict.
    Returns (cutoff_hz, estimated_bitrate_kbps, verdict).
    """
    cutoff_hz = 0
    verdict = ""
    is_lossless_container = codec.upper() in ("WAV", "FLAC", "AIFF", "ALAC")

    # 1. If FLAC format, attempt analysis via flac-detective
    if codec.upper() == "FLAC":
        temp_json = tempfile.mktemp(suffix=".json")
        try:
            cmd = [
                "flac-detective",
                "--advanced",
                "--format", "json",
                "--output", temp_json,
                file_path
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if os.path.exists(temp_json):
                with open(temp_json, "r") as f:
                    report = json.load(f)
                if report.get("results") and len(report["results"]) > 0:
                    item = report["results"][0]
                    cutoff_hz = int(item.get("cutoff_freq", 0))
                    raw_verdict = str(item.get("verdict", "")).upper()
                    if raw_verdict in ("AUTHENTIC", "GENUINE_HIRES", "CLEAN"):
                        verdict = "GENUINE LOSSLESS"
                    elif "FAKE" in raw_verdict or "TRANSCODE" in raw_verdict or "SUSPICIOUS" in raw_verdict:
                        verdict = "SUSPICIOUS (Fake Lossless)"
        except Exception as e:
            print(f"flac-detective execution error: {e}")
        finally:
            if os.path.exists(temp_json):
                try:
                    os.remove(temp_json)
                except Exception:
                    pass

    # 2. STFT Spectral Power Cutoff Analysis (for all formats or when flac-detective did not yield cutoff)
    if cutoff_hz <= 0:
        try:
            y, sr = librosa.load(file_path, sr=None, mono=True, duration=60.0)
            n_fft = 2048
            hop_length = 512
            S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))
            S_db = librosa.amplitude_to_db(S, ref=np.max)
            freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

            # 90th percentile energy across time frames for each frequency bin
            energy_profile = np.percentile(S_db, 90, axis=1)

            # Search from Nyquist down to 8000 Hz for the highest frequency above the noise floor (-65 dB)
            detected_cutoff = freqs[-1]
            for i in range(len(freqs) - 1, 0, -1):
                if freqs[i] < 8000:
                    break
                if energy_profile[i] > -65.0:
                    detected_cutoff = freqs[i]
                    break

            cutoff_hz = int(detected_cutoff)
        except Exception as e:
            print(f"STFT cutoff detection error: {e}")
            cutoff_hz = 20500

    estimated_bitrate = map_perceptual_bitrate(cutoff_hz)

    # 3. Contextual Authenticity & Transcode Verdict
    if not verdict:
        if is_lossless_container:
            if cutoff_hz >= 20000:
                verdict = "GENUINE LOSSLESS"
            elif cutoff_hz >= 18500:
                verdict = "NEAR LOSSLESS (20kHz Filtered)"
            elif cutoff_hz >= 15000:
                verdict = f"SUSPICIOUS ({estimated_bitrate}k Transcode)"
            else:
                verdict = f"FAKE LOSSLESS ({estimated_bitrate}k Transcode)"
        else:
            # Lossy container (MP3, AAC, OGG, etc.)
            if stated_bitrate >= 320 and cutoff_hz < 17000:
                verdict = f"SUSPICIOUS ({stated_bitrate}k container with {estimated_bitrate}k cutoff)"
            else:
                verdict = f"AUTHENTIC {codec.upper()}"

    return cutoff_hz, estimated_bitrate, verdict

def generate_spectrogram(file_path: str, cutoff_hz: int, estimated_bitrate: str) -> str:
    """Generates a linear-frequency spectrogram image with red dashed cutoff line."""
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    spec_dir = os.path.dirname(file_path)
    spec_filename = f"{base_name}_spectrogram.png"
    spec_path = os.path.join(spec_dir, spec_filename)

    try:
        # Load first 60 seconds for fast and high-resolution rendering
        y, sr = librosa.load(file_path, sr=None, mono=True, duration=60.0)
        D = librosa.amplitude_to_db(np.abs(librosa.stft(y)), ref=np.max)

        fig, ax = plt.subplots(figsize=(10, 4.5), facecolor='#090d16')
        ax.set_facecolor('#090d16')

        img = librosa.display.specshow(
            D,
            sr=sr,
            x_axis='time',
            y_axis='linear',
            ax=ax,
            cmap='magma'
        )

        cbar = fig.colorbar(img, ax=ax, format='%+2.0f dB')
        cbar.ax.yaxis.set_tick_params(color='white')
        plt.setp(plt.getp(cbar.ax.axes, 'yticklabels'), color='white')

        ax.set_title(
            f"Spectrogram Analysis | Cutoff: {cutoff_hz} Hz ({estimated_bitrate} kbps)",
            color='white',
            fontsize=12,
            fontweight='bold',
            pad=10
        )
        ax.tick_params(colors='white')
        ax.xaxis.label.set_color('white')
        ax.yaxis.label.set_color('white')

        # Red dashed line at cutoff
        if 0 < cutoff_hz < (sr / 2):
            ax.axhline(y=cutoff_hz, color='#ef4444', linestyle='--', linewidth=2, label=f"Cutoff: {cutoff_hz} Hz")
            legend = ax.legend(loc='upper right', facecolor='#1e293b', edgecolor='#475569')
            plt.setp(legend.get_texts(), color='white')

        plt.tight_layout()
        plt.savefig(spec_path, dpi=120, facecolor=fig.get_facecolor(), edgecolor='none')
        plt.close(fig)
    except Exception as e:
        print(f"Spectrogram generation error: {e}")
        # Create dummy file if plotting failed
        if not os.path.exists(spec_path):
            with open(spec_path, "wb") as f:
                f.write(b"")

    return spec_path

@app.post("/analyze", response_model=QualityResponse)
def analyze(request: AnalyzeRequest):
    file_path = request.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found on shared volume: {file_path}")

    try:
        # 1. Container Info
        container = extract_container_info(file_path)

        # 2. Load audio array for mastering & spectrogram
        try:
            audio_data, rate = sf.read(file_path, dtype='float32')
        except Exception:
            y, sr_loaded = librosa.load(file_path, sr=None, mono=False)
            audio_data = y.T if y.ndim > 1 else y
            rate = sr_loaded

        # 3. Mastering Metrics (LUFS & Peak dB)
        mastering = calculate_mastering_metrics(audio_data, rate)

        # 4. Authenticity & Frequency Cutoff
        cutoff_hz, estimated_bitrate, verdict = analyze_authenticity_and_cutoff(
            file_path,
            container.codec,
            container.stated_bitrate_kbps
        )
        authenticity = AuthenticityInfo(
            cutoff_hz=cutoff_hz,
            estimated_bitrate_kbps=estimated_bitrate,
            verdict=verdict
        )

        # 5. Spectrogram Image
        spec_image_path = generate_spectrogram(file_path, cutoff_hz, estimated_bitrate)

        return QualityResponse(
            container=container,
            mastering=mastering,
            authenticity=authenticity,
            spectrogram_image_path=spec_image_path
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quality analysis failed: {str(e)}")
