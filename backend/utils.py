import os
import re
import unicodedata
from typing import Optional

def sanitize_filename(filename: str, fallback: str = "upload.wav") -> str:
    """
    Sanitizes an untrusted filename to prevent path traversal attacks,
    strips absolute path prefixes, directory separators, null bytes, and
    dangerous shell/filesystem characters while preserving valid extensions.
    """
    if not filename:
        return fallback

    # Normalize unicode
    filename = unicodedata.normalize("NFKD", filename)

    # Strip any leading directory components (both Unix / and Windows \)
    filename = filename.replace("\\", "/")
    filename = os.path.basename(filename)

    # Remove null bytes and non-printable control characters
    filename = "".join(ch for ch in filename if ch.isprintable() and ch not in "\x00\r\n\t")

    # Remove dangerous characters (< > : " / \ | ? * and leading dots/tilde)
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)

    # Prevent hidden file tricks / path traversal remnants like ".." or "."
    filename = filename.strip(". ")

    if not filename:
        return fallback

    return filename


def resolve_audio_file_path(
    filename: str,
    input_dir: Optional[str] = None,
    output_dir: Optional[str] = None,
) -> Optional[str]:
    """
    Locates an audio file across input and output storage directories.
    Handles files that originated from uploads (input), URL downloads (input),
    time-stretching/pitch-shifting (output), or processed/renamed tracks (output).
    """
    if not filename:
        return None

    # Lazy-import defaults if not explicitly passed
    if input_dir is None or output_dir is None:
        from config import INPUT_DIR, OUTPUT_DIR, SHARED_DATA_DIR
        input_dir = input_dir or INPUT_DIR
        output_dir = output_dir or OUTPUT_DIR
    else:
        SHARED_DATA_DIR = os.path.dirname(input_dir)

    clean_name = sanitize_filename(filename)

    # 1. Direct match in input_dir
    candidate = os.path.join(input_dir, clean_name)
    if os.path.isfile(candidate):
        return candidate

    # 2. Direct match in output_dir
    candidate = os.path.join(output_dir, clean_name)
    if os.path.isfile(candidate):
        return candidate

    # 3. Recursive search in input_dir
    if os.path.exists(input_dir):
        for root, _, files in os.walk(input_dir):
            if clean_name in files:
                p = os.path.join(root, clean_name)
                if os.path.isfile(p):
                    return p

    # 4. Recursive search in output_dir
    if os.path.exists(output_dir):
        for root, _, files in os.walk(output_dir):
            if clean_name in files:
                p = os.path.join(root, clean_name)
                if os.path.isfile(p):
                    return p

    # 5. Direct match in base shared directory
    if SHARED_DATA_DIR:
        candidate = os.path.join(SHARED_DATA_DIR, clean_name)
        if os.path.isfile(candidate):
            return candidate

    return None


def unique_upload_name(directory: str, filename: str, content_sha256: str) -> str:
    """
    Returns `filename` if it is free or already holds identical content; otherwise
    appends a short content hash so different uploads sharing a name never overwrite each other.
    """
    import hashlib

    candidate = os.path.join(directory, filename)
    if not os.path.exists(candidate):
        return filename
    existing = hashlib.sha256()
    with open(candidate, "rb") as f:
        while chunk := f.read(1024 * 1024):
            existing.update(chunk)
    if existing.hexdigest() == content_sha256:
        return filename
    base, ext = os.path.splitext(filename)
    return f"{base}_{content_sha256[:8]}{ext}"
