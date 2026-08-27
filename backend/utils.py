import os
import re
import unicodedata

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
