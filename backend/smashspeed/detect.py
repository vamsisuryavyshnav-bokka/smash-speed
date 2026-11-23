"""Shuttlecock candidate detection.

Primary detector (implemented): motion-based. A three-frame difference
min(|f_t - f_t-1|, |f_t+1 - f_t|) isolates objects that are at a *new* place in
frame t (no ghost from where they were), which suits a small, fast shuttle that is
often a blurred streak. Connected components are filtered by size and shape.
This produces several candidates per frame (players, rackets also move); the
tracker picks the physically consistent fast trajectory.

Optional detector (interface only): a TrackNet-style heatmap network. It is not
bundled because its weights must be downloaded separately and licence-checked;
see `NeuralDetector`.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Candidate:
    x: float          # px, analysis resolution
    y: float
    area: float
    length: float     # major-axis length (streak length) px
    width: float
    angle: float      # streak orientation, radians
    strength: float   # mean motion intensity
    w: int = 0
    h: int = 0


class MotionDetector:
    def __init__(self, frame_shape: tuple[int, int]):
        h, w = frame_shape
        diag = float(np.hypot(w, h))
        # Size bounds scale with resolution. A shuttle (6.5 cm cork-skirt length ~ 9 cm)
        # spans only a few pixels in a court-wide view; a blurred one can be a long thin streak.
        self.min_area = max(3.0, (diag / 1470.0) ** 2 * 4)
        self.max_area = (diag / 1470.0) ** 2 * 1800
        self.max_width = max(6.0, diag / 1470.0 * 22)
        self.kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

    @staticmethod
    def preprocess(img: np.ndarray) -> np.ndarray:
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return cv2.GaussianBlur(g, (3, 3), 0)

    def detect(self, prev: np.ndarray, cur: np.ndarray, nxt: np.ndarray) -> list[Candidate]:
        d1 = cv2.absdiff(cur, prev)
        d2 = cv2.absdiff(nxt, cur)
        m = cv2.min(d1, d2)
        # Adaptive threshold: robust to global brightness/noise level (flicker, ISO noise).
        noise = float(np.median(m)) + 1.0
        thr = max(14.0, noise * 6.0)
        _, mask = cv2.threshold(m, thr, 255, cv2.THRESH_BINARY)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, self.kernel)
        n, labels, stats, cents = cv2.connectedComponentsWithStats(mask, connectivity=8)
        out: list[Candidate] = []
        for i in range(1, n):
            area = float(stats[i, cv2.CC_STAT_AREA])
            if area < self.min_area or area > self.max_area:
                continue
            x0, y0, bw, bh = (int(stats[i, k]) for k in (cv2.CC_STAT_LEFT, cv2.CC_STAT_TOP,
                                                         cv2.CC_STAT_WIDTH, cv2.CC_STAT_HEIGHT))
            ys, xs = np.nonzero(labels[y0:y0 + bh, x0:x0 + bw] == i)
            if len(xs) >= 3:
                pts = np.stack([xs, ys], 1).astype(np.float32)
                cov = np.cov(pts.T) + np.eye(2) * 1e-3
                evals, evecs = np.linalg.eigh(cov)
                length = 4.0 * float(np.sqrt(max(evals[1], 0)))
                width = 4.0 * float(np.sqrt(max(evals[0], 0)))
                angle = float(np.arctan2(evecs[1, 1], evecs[0, 1]))
            else:
                length, width, angle = float(max(bw, bh)), float(min(bw, bh)), 0.0
            if width > self.max_width:
                continue  # blobs that are wide in both axes are bodies/rackets, not a shuttle
            fill = area / max(1.0, bw * bh)
            if fill < 0.12 and area > 40:
                continue  # sparse, ragged blobs (cloth, hair) rather than a compact object
            strength = float(m[y0:y0 + bh, x0:x0 + bw][labels[y0:y0 + bh, x0:x0 + bw] == i].mean())
            cx, cy = cents[i]
            out.append(Candidate(float(cx), float(cy), area, length, width, angle, strength, bw, bh))
        # Keep the strongest few to bound tracker cost in busy scenes.
        out.sort(key=lambda c: c.strength * np.sqrt(c.area), reverse=True)
        return out[:25]


class NeuralDetector:  # pragma: no cover - not bundled
    """Placeholder for a TrackNetV3-style heatmap detector.

    Status: NOT IMPLEMENTED. Plug-in point: `detect(frames3) -> list[Candidate]`.
    The pipeline falls back to MotionDetector when this is unavailable.
    """

    available = False

    def __init__(self, *_, **__):
        raise RuntimeError("Neural detector weights are not installed.")
