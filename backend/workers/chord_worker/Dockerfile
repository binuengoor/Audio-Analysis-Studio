FROM python:3.8-slim

WORKDIR /app

# Install system dependencies for madmom compilation and audio codecs
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    libopenblas-dev \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install pinned numpy and cython
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir "numpy<1.24" cython

# Install worker requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy API wrapper
COPY chord_api.py .

EXPOSE 8003

CMD ["uvicorn", "chord_api:app", "--host", "0.0.0.0", "--port", "8003"]
