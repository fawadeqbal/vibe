"""Run with: FACE_MODEL_DIR=models pytest -q (the Dockerfile runs them at build time)."""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.analysis import pose
from app.main import app

FIX = "tests/fixtures/"
client = TestClient(app)


def jpg(img: np.ndarray) -> bytes:
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tobytes()


@pytest.fixture(scope="module")
def face() -> np.ndarray:
    return cv2.imread(FIX + "astronaut.jpg")


def analyze(frames, reference=None):
    files = [("frames", (f"f{i}.jpg", b, "image/jpeg")) for i, b in enumerate(frames)]
    if reference is not None:
        files.append(("reference", ("r.jpg", reference, "image/jpeg")))
    return client.post("/analyze", files=files)


def rotate(img, deg):
    h, w = img.shape[:2]
    return cv2.warpAffine(img, cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0), (w, h))


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_same_person_matches_across_frames(face):
    r = analyze([jpg(face), jpg(rotate(face, -15)), jpg(cv2.flip(face, 1))], reference=jpg(face)).json()
    assert [f["faces"] for f in r["frames"]] == [1, 1, 1]
    assert r["similarity"]["toFirst"][0] == pytest.approx(1, abs=1e-3)
    assert min(r["similarity"]["toReference"]) > 0.6
    q = r["frames"][0]["face"]
    assert q["score"] > 0.8 and 60 < q["brightness"] < 220 and q["sharpness"] > 50 and 0.1 < q["size"] < 0.9


def test_tilting_changes_roll_and_mirroring_flips_pose(face):
    r = analyze([jpg(face), jpg(rotate(face, -20)), jpg(rotate(face, 20)), jpg(cv2.flip(face, 1))]).json()
    base, cw, ccw, mirror = (f["face"] for f in r["frames"])
    # Turning the picture clockwise on screen lowers the image-right eye: roll goes up.
    assert cw["roll"] - base["roll"] == pytest.approx(20, abs=7)
    assert ccw["roll"] - base["roll"] == pytest.approx(-20, abs=7)
    assert mirror["yaw"] == pytest.approx(-base["yaw"], abs=0.1)
    assert mirror["roll"] == pytest.approx(-base["roll"], abs=6)


def test_pose_maths():
    # Eyes level, nose under the midpoint: facing the camera.
    yaw, roll = pose(np.array([100, 100, 200, 100, 150, 150, 120, 190, 180, 190], dtype=np.float32))
    assert yaw == pytest.approx(0) and roll == pytest.approx(0)
    # Nose 30% of an eye distance toward the image's right.
    yaw, roll = pose(np.array([100, 100, 200, 100, 180, 150, 120, 190, 180, 190], dtype=np.float32))
    assert yaw == pytest.approx(0.3) and roll == pytest.approx(0)
    # Image-right eye 10 px lower; eye order in the array doesn't matter.
    yaw, roll = pose(np.array([200, 110, 100, 100, 150, 155, 120, 190, 180, 190], dtype=np.float32))
    assert roll == pytest.approx(5.71, abs=0.01)


def test_counts_people(face):
    two = np.hstack([face, face])
    r = analyze([jpg(two), open(FIX + "no-face.jpg", "rb").read()]).json()
    assert r["frames"][0]["faces"] == 2
    assert r["frames"][1] == {"faces": 0, "face": None}
    assert r["similarity"]["toFirst"][1] is None


def test_small_faces_are_zoomed_for_pose(face):
    # ~90 px wide, like a phone held far away (LFW-sized faces); below 180 px the pose is re-read zoomed.
    small = cv2.resize(face, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    r = analyze([jpg(small), jpg(rotate(small, -20))]).json()
    a, b = (f["face"] for f in r["frames"])
    assert a["box"][2] < 180
    assert b["roll"] - a["roll"] == pytest.approx(20, abs=7)


def test_rejects_bad_input(face):
    assert analyze([b"not an image"]).status_code == 400
    assert analyze([jpg(face)] * 7).status_code == 400
    assert client.post("/analyze", files=[]).status_code == 422
