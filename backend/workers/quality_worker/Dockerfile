FROM python:3.10-slim

# System dependencies for audio analysis, metadata, and spectrogram generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    build-essential \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY quality_api.py .

EXPOSE 8004

CMD ["uvicorn", "quality_api:app", "--host", "0.0.0.0", "--port", "8004"]
