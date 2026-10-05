"""Face measurements for Vibe's selfie verification.

The service measures, the API decides: for every image it finds the faces
(YuNet), describes the main one (head pose from the 5 landmarks, light,
sharpness, size) and turns it into an SFace embedding, then compares
embeddings. Thresholds and the pass/fail policy live in the backend
(face.provider.ts) so they can be tuned without rebuilding this image.

Models (OpenCV Zoo): YuNet 2023mar (MIT) and SFace 2021dec (Apache-2.0).
"""

from __future__ import annotations

import math
import threading
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

YUNET = "face_detection_yunet_2023mar.onnx"
SFACE = "face_recognition_sface_2021dec.onnx"

# Longest side images are scaled down to before detection (speed; phones send 12 MP).
MAX_SIDE = 1280
# Landmarks on small faces are too coarse for head pose (roll error ~9° at 100 px vs
# ~3° at 200 px, measured on LFW), so faces narrower than this are re-read from a zoomed crop.
MIN_POSE_FACE = 180
# A face counts as "another person" when it is at least this share of the main face's area
# (smaller ones are posters, photos on the wall, people far behind).
OTHER_FACE_AREA = 0.25


class BadImage(ValueError):
    """The bytes are not an image OpenCV can read."""


@dataclass
class Face:
    score: float
    box: list[float]  # x, y, w, h in the (scaled) image
    # Head pose from the landmarks, in the image as the camera saw it (not mirrored):
    # yaw > 0 = nose toward the image's right; roll > 0 = the image-right eye is lower (degrees).
    yaw: float
    roll: float
    brightness: float  # mean grey level of the face box, 0–255
    sharpness: float  # variance of the Laplacian of the aligned 112×112 face
    size: float  # face width / image width

    def report(self) -> dict:
        d = asdict(self)
        return {k: (round(v, 4) if isinstance(v, float) else [round(x, 1) for x in v] if isinstance(v, list) else v) for k, v in d.items()}


@dataclass
class Analysis:
    faces: int  # significant faces (see OTHER_FACE_AREA)
    face: Face | None  # the main (largest) face
    embedding: np.ndarray | None


def decode(data: bytes) -> np.ndarray:
    """JPEG/PNG/WebP bytes → BGR image, EXIF orientation applied, longest side ≤ MAX_SIDE."""
    buf = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR) if buf.size else None
    if img is None:
        raise BadImage("not an image")
    h, w = img.shape[:2]
    scale = MAX_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def pose(landmarks: np.ndarray) -> tuple[float, float]:
    """(yaw, roll) from YuNet's 5 points: 2 eyes, nose tip, 2 mouth corners.

    yaw: the nose's offset from the eye midpoint along the eye line, in eye distances
    (0 facing the camera, about ±0.3 for a clear head turn). A flat photo turned in
    front of the camera barely moves it, which is what makes turns a liveness signal.
    roll: the eye line's angle, in degrees.
    """
    p = landmarks.reshape(5, 2).astype(np.float64)
    a, b = sorted((p[0], p[1]), key=lambda e: e[0])  # image-left eye, image-right eye
    d = b - a
    dist = float(np.hypot(*d)) or 1.0
    u = d / dist
    nose = p[2]
    yaw = float(np.dot(nose - (a + b) / 2, u) / dist)
    roll = math.degrees(math.atan2(d[1], d[0]))
    return yaw, roll


class FaceEngine:
    """Thread-safe wrapper: the OpenCV detector keeps per-call state (input size)."""

    def __init__(self, model_dir: str | Path, score_threshold: float = 0.7):
        model_dir = Path(model_dir)
        self._det = cv2.FaceDetectorYN.create(str(model_dir / YUNET), "", (320, 320), score_threshold, 0.3, 50)
        self._rec = cv2.FaceRecognizerSF.create(str(model_dir / SFACE), "")
        self._lock = threading.Lock()

    def _detect(self, img: np.ndarray) -> np.ndarray | None:
        self._det.setInputSize((img.shape[1], img.shape[0]))
        _, found = self._det.detect(img)
        return found if found is not None and len(found) else None

    def _zoomed(self, img: np.ndarray, main: np.ndarray) -> tuple[np.ndarray, np.ndarray] | None:
        """The main face re-detected in an upscaled crop around it: (crop, detection)."""
        x, y, fw, fh = main[:4]
        cx, cy, half = x + fw / 2, y + fh / 2, max(fw, fh)  # a 2× box around the face
        x0, y0 = int(max(0, cx - half)), int(max(0, cy - half))
        x1, y1 = int(min(img.shape[1], cx + half)), int(min(img.shape[0], cy + half))
        k = (MIN_POSE_FACE * 1.25) / fw
        crop = cv2.resize(img[y0:y1, x0:x1], None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
        found = self._detect(crop)
        if found is None:
            return None
        return crop, found[int(np.argmax(found[:, 2] * found[:, 3]))]

    def analyse(self, img: np.ndarray) -> Analysis:
        h, w = img.shape[:2]
        with self._lock:
            found = self._detect(img)
            if found is None:
                return Analysis(faces=0, face=None, embedding=None)
            areas = found[:, 2] * found[:, 3]
            main = found[int(np.argmax(areas))]
            src, det = img, main
            if main[2] < MIN_POSE_FACE:
                zoomed = self._zoomed(img, main)
                if zoomed is not None:
                    src, det = zoomed
            crop = self._rec.alignCrop(src, det)
            emb = self._rec.feature(crop).copy()
        significant = int(np.sum(areas >= OTHER_FACE_AREA * areas.max()))
        x, y, fw, fh = (float(v) for v in main[:4])
        yaw, roll = pose(det[4:14])
        x0, y0 = max(0, int(x)), max(0, int(y))
        box = cv2.cvtColor(img[y0 : int(y + fh), x0 : int(x + fw)], cv2.COLOR_BGR2GRAY)
        grey = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        face = Face(
            score=float(main[14]),
            box=[x, y, fw, fh],
            yaw=yaw,
            roll=roll,
            brightness=float(box.mean()) if box.size else 0.0,
            sharpness=float(cv2.Laplacian(grey, cv2.CV_64F).var()),
            size=fw / w,
        )
        return Analysis(faces=significant, face=face, embedding=emb)

    def similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """SFace cosine similarity (OpenCV suggests ≥ 0.363 for the same person)."""
        with self._lock:
            return float(self._rec.match(a, b, cv2.FaceRecognizerSF_FR_COSINE))
