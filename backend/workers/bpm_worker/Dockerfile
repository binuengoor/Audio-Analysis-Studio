FROM python:3.8-slim

WORKDIR /app

# Install system dependencies for audio processing, portaudio, and C compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    libopenblas-dev \
    portaudio19-dev \
    pkg-config \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install pinned numpy and cython
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir "numpy==1.23.5" cython "numba>=0.57.0"

# Install worker requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir "numpy==1.23.5" "numba>=0.57.0"

# Copy API wrapper
COPY bpm_api.py .

EXPOSE 8001

CMD ["uvicorn", "bpm_api:app", "--host", "0.0.0.0", "--port", "8001"]
