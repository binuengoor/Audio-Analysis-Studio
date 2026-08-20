FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for audio decoding and acceleration
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    build-essential \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY structure_api.py .

EXPOSE 8005

CMD ["uvicorn", "structure_api:app", "--host", "0.0.0.0", "--port", "8005"]
