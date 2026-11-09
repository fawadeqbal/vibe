"""Nudity score for one image: the chance (0–1) that it is sexual / explicit.

Model: AdamCodd/vit-base-nsfw-detector (ViT-B/16 at 384 px, Apache-2.0),
dynamically quantised to int8 by its author. Labels: 0 = sfw, 1 = nsfw.
Preprocessing matches its ViTFeatureExtractor: RGB, bilinear resize to
384×384 (no crop), scale to 0–1, normalise with mean 0.5 / std 0.5.

It measures, the API decides: thresholds live in the backend
(NSFW_BLOCK / NSFW_REVIEW), so tuning needs no rebuild here.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

MODEL = "nsfw_vit_base_2024_int8.onnx"
SIZE = 384


class NsfwEngine:
    def __init__(self, model_dir: str | Path, threads: int = 0):
        import onnxruntime as ort  # imported here so /analyze still loads if the wheel is missing

        opts = ort.SessionOptions()
        if threads > 0:
            opts.intra_op_num_threads = threads
        self._sess = ort.InferenceSession(str(Path(model_dir) / MODEL), opts, providers=["CPUExecutionProvider"])
        self._input = self._sess.get_inputs()[0].name

    @staticmethod
    def preprocess(img: np.ndarray) -> np.ndarray:
        if img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        x = cv2.resize(rgb, (SIZE, SIZE), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255.0
        x = (x - 0.5) / 0.5
        return x.transpose(2, 0, 1)[None]

    def score(self, img: np.ndarray) -> float:
        logits = self._sess.run(None, {self._input: self.preprocess(img)})[0][0].astype(np.float64)
        p = np.exp(logits - logits.max())
        return float(p[1] / p.sum())
