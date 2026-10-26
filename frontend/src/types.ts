export interface ChordSegment {
  start: number;
  end: number;
  chord: string;
}

export interface ContainerInfo {
  codec: string;
  stated_bitrate_kbps: number;
  sample_rate_hz: number;
  bit_depth: number;
  channels: number;
}

export interface MasteringInfo {
  lufs: number;
  peak_db: number;
}

export interface AuthenticityInfo {
  cutoff_hz: number;
  estimated_bitrate_kbps: string;
  verdict: string;
}

export interface QualityResult {
  container: ContainerInfo;
  mastering: MasteringInfo;
  authenticity: AuthenticityInfo;
  spectrogram_image_path: string;
}

export interface SectionSegment {
  start: number;
  end: number;
  label: string;
  color: string;
}

export interface AnalysisResult {
  filename?: string;
  /** null when the BPM/key engine failed; see engine_errors */
  bpm: number | null;
  bpm_confidence: number | null;
  key_standard: string | null;
  key_camelot: string | null;
  key_confidence: number | null;
  duration: number;
  engine_errors?: Record<string, string>;
  /** "bpm" / "key" groups the user corrected manually */
  manual_overrides?: string[];
  chords?: ChordSegment[];
  quality?: QualityResult;
  segments?: SectionSegment[];
}

export interface AudioFile {
  file: File;
  id: string;
  status: 'uploading' | 'pending' | 'processing' | 'completed' | 'error';
  result?: AnalysisResult;
  previewUrl?: string;
}

export interface LibraryEntry {
  id: string;
  filename: string;
  input_path: string | null;
  output_path: string | null;
  analysis: AnalysisResult | null;
  created_at: number;
  status: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  durationMs?: number;
}
