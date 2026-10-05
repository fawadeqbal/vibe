# vibe-face: face measurements for selfie verification (internal network only).
# Models: OpenCV Zoo YuNet (MIT) + SFace (Apache-2.0), pinned by SHA-256.

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 FACE_MODEL_DIR=/models
WORKDIR /srv
COPY requirements.txt .
RUN pip install -r requirements.txt

FROM base AS models
ADD --chmod=644 --checksum=sha256:8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4 \
    https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx /models/
ADD --chmod=644 --checksum=sha256:0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79 \
    https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx /models/

# Runs the tests on the server's own CPU architecture before the image is made.
FROM base AS test
COPY requirements-test.txt .
RUN pip install -r requirements-test.txt
COPY --from=models /models /models
COPY app ./app
COPY tests ./tests
RUN python -m pytest -q -p no:warnings && touch /tests-passed

FROM base
COPY --from=models /models /models
COPY app ./app
COPY --from=test /tests-passed /tmp/tests-passed
RUN useradd --system --uid 10001 face
USER face
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
