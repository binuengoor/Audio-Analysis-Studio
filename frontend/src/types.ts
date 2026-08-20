export interface ChordSegment {
  start: number;
  end: number;
  chord: string;
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
