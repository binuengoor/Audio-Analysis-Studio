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

# Clone MusicalKeyCNN repository directly (No-fork strategy)
RUN git clone https://github.com/a1ex90/MusicalKeyCNN.git /app

# Upgrade pip and install PyTorch and dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir torch torchaudio
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
RUN pip install --no-cache-dir fastapi uvicorn pydantic mutagen librosa

# Copy injected API wrapper
COPY key_api.py /app/key_api.py

EXPOSE 8002

CMD ["uvicorn", "key_api:app", "--host", "0.0.0.0", "--port", "8002"]
