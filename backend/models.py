from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ChordSegment(BaseModel):
    start: float
    end: float
    chord: str

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
    bpm: float
    bpm_confidence: float = 0.9
    key_standard: str
    key_camelot: str
    key_confidence: float = 0.95
    duration: float = 0.0
    chords: List[ChordSegment] = []
    quality: Optional[QualityResult] = None

class AnalyzeRequest(BaseModel):
    filename: Optional[str] = None
    file_path: Optional[str] = None

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
    bpm: float
    key: str
    camelot: str

class LibraryEntry(BaseModel):
    id: str
    filename: str
    input_path: Optional[str] = None
    output_path: Optional[str] = None
    analysis: Optional[AnalysisResult] = None
    created_at: float
    status: str  # uploaded, pending, processing, completed, error
