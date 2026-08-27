#!/bin/sh
set -e

if [ "$AUTO_UPDATE_YTDLP" = "true" ]; then
    echo "[downloader-worker] Checking for latest yt-dlp release..."
    pip install --no-cache-dir -U yt-dlp || echo "[downloader-worker] yt-dlp update check failed, proceeding with current installed version."
fi

exec uvicorn downloader_api:app --host 0.0.0.0 --port 8006
