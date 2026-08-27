FROM mwader/static-ffmpeg:latest AS ffmpeg-source
FROM denoland/deno:bin AS deno-source

FROM python:3.11-slim

# Copy static ffmpeg, ffprobe, and deno binaries
COPY --from=ffmpeg-source /ffmpeg /usr/local/bin/
COPY --from=ffmpeg-source /ffprobe /usr/local/bin/
COPY --from=deno-source /deno /usr/local/bin/deno

WORKDIR /app

# Install base packages for networking and SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy worker application and entrypoint
COPY downloader_api.py entrypoint.sh ./
RUN chmod +x /app/entrypoint.sh

EXPOSE 8006

ENTRYPOINT ["/app/entrypoint.sh"]
