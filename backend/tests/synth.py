"""Synthetic side-on smash clips with exact ground truth.

These validate the pipeline's maths and plumbing (timing, calibration, fitting).
They do NOT prove accuracy on real footage - real clips with an independent
reference speed are still required for that.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np

L = 6.8 ** 2 / 9.81


@dataclass
class Truth:
    v0_m_s: float
    hit_frame: int
    fps: float
    px_per_m: float
    post_top: tuple[int, int]
    post_bottom: tuple[int, int]
    size: tuple[int, int]

    def speed_at(self, t_after_hit: float) -> float:
        return self.v0_m_s / (1 + self.v0_m_s * t_after_hit / L)


def make_clip(path: str, v0_kmh: float = 300.0, fps: float = 240.0, write_fps: float | None = None,
              seconds: float = 0.6, w: int = 1280, h: int = 720, px_per_m: float = 150.0,
              angle_deg: float = 14.0, seed: int = 1, noise: float = 4.0) -> Truth:
    rng = np.random.default_rng(seed)
    n = int(seconds * fps)
    hit = int(0.25 * n)
    v0 = v0_kmh / 3.6
    floor_y = h - 90
    post_x = int(w * 0.62)
    post_top = (post_x, int(floor_y - 1.55 * px_per_m))
    post_bottom = (post_x, floor_y)
    hit_pt = np.array([w * 0.12, h * 0.22])
    direction = np.array([math.cos(math.radians(angle_deg)), math.sin(math.radians(angle_deg))])

    bg = np.full((h, w, 3), (52, 92, 60), np.uint8)
    bg[:] = bg + rng.integers(0, 6, (h, w, 1), dtype=np.uint8)
    cv2.rectangle(bg, (0, 0), (w, int(h * 0.35)), (70, 70, 74), -1)
    cv2.line(bg, (0, floor_y), (w, floor_y), (235, 235, 235), 3)
    cv2.line(bg, post_top, post_bottom, (225, 225, 225), 5)
    for yy in range(post_top[1], floor_y, 14):
        cv2.line(bg, (post_x - 3, yy), (post_x + 3, yy + 9), (30, 30, 30), 1)

    vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), write_fps or fps, (w, h))

    def pos(k: int) -> np.ndarray | None:
        if k < hit:  # incoming shuttle drifting down slowly toward the hit point
            dt = (hit - k) / fps
            return hit_pt + np.array([-1.5, -3.0]) * dt * px_per_m
        t = (k - hit) / fps
        s = L * math.log1p(v0 * t / L)
        return hit_pt + direction * s * px_per_m

    exposure = 0.5 / fps  # shutter open for half the frame interval -> motion blur streak
    for k in range(n):
        img = bg.copy()
        # a slowly moving "player" and swinging "racket" as distractors
        px = int(w * 0.10 + 25 * math.sin(k / fps * 6))
        cv2.ellipse(img, (px, h - 230), (55, 140), 0, 0, 360, (40, 40, 160), -1)
        ang = (k - hit) / fps * 900
        rx = int(px + 110 * math.cos(math.radians(ang - 60)))
        ry = int(h - 400 + 110 * math.sin(math.radians(ang - 60)))
        cv2.ellipse(img, (rx, ry), (22, 30), ang, 0, 360, (20, 20, 20), 4)
        p = pos(k)
        if k >= hit:
            t = (k - hit) / fps
            s_a = L * math.log1p(v0 * t / L)
            s_b = L * math.log1p(v0 * (t + exposure) / L)
            a = hit_pt + direction * s_a * px_per_m
            b = hit_pt + direction * s_b * px_per_m
            cv2.line(img, tuple(int(v) for v in a), tuple(int(v) for v in b), (245, 245, 245), 3, cv2.LINE_AA)
        elif p is not None:
            cv2.circle(img, tuple(int(v) for v in p), 3, (245, 245, 245), -1, cv2.LINE_AA)
        img = np.clip(img.astype(np.int16) + rng.normal(0, noise, img.shape).astype(np.int16), 0, 255)
        vw.write(img.astype(np.uint8))
    vw.release()
    return Truth(v0, hit, fps, px_per_m, post_top, post_bottom, (w, h))


def post_calibration(truth: Truth, offset_m: float = 0.0) -> dict:
    w, h = truth.size
    return dict(references=[dict(label="Net post height", distance_m=1.55,
                                 p1=[truth.post_top[0] / w, truth.post_top[1] / h],
                                 p2=[truth.post_bottom[0] / w, truth.post_bottom[1] / h])],
                camera_distance_m=8.0, plane_offset_m=offset_m)
