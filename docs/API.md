# Audio Analysis Studio — API Reference & Developer Guide

Audio Analysis Studio provides a high-performance REST API for automated audio stream downloading, tempo estimation (BPM), musical key classification, harmonic chord progression transcription, song structural segmentation, and audio quality inspection.

---

## Interactive Documentation (Swagger / ReDoc)

Interactive API explorers and OpenAPI definitions are available out of the box when the Gateway is running:

| Documentation Interface | URL | Description |
| :--- | :--- | :--- |
| **Swagger UI (Interactive)** | [`http://localhost:8000/docs`](http://localhost:8000/docs) | Test API calls directly from your browser with live request builders. |
| **ReDoc (Specification)** | [`http://localhost:8000/redoc`](http://localhost:8000/redoc) | Clean, readable OpenAPI 3.0 schema and data models reference. |
| **OpenAPI Schema (JSON)** | [`http://localhost:8000/openapi.json`](http://localhost:8000/openapi.json) | Raw OpenAPI JSON specification for code generators and SDK clients. |

---

## Authentication

All Public API endpoints under `/api/v1/*` require authentication using an API key passed in the `X-API-Key` HTTP request header:

```http
X-API-Key: your_api_key_here
```

* **No key by default**: authentication is off until you set `API_KEY` (or `API_KEYS`) for the gateway, e.g. in a `.env` file next to `docker-compose.yml`. The examples below use `test_key` as a placeholder.
* Once a key is set it is required on every gateway route, not only `/api/v1` (`/`, `/docs`, `/redoc` and `/openapi.json` stay public). `Authorization: Bearer <key>` is accepted too.
* If the key is omitted or invalid, the API returns `401 Unauthorized`.

### Engine Failures

Analysis results never contain guessed values. When an engine fails:
* **Single-engine endpoints** (`/analyze/bpm`, `/analyze/key`, `/analyze/chords`, `/analyze/structure`, `/analyze/quality`) return `502 Bad Gateway` with `{"detail": "...", "engine": "<name>"}`.
* **Multi-engine endpoints** (`/analyze/basic`, `/analyze/full`, `/analyze/url`, ...) return `200` with the failed fields set to `null` and an `engine_errors` object such as `{"bpm": "HTTP 422: No stable beat detected in audio"}`. If every engine fails they return `502`.

---

## Endpoint Overview

### 1. Download & Stream Extraction (For Downstream Pipelines)
Extract pristine audio files from YouTube, SoundCloud, or direct URLs to feed downstream apps (such as Stem Separation, Pitch Correction, or Mastering).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/download/stream` | **Stream Audio File Binary:** Downloads audio from URL and streams the raw FLAC/MP3/WAV file directly to the client with metadata headers (`X-Track-Title`, `X-Track-Duration`, etc.). Automatically cleans up temporary storage. |
| `POST` | `/api/v1/download/info` | **Metadata Inspector:** Extracts track title, duration, uploader, and thumbnail without downloading audio bytes. |

### 2. Direct URL Audio Analysis
One-step stream download + analysis in a single request.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/analyze/basic/url` | Fast BPM & Musical Key detection from URL |
| `POST` | `/api/v1/analyze/url` | Comprehensive 5-engine full audio analysis from URL |
| `POST` | `/api/intake/url` | Ingest stream into Studio Library & dispatch Celery background analysis |

### 3. File Upload Analysis (`multipart/form-data`)
Upload any raw audio file (`.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`, `.aiff`) or isolated stem (`vocals.wav`, `bass.wav`).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/analyze/basic` | **Fast BPM & Key:** Returns BPM, Standard Key (`C major`), Camelot (`8B`), confidence, and duration |
| `POST` | `/api/v1/analyze/bpm` | **BPM / Tempo Only:** Returns tempo value and confidence score |
| `POST` | `/api/v1/analyze/key` | **Musical Key Only:** Returns Standard Key, Camelot notation, and confidence score |
| `POST` | `/api/v1/analyze/structure` | **Structural Sections:** Returns timestamped macro sections (`Intro`, `Verse`, `Chorus`, `Bridge`, `Outro`) |
| `POST` | `/api/v1/analyze/chords` | **Chord Progression:** Returns harmonic chord sequence with start and end timestamps |
| `POST` | `/api/v1/analyze/quality` | **Audio Quality & Authenticity:** Returns codec, bitrate, LUFS loudness, peak dBFS, cutoff frequency, and authenticity verdict |
| `POST` | `/api/v1/analyze/full` | **Comprehensive Analysis:** Runs all 5 engines in parallel on uploaded file |

### 4. Pitch Shifting & Time Stretching (Rubber Band Library v4.0)
High-fidelity pitch transposition and tempo stretching with vocal formant preservation.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/stretch` | **Transform Audio:** Shifts pitch (-12 to +12 semitones) and/or stretches tempo (0.5x to 2.0x / target BPM) using Rubber Band v4 |
| `POST` | `/api/stretch` | **Studio Transform & Library Register:** Gateway endpoint for stretching tracks and registering output to studio library |

---

## Detailed Endpoint Documentation & Code Examples

### 1. Download & Stream Audio from URL

**`POST /api/v1/download/stream`**

Downloads the audio stream from YouTube, SoundCloud, or direct URLs via `yt-dlp` and `FFmpeg` and returns the complete physical audio file (`.flac`, `.mp3`, `.wav`) directly to the caller.

> [!NOTE]
> **Full Physical File Download via HTTP Streaming**:
> This endpoint transfers the actual audio binary file directly to your client or downstream microservice. The word "stream" refers to the memory-efficient HTTP chunked transfer mechanism used to transmit large lossless files without consuming excessive RAM on the server. The caller receives the complete audio file ready for disk storage, playback, or DSP processing (e.g. Demucs stem separation, pitch correction).

#### Request Body (`application/json`)
```json
{
  "url": "https://www.youtube.com/watch?v=_oFj7NdYNrU",
  "audio_format": "flac"
}
```

#### Example cURL (Saving directly to a physical file)
```bash
curl -X POST "http://localhost:8000/api/v1/download/stream" \
  -H "X-API-Key: test_key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=_oFj7NdYNrU", "audio_format": "flac"}' \
  --output "downloaded_track.flac"
```

#### Python Example (Downstream Pipe: Download $\rightarrow$ Key Analysis $\rightarrow$ Stem Separation)
```python
import requests

API_KEY = "test_key"
BASE_URL = "http://localhost:8000/api/v1"

# 1. Download audio stream from URL
url_to_fetch = "https://www.youtube.com/watch?v=_oFj7NdYNrU"
dl_resp = requests.post(
    f"{BASE_URL}/download/stream",
    headers={"X-API-Key": API_KEY},
    json={"url": url_to_fetch, "audio_format": "flac"},
    stream=True
)

if dl_resp.status_code == 200:
    audio_bytes = dl_resp.content
    track_title = requests.utils.unquote(dl_resp.headers.get("X-Track-Title", "Track"))
    duration = float(dl_resp.headers.get("X-Track-Duration", 0))
    print(f"Downloaded: {track_title} ({duration:.1f}s)")

    # 2. Query Key & BPM for Pitch Correction
    analysis_resp = requests.post(
        f"{BASE_URL}/analyze/basic",
        headers={"X-API-Key": API_KEY},
        files={"file": ("track.flac", audio_bytes, "audio/flac")}
    )
    analysis = analysis_resp.json()
    print(f"Detected Key: {analysis['key_standard']} ({analysis['key_camelot']}), BPM: {analysis['bpm']}")
```

#### JavaScript Example
```javascript
const response = await fetch('http://localhost:8000/api/v1/download/stream', {
  method: 'POST',
  headers: {
    'X-API-Key': 'test_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://www.youtube.com/watch?v=_oFj7NdYNrU',
    audio_format: 'flac'
  })
});

const blob = await response.blob();
console.log('Downloaded audio blob size:', blob.size);
```

#### Response Headers
* `Content-Type`: `audio/flac` (or `audio/mpeg`, `audio/wav`)
* `Content-Disposition`: `attachment; filename="Track.flac"`
* `X-Track-Title`: URL-encoded track title
* `X-Track-Duration`: Total duration in seconds (e.g. `297.0`)
* `X-Track-Uploader`: Artist or channel name
* `X-Track-Format`: Codec format (`flac`, `mp3`, `wav`)
* `X-Track-Extractor`: Source platform (`youtube`, `soundcloud`)

---

### 2. URL Metadata Inspector

**`POST /api/v1/download/info`**

#### Example cURL
```bash
curl -X POST "http://localhost:8000/api/v1/download/info" \
  -H "X-API-Key: test_key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=_oFj7NdYNrU"}'
```

#### Response (`200 OK`)
```json
{
  "title": "Ay Hairathe | Kangal Parthen | AR Rahman | KS Harisankar | Gouri G Kishan",
  "uploader": "KS Harisankar",
  "duration": 297.0,
  "thumbnail": "https://i.ytimg.com/vi_webp/_oFj7NdYNrU/maxresdefault.webp",
  "source_url": "https://www.youtube.com/watch?v=_oFj7NdYNrU",
  "extractor": "youtube"
}
```

---

### 3. Fast BPM & Key Analysis (File Upload)

**`POST /api/v1/analyze/basic`**

#### Example cURL
```bash
curl -X POST "http://localhost:8000/api/v1/analyze/basic" \
  -H "X-API-Key: test_key" \
  -F "file=@/path/to/my_track.mp3"
```

#### Response (`200 OK`)
```json
{
  "filename": "my_track.mp3",
  "bpm": 128.0,
  "bpm_confidence": 0.95,
  "key_standard": "C major",
  "key_camelot": "8B",
  "key_confidence": 0.92,
  "duration_seconds": 214.5
}
```

---

### 4. Song Structural Segmentation

**`POST /api/v1/analyze/structure`**

Detects song structure macro boundaries (`Intro`, `Verse`, `Chorus`, `Bridge`, `Outro`) using Librosa Laplacian graph segmentation.

#### Example cURL
```bash
curl -X POST "http://localhost:8000/api/v1/analyze/structure" \
  -H "X-API-Key: test_key" \
  -F "file=@song.wav"
```

#### Response (`200 OK`)
```json
{
  "filename": "song.wav",
  "duration_seconds": 185.3,
  "segments": [
    { "start": 0.0, "end": 15.2, "label": "Intro", "color": "rgba(99, 102, 241, 0.20)" },
    { "start": 15.2, "end": 45.8, "label": "Verse", "color": "rgba(59, 130, 246, 0.20)" },
    { "start": 45.8, "end": 78.4, "label": "Chorus", "color": "rgba(236, 72, 153, 0.25)" }
  ]
}
```

---

### 5. Chord Progression Recognition

**`POST /api/v1/analyze/chords`**

Transcribes harmonic progressions with start/end boundaries using Madmom deep learning CRF.

#### Example cURL
```bash
curl -X POST "http://localhost:8000/api/v1/analyze/chords" \
  -H "X-API-Key: test_key" \
  -F "file=@song.mp3"
```

#### Response (`200 OK`)
```json
{
  "filename": "song.mp3",
  "chords": [
    { "start": 0.0, "end": 4.2, "chord": "A:min" },
    { "start": 4.2, "end": 8.0, "chord": "F:maj" },
    { "start": 8.0, "end": 12.1, "chord": "C:maj" },
    { "start": 12.1, "end": 16.0, "chord": "G:maj" }
  ]
}
```

---

### 6. Audio Quality & Authenticity Inspection

**`POST /api/v1/analyze/quality`**

Analyzes container metadata, true audio frequency cutoff, ITU-R BS.1770-4 integrated LUFS loudness, and fake-lossless transcode authenticity verdict.

#### Example cURL
```bash
curl -X POST "http://localhost:8000/api/v1/analyze/quality" \
  -H "X-API-Key: test_key" \
  -F "file=@song.flac"
```

#### Response (`200 OK`)
```json
{
  "filename": "song.flac",
  "container": {
    "codec": "FLAC",
    "stated_bitrate_kbps": 1024,
    "sample_rate_hz": 44100,
    "bit_depth": 16,
    "channels": 2
  },
  "mastering": {
    "lufs": -13.8,
    "peak_db": -0.5
  },
  "authenticity": {
    "cutoff_hz": 20500,
    "estimated_bitrate_kbps": "Lossless",
    "verdict": "GENUINE LOSSLESS"
  }
}
```

---

### 7. Comprehensive Full Analysis (File Upload)

**`POST /api/v1/analyze/full`**

Runs BeatNet (BPM), MusicalKeyCNN (Key/Camelot), Madmom (Chords), Laplacian Agglomeration (Structure), and Audio Quality (LUFS/Cutoff) in parallel and returns aggregated JSON report.

#### Example cURL
```bash
curl -X POST "http://localhost:8000/api/v1/analyze/full" \
  -H "X-API-Key: test_key" \
  -F "file=@track.mp3"
```

---

---

### 8. Pitch Shifting & Time Stretching (Rubber Band v4)

**`POST /api/v1/stretch`**

Applies pitch shifting (semitones: -12.0 to +12.0) and time stretching / tempo alteration (speed multiplier: 0.5x to 2.0x, or target BPM) to an uploaded audio file using Rubber Band Library v4.0.

#### Form Parameters (`multipart/form-data`)
* `file`: Audio file binary (MP3, WAV, FLAC, M4A, OGG)
* `pitch_semitones` *(float, optional, default: 0.0)*: Semitone pitch transposition (-12.0 to +12.0)
* `tempo_ratio` *(float, optional, default: 1.0)*: Speed ratio (0.5 to 2.0; 1.25 = 125% speed)
* `target_bpm` *(float, optional)*: Desired target BPM (if provided with `original_bpm`, automatically computes stretch ratio)
* `original_bpm` *(float, optional)*: Original track BPM
* `preserve_formants` *(boolean, optional, default: false)*: Preserves vocal naturalness during pitch shifts
* `output_format` *(string, optional, default: "wav")*: `wav`, `mp3`, or `flac`

#### Example cURL
```bash
curl -X POST "http://localhost:8000/api/v1/stretch" \
  -H "X-API-Key: test_key" \
  -F "file=@track.mp3" \
  -F "pitch_semitones=2.0" \
  -F "tempo_ratio=1.15" \
  -F "preserve_formants=true" \
  -F "output_format=wav"
```

#### Response (`application/json`)
```json
{
  "success": true,
  "output_filename": "track_pitch+2.0st_speed1.15x.wav",
  "output_url": "/files/output/track_pitch+2.0st_speed1.15x.wav",
  "duration": 185.3,
  "pitch_semitones": 2.0,
  "tempo_ratio": 1.15,
  "target_bpm": 143.75,
  "engine": "Rubber Band Library v4.0"
}
```

---

### 9. Studio Library Ingestion (Internal Gateway)

**`POST /api/intake/url`**

Downloads the audio file, saves it directly into the shared `./data/input` directory, registers it into `library.json`, and dispatches background Celery analysis for the dashboard UI.

#### Example cURL
```bash
curl -X POST "http://localhost:8000/api/intake/url" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=_oFj7NdYNrU",
    "audio_format": "flac",
    "auto_analyze": true
  }'
```

---

### 10. Microservices Health & Infrastructure Topology

**`GET /api/health/services`**

Polls and returns the real-time operational status and HTTP response latency of all 8 microservices and workers.

#### Example cURL
```bash
curl -X GET "http://localhost:8000/api/health/services"
```

#### Response (`200 OK`)
```json
{
  "status": "healthy",
  "healthy_count": 8,
  "total_count": 8,
  "services": [
    {
      "name": "BeatNet BPM Worker",
      "status": "ok",
      "port": 8001,
      "latency_ms": 93.2,
      "engine": "BeatNet (DBN Beat & Downbeat)"
    },
    {
      "name": "MusicalKeyCNN Key Worker",
      "status": "ok",
      "port": 8002,
      "latency_ms": 100.6,
      "engine": "MusicalKeyCNN (Deep Key & Camelot)"
    },
    {
      "name": "Madmom Chord Worker",
      "status": "ok",
      "port": 8003,
      "latency_ms": 69.6,
      "engine": "Madmom (CNN + CRF Chord Progression)"
    },
    {
      "name": "WhatsMyBitrate Quality Worker",
      "status": "ok",
      "port": 8004,
      "latency_ms": 67.6,
      "engine": "WhatsMyBitrate & PyLoudNorm (LUFS & Cutoff)"
    },
    {
      "name": "Laplacian Structure Worker",
      "status": "ok",
      "port": 8005,
      "latency_ms": 67.3,
      "engine": "Librosa Laplacian Agglomerative Segmentation"
    },
    {
      "name": "yt-dlp Downloader Worker",
      "status": "ok",
      "port": 8006,
      "latency_ms": 128.1,
      "engine": "yt-dlp & FFmpeg Audio Stream Extractor"
    },
    {
      "name": "Rubber Band Stretch Worker",
      "status": "ok",
      "port": 8007,
      "latency_ms": 86.1,
      "engine": "Rubber Band Library v4.0 (Pitch & Stretch)"
    },
    {
      "name": "Redis Task Broker",
      "status": "ok",
      "port": 6379,
      "latency_ms": 58.8,
      "engine": "Redis Queue & PubSub"
    }
  ],
  "timestamp": 1787836121.37
}
```

---

## Status Codes & Error Handling

| Code | Name | Description |
| :--- | :--- | :--- |
| `200` | OK | Request succeeded. |
| `400` | Bad Request | Invalid input format, unsupported URL, or extraction error. |
| `401` | Unauthorized | Missing `X-API-Key` header. |
| `403` | Forbidden | Invalid API key, or YouTube bot verification challenge. |
| `404` | Not Found | Requested file not found on volume. |
| `413` | Entity Too Large | File upload exceeds maximum allowed size (`MAX_FILE_SIZE_MB`, default: 100MB). |
| `500` | Internal Server Error | Analysis or worker execution exception. |
| `503` | Service Unavailable | Downloader or ML worker container unreachable. |
