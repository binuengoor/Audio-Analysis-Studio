from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ChordSegment(BaseModel):
    start: float
    end: float
    chord: str

class SectionSegment(BaseModel):
    start: float
    end: float
    label: str
    color: str

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

class QualityResult(BaseModel):
    container: ContainerInfo
    mastering: MasteringInfo
    authenticity: AuthenticityInfo
    spectrogram_image_path: str

class AnalysisResult(BaseModel):
    filename: Optional[str] = None
    # BPM/key fields are None when the corresponding engine failed (see engine_errors)
    bpm: Optional[float] = None
    bpm_confidence: Optional[float] = None
    key_standard: Optional[str] = None
    key_camelot: Optional[str] = None
    key_confidence: Optional[float] = None
    duration: float = 0.0
    chords: List[ChordSegment] = []
    quality: Optional[QualityResult] = None
    segments: List[SectionSegment] = []
    engine_errors: Dict[str, str] = {}

class AnalyzeRequest(BaseModel):
    filename: Optional[str] = None
    file_path: Optional[str] = None

class BatchAnalyzeRequest(BaseModel):
    filenames: List[str]

class BatchAnalyzeResponse(BaseModel):
    job_ids: List[str]

class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # PENDING, PROCESSING, SUCCESS, FAILURE
    result: Optional[AnalysisResult] = None
    error: Optional[str] = None

class QueueRequest(BaseModel):
    filenames: List[str]

class QueueStatus(BaseModel):
    queue_length: int
    is_processing: bool
    current_file: Optional[str] = None
    processed_count: int
    total_count: int
    results: Dict[str, AnalysisResult] = {}

class RenameRequest(BaseModel):
    filename: str
    pattern: str
    bpm: Optional[float] = None
    key: Optional[str] = None
    camelot: Optional[str] = None

class LibraryEntry(BaseModel):
    id: str
    filename: str
    input_path: Optional[str] = None
    output_path: Optional[str] = None
    analysis: Optional[AnalysisResult] = None
    created_at: float
    status: str  # uploaded, pending, processing, completed, error


# --- Public API (v1) Response Models ---

class BasicAnalysisResponse(BaseModel):
    filename: str
    bpm: Optional[float] = None
    bpm_confidence: Optional[float] = None
    key_standard: Optional[str] = None
    key_camelot: Optional[str] = None
    key_confidence: Optional[float] = None
    duration_seconds: float
    engine_errors: Dict[str, str] = {}


class KeyAnalysisResponse(BaseModel):
    filename: str
    key_standard: str
    key_camelot: str
    key_confidence: float


class BPMAnalysisResponse(BaseModel):
    filename: str
    bpm: float
    bpm_confidence: float


class StructureAnalysisResponse(BaseModel):
    filename: str
    duration_seconds: float
    segments: List[SectionSegment]


class ChordAnalysisResponse(BaseModel):
    filename: str
    duration_seconds: float
    chords: List[ChordSegment]


class QualityData(BaseModel):
    container: ContainerInfo
    mastering: MasteringInfo
    authenticity: AuthenticityInfo


class QualityAnalysisResponse(BaseModel):
    filename: str
    container: ContainerInfo
    mastering: MasteringInfo
    authenticity: AuthenticityInfo


class FullAnalysisResponse(BaseModel):
    filename: str
    bpm: Optional[float] = None
    bpm_confidence: Optional[float] = None
    key_standard: Optional[str] = None
    key_camelot: Optional[str] = None
    key_confidence: Optional[float] = None
    duration_seconds: float
    chords: List[ChordSegment] = []
    quality: Optional[QualityData] = None
    segments: List[SectionSegment] = []
    engine_errors: Dict[str, str] = {}


# --- URL Intake Models ---

class UrlIntakeRequest(BaseModel):
    url: str
    audio_format: Optional[str] = "flac"
    auto_analyze: bool = True


class UrlIntakeResponse(BaseModel):
    success: bool
    entry: LibraryEntry
    job_id: Optional[str] = None
    title: str
    duration: float = 0.0
    thumbnail: Optional[str] = None
    uploader: Optional[str] = None
    filename: str


class DownloaderVersionResponse(BaseModel):
    ytdlp_version: str
    ffmpeg_version: str
    cookies_present: bool
    cookies_path: str


class DownloaderUpdateResponse(BaseModel):
    success: bool
    message: str
    previous_version: str
    new_version: str
    output: Optional[str] = None


# --- Rubber Band Pitch Shift & Time Stretch Models ---

class StretchRequest(BaseModel):
    filename: str
    pitch_semitones: float = 0.0
    tempo_ratio: float = 1.0
    target_bpm: Optional[float] = None
    original_bpm: Optional[float] = None
    preserve_formants: bool = False
    crispness: int = 5
    output_format: Optional[str] = "wav"
    output_filename: Optional[str] = None
    add_to_library: bool = True


class StretchResponse(BaseModel):
    success: bool
    output_filename: str
    output_url: str
    duration: float
    pitch_semitones: float
    tempo_ratio: float
    target_bpm: Optional[float] = None
    library_entry: Optional[LibraryEntry] = None
    engine: str = "Rubber Band Library v4.0"


