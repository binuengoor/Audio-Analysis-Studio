FROM python:3.9-slim

WORKDIR /app

# Install system dependencies including git and ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    libsndfile1 \
    libopenblas-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Clone MusicalKeyCNN at a pinned commit (No-fork strategy) so builds are reproducible
# and upstream changes can't silently break the injected API wrapper
ARG MUSICAL_KEY_CNN_COMMIT=61d8fc170f262410f66a12057adffc5aceea0b2c
RUN git clone https://github.com/a1ex90/MusicalKeyCNN.git /app \
    && git -C /app checkout --quiet "$MUSICAL_KEY_CNN_COMMIT"

# Upgrade pip and install PyTorch and dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir torch torchaudio
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
RUN pip install --no-cache-dir fastapi uvicorn pydantic mutagen librosa

# Copy injected API wrapper
COPY key_api.py /app/key_api.py

EXPOSE 8002

CMD ["uvicorn", "key_api:app", "--host", "0.0.0.0", "--port", "8002"]
