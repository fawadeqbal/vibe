# vibe-face — selfie verification checks

A small internal service (container `vibe-face`) that measures faces for Vibe's selfie verification. It runs next to the API on the private `vibe-internal` network; nothing is published to the internet. The API is its only client.

```
app / web ──frames──▶ vibe-api ──POST /analyze (profile photo + frames)──▶ vibe-face
                         │  decides (face.provider.ts)                        measures
                         ▼
             badge · staff review · a reason to retry
```

**It measures, the API decides.** For each image it finds the faces (YuNet), describes the main one (head pose from 5 landmarks, light, sharpness, size) and compares SFace embeddings. Thresholds and the pass/fail policy live in `backend/src/modules/users/verification/face.provider.ts` and `liveness.ts`, so tuning needs no rebuild here.

## The check

1. The app asks the API for a **challenge**: a front-facing photo, then 2 random moves — always one head **turn** (left/right) plus one more (the other turn or a **tilt**). It must be answered once, within 5 minutes.
2. The app shows each instruction with a 3-second countdown and takes a frame automatically.
3. The API sends the profile photo and the frames here, then checks:
   - one clear, front-facing face first (light, sharpness, size);
   - every move done, measured against the person's own front frame (turn: nose moves ≥ 0.15 eye-widths along the eye line ≈ 17°; tilt: ≥ 12°). A printed photo or another screen can be tilted but can't turn its head, which is why every challenge has a turn. Mirrored cameras are accepted (all moves flipped at once);
   - the same face in every frame (cosine ≥ 0.25);
   - the face matches the profile photo: **≥ 0.40 → badge, 0.30–0.40 → staff review, below → rejected** (`FACE_MATCH_APPROVE`, `FACE_MATCH_REVIEW`).
4. If this service is down, the attempt goes to staff review (admin → Verifications) instead of failing.

## API

`POST /analyze` — multipart: `reference` (optional, the profile photo) and `frames` (1–6 images, front first). Answer:

```json
{
  "reference": { "faces": 1, "face": { "score": 0.94, "box": [..], "yaw": 0.02, "roll": 1.3, "brightness": 121, "sharpness": 150, "size": 0.38 } },
  "frames": [ { "faces": 1, "face": { ... } }, ... ],
  "similarity": { "toReference": [0.81, 0.74, 0.69], "toFirst": [1, 0.78, 0.71] }
}
```

`yaw` > 0 = nose toward the image's right; `roll` > 0 = the image-right eye is lower (degrees), in the camera's own (unmirrored) view. `GET /health` → `{"ok": true}`.

## Numbers behind the thresholds (LFW, 400 people)

| | |
| --- | --- |
| Same person, two different news photos | 98.3 % score ≥ 0.40 (median 0.68) |
| Different people | 0 % ≥ 0.40, 1 % ≥ 0.30 (99th percentile 0.29) |
| Landmark noise, faces ≥ 180 px | yaw ±0.07, roll ±6° (90th percentile); smaller faces are re-read from a zoomed crop |
| Sharp vs blurred faces | sharpness ≥ 76 vs ≤ 32 → blurry below 30 |
| Normal vs dark light | brightness ≥ 94 vs ≤ 38 → too dark below 50 |

Real selfies (phone camera, same day as the profile photo) score higher than LFW news photos. An end-to-end run on the container stack: the real person 0.81 (approved), a different person 0.00 (rejected), a still photo rejected for the missed turn; ~0.2 s per check, ~170 MB RAM.

## Models

OpenCV Zoo, downloaded at build time and pinned by SHA-256 in the Dockerfile:
- YuNet face detector 2023mar — MIT
- SFace face recognizer 2021dec — Apache-2.0

Both allow commercial use. (InsightFace's popular models do not, which is why they aren't used.)

## Develop

```bash
cd apps/vibe/face
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt
mkdir -p models   # download the two .onnx files listed in the Dockerfile into it
FACE_MODEL_DIR=models pytest -q
FACE_MODEL_DIR=models uvicorn app.main:app --port 8090   # then FACE_SERVICE_URL=http://localhost:8090 in backend/.env
```

The Docker build runs the tests on the server's own CPU (x86 or ARM) before it makes the image.
