"""vibe-face: the HTTP side of face measurements (internal network only).

POST /analyze   multipart: `reference` (optional, the profile photo) and `frames`
                (1–6 selfie frames, the first one looking straight at the camera).
                Returns per-image face reports and the similarities the API needs.
GET  /health    200 once the models are loaded.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, File, HTTPException, UploadFile

from .analysis import Analysis, BadImage, FaceEngine, decode

MAX_FRAMES = 6
MAX_BYTES = int(os.environ.get("FACE_MAX_BYTES", 8 * 1024 * 1024))

app = FastAPI(title="vibe-face", docs_url=None, redoc_url=None, openapi_url=None)
engine = FaceEngine(os.environ.get("FACE_MODEL_DIR", "/models"))


def _read(upload: UploadFile, what: str) -> Analysis:
    data = upload.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"{what} is larger than {MAX_BYTES} bytes")
    try:
        return engine.analyse(decode(data))
    except BadImage:
        raise HTTPException(400, f"{what} is not an image") from None


def _report(a: Analysis) -> dict:
    return {"faces": a.faces, "face": a.face.report() if a.face else None}


@app.get("/health")
def health() -> dict:
    return {"ok": True}


# Plain `def`: FastAPI runs it in its thread pool, so OpenCV work doesn't block the loop.
@app.post("/analyze")
def analyze(frames: list[UploadFile] = File(...), reference: UploadFile | None = File(None)) -> dict:
    if not 1 <= len(frames) <= MAX_FRAMES:
        raise HTTPException(400, f"send 1–{MAX_FRAMES} frames")
    ref = _read(reference, "reference") if reference is not None else None
    shots = [_read(f, f"frame {i}") for i, f in enumerate(frames)]

    first = shots[0].embedding
    to_first = [round(engine.similarity(first, s.embedding), 4) if first is not None and s.embedding is not None else None for s in shots]
    to_ref = None
    if ref is not None and ref.embedding is not None:
        to_ref = [round(engine.similarity(ref.embedding, s.embedding), 4) if s.embedding is not None else None for s in shots]
    return {
        "reference": _report(ref) if ref is not None else None,
        "frames": [_report(s) for s in shots],
        # Cosine similarity (SFace): same person usually ≥ 0.4, different people rarely above 0.3.
        "similarity": {"toReference": to_ref, "toFirst": to_first},
    }
