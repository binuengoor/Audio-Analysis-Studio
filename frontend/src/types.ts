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
  bpm: number;
  bpm_confidence: number;
  key_standard: string;
  key_camelot: string;
  key_confidence: number;
  duration: number;
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
