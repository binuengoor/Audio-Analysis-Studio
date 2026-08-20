import os
import mutagen
from mutagen.id3 import ID3, TBPM, TKEY, ID3NoHeaderError
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from mutagen.oggvorbis import OggVorbis
from mutagen.wave import WAVE
from mutagen.aiff import AIFF

def get_audio_duration(file_path: str) -> float:
    """
    Returns the duration of an audio file in seconds using mutagen.
    """
    try:
        audio = mutagen.File(file_path)
        if audio is not None and audio.info is not None:
            return round(float(audio.info.length), 2)
    except Exception as e:
        print(f"Warning: Could not get duration via mutagen for {file_path}: {e}")
    return 0.0

def write_audio_metadata(file_path: str, bpm: float, key_camelot: str, key_standard: str = "") -> bool:
    """
    Embeds discovered Key and BPM directly into the original audio file's metadata tags.
    Supports MP3, FLAC, M4A, OGG, WAV, and AIFF.
    """
    if not os.path.exists(file_path):
        return False

    bpm_str = str(int(round(bpm))) if bpm else ""
    bpm_float_str = str(round(bpm, 1)) if bpm else ""
    key_tag = key_camelot or key_standard

    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    try:
        if ext == ".mp3":
            try:
                tags = ID3(file_path)
            except ID3NoHeaderError:
                tags = ID3()
            
            if bpm_str:
                tags.delall("TBPM")
                tags.add(TBPM(encoding=3, text=bpm_str))
            if key_tag:
                tags.delall("TKEY")
                tags.add(TKEY(encoding=3, text=key_tag))
            tags.save(file_path)
            return True

        elif ext == ".flac":
            audio = FLAC(file_path)
            if bpm_float_str:
                audio["BPM"] = bpm_float_str
            if key_tag:
                audio["INITIALKEY"] = key_tag
            if key_standard:
                audio["KEY"] = key_standard
            audio.save()
            return True

        elif ext in [".m4a", ".mp4", ".aac"]:
            audio = MP4(file_path)
            if bpm:
                audio["tmpo"] = [int(round(bpm))]
            if key_tag:
                audio["\xa9key"] = [key_tag]
                audio["----:com.apple.iTunes:INITIALKEY"] = key_tag.encode("utf-8")
            audio.save()
            return True

        elif ext in [".ogg", ".oga"]:
            audio = OggVorbis(file_path)
            if bpm_float_str:
                audio["BPM"] = bpm_float_str
            if key_tag:
                audio["INITIALKEY"] = key_tag
            audio.save()
            return True

        elif ext == ".wav":
            try:
                audio = WAVE(file_path)
                if audio.tags is None:
                    audio.add_tags()
                if bpm_str:
                    audio.tags.delall("TBPM")
                    audio.tags.add(TBPM(encoding=3, text=bpm_str))
                if key_tag:
                    audio.tags.delall("TKEY")
                    audio.tags.add(TKEY(encoding=3, text=key_tag))
                audio.save()
                return True
            except Exception as wav_err:
                print(f"Warning: WAV ID3 tagging fallback: {wav_err}")
                return False

        elif ext in [".aif", ".aiff"]:
            audio = AIFF(file_path)
            if audio.tags is None:
                audio.add_tags()
            if bpm_str:
                audio.tags.delall("TBPM")
                audio.tags.add(TBPM(encoding=3, text=bpm_str))
            if key_tag:
                audio.tags.delall("TKEY")
                audio.tags.add(TKEY(encoding=3, text=key_tag))
            audio.save()
            return True

        else:
            # Generic mutagen fallback
            audio = mutagen.File(file_path, easy=True)
            if audio is not None and audio.tags is not None:
                if bpm_str:
                    audio["bpm"] = bpm_str
                if key_tag:
                    audio["key"] = key_tag
                audio.save()
                return True

    except Exception as e:
        print(f"Warning: Failed to write metadata to {file_path}: {e}")
        return False

    return False
