FROM python:3.11-slim

WORKDIR /app

# Install system dependencies: rubberband-cli, librubberband-dev, ffmpeg, libsndfile1
RUN apt-get update && apt-get install -y --no-install-recommends \
    rubberband-cli \
    librubberband-dev \
    ffmpeg \
    libsndfile1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install worker requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy API wrapper
COPY stretch_api.py .

EXPOSE 8007

CMD ["uvicorn", "stretch_api:app", "--host", "0.0.0.0", "--port", "8007"]
