import os
import re
import hashlib
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


class UploadTooLargeError(Exception):
    """Raised when an uploaded file exceeds the configured size limit."""

    def __init__(self, limit_mb: int):
        self.limit_mb = limit_mb
        super().__init__(f"File exceeds maximum allowed size of {limit_mb}MB.")


def save_upload_stream(src, dest_path: str, max_size_mb: int = 0, chunk_size: int = 1024 * 1024) -> str:
    """
    Streams a file-like object to dest_path in chunks, aborting as soon as max_size_mb is
    exceeded (0 disables the limit) so oversized uploads never fill the disk.
    Returns the SHA-256 hex digest of the written content.
    """
    max_bytes = max_size_mb * 1024 * 1024 if max_size_mb > 0 else None
    digest = hashlib.sha256()
    written = 0
    try:
        with open(dest_path, "wb") as out:
            while True:
                chunk = src.read(chunk_size)
                if not chunk:
                    break
                written += len(chunk)
                if max_bytes is not None and written > max_bytes:
                    raise UploadTooLargeError(max_size_mb)
                digest.update(chunk)
                out.write(chunk)
    except BaseException:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise
    return digest.hexdigest()


def file_sha256(path: str, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def unique_filename(directory: str, filename: str) -> str:
    """Returns filename, or 'name (n).ext' if a file with that name already exists in directory."""
    base, ext = os.path.splitext(filename)
    candidate = filename
    n = 1
    while os.path.exists(os.path.join(directory, candidate)):
        candidate = f"{base} ({n}){ext}"
        n += 1
    return candidate


def is_within_directory(path: str, directory: str) -> bool:
    """True if path resolves (following symlinks) to a location inside directory."""
    real_dir = os.path.realpath(directory)
    real_path = os.path.realpath(path)
    return os.path.commonpath([real_dir, real_path]) == real_dir
