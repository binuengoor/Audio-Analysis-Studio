import time
import asyncio
from typing import Dict, Any
from fastapi import APIRouter, HTTPException
import httpx

from config import (
    BPM_WORKER_URL,
    KEY_WORKER_URL,
    CHORD_WORKER_URL,
    QUALITY_WORKER_URL,
    STRUCTURE_WORKER_URL,
    DOWNLOADER_URL,
    STRETCH_WORKER_URL,
    REDIS_URL,
    logger,
)
from models import DownloaderVersionResponse, DownloaderUpdateResponse

router = APIRouter(tags=["Engine Management"])


async def _ping_worker(client: httpx.AsyncClient, name: str, base_url: str, port: int, engine: str) -> Dict[str, Any]:
    start = time.perf_counter()
    try:
        resp = await client.get(f"{base_url}/health", timeout=2.0)
        latency = round((time.perf_counter() - start) * 1000, 1)
        if resp.status_code == 200:
            return {
                "name": name,
                "status": "ok",
                "port": port,
                "latency_ms": latency,
                "engine": engine,
            }
        return {
            "name": name,
            "status": "error",
            "port": port,
            "latency_ms": latency,
            "engine": engine,
            "error": f"HTTP {resp.status_code}",
        }
    except Exception as e:
        latency = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name": name,
            "status": "error",
            "port": port,
            "latency_ms": latency,
            "engine": engine,
            "error": str(e),
        }


async def _ping_redis() -> Dict[str, Any]:
    start = time.perf_counter()
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(REDIS_URL, socket_timeout=2.0)
        pong = await r.ping()
        await r.aclose()
        latency = round((time.perf_counter() - start) * 1000, 1)
        if pong:
            return {
                "name": "Redis Task Broker",
                "status": "ok",
                "port": 6379,
                "latency_ms": latency,
                "engine": "Redis Queue & PubSub",
            }
        return {
            "name": "Redis Task Broker",
            "status": "error",
            "port": 6379,
            "latency_ms": latency,
            "engine": "Redis Queue & PubSub",
            "error": "No response",
        }
    except Exception as e:
        latency = round((time.perf_counter() - start) * 1000, 1)
        return {
            "name": "Redis Task Broker",
            "status": "error",
            "port": 6379,
            "latency_ms": latency,
            "engine": "Redis Queue & PubSub",
            "error": str(e),
        }


@router.get("/api/health/services")
async def get_all_services_health():
    """
    Polls the health and response latency of all 8 microservices and workers in the stack.
    """
    workers = [
        ("BeatNet BPM Worker", BPM_WORKER_URL, 8001, "BeatNet (DBN Beat & Downbeat)"),
        ("MusicalKeyCNN Key Worker", KEY_WORKER_URL, 8002, "MusicalKeyCNN (Deep Key & Camelot)"),
        ("Madmom Chord Worker", CHORD_WORKER_URL, 8003, "Madmom (CNN + CRF Chord Progression)"),
        ("WhatsMyBitrate Quality Worker", QUALITY_WORKER_URL, 8004, "WhatsMyBitrate & PyLoudNorm (LUFS & Cutoff)"),
        ("Laplacian Structure Worker", STRUCTURE_WORKER_URL, 8005, "Librosa Laplacian Agglomerative Segmentation"),
        ("yt-dlp Downloader Worker", DOWNLOADER_URL, 8006, "yt-dlp & FFmpeg Audio Stream Extractor"),
        ("Rubber Band Stretch Worker", STRETCH_WORKER_URL, 8007, "Rubber Band Library v4.0 (Pitch & Stretch)"),
    ]

    async with httpx.AsyncClient() as client:
        worker_tasks = [_ping_worker(client, name, url, port, engine) for name, url, port, engine in workers]
        results = await asyncio.gather(*worker_tasks, _ping_redis())

    healthy_count = sum(1 for r in results if r.get("status") == "ok")
    total_count = len(results)

    if healthy_count == total_count:
        overall_status = "healthy"
    elif healthy_count > 0:
        overall_status = "degraded"
    else:
        overall_status = "unhealthy"

    return {
        "status": overall_status,
        "healthy_count": healthy_count,
        "total_count": total_count,
        "services": results,
        "timestamp": time.time(),
    }


@router.get("/api/downloader/version", response_model=DownloaderVersionResponse)
async def get_downloader_engine_version():
    """Returns the current yt-dlp version, FFmpeg version, and cookies status from the downloader worker."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{DOWNLOADER_URL}/version")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail="Downloader worker error")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Downloader microservice unreachable: {str(e)}")


@router.post("/api/downloader/update", response_model=DownloaderUpdateResponse)
async def update_downloader_engine():
    """Triggers in-container upgrade of yt-dlp to hotfix any YouTube extractor changes."""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{DOWNLOADER_URL}/update-engine")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail="Downloader update failed")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Downloader microservice unreachable: {str(e)}")


@router.get("/api/stretch/version")
async def get_stretch_engine_version():
    """Returns the Rubber Band Library engine status and version from the stretch worker."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{STRETCH_WORKER_URL}/version")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail="Stretch worker error")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Stretch worker unreachable: {str(e)}")
