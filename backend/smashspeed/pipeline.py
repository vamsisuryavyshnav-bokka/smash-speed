"""End-to-end analysis. Reports genuine progress through `progress(stage, fraction, message)`."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Callable, Optional

import cv2
import numpy as np

from .detect import MotionDetector
from .measure import MIN_EFFECTIVE_FPS, CalibrationInput, Reference, calibrate, estimate_speed
from .track import find_smash
from .video import iter_frames, probe

STAGES = [
    ("processing", "Processing video"),
    ("detecting", "Detecting shuttlecock"),
    ("tracking", "Tracking shuttlecock movement"),
    ("identifying", "Identifying the smash"),
    ("calculating", "Calculating speed"),
    ("preparing", "Preparing results"),
]

ProgressFn = Callable[[str, float, str], None]
ANALYSIS_WIDTH = 1280


@dataclass
class AnalysisOptions:
    capture_fps: Optional[float] = None      # real capture rate if the file is slow-motion
    start_s: Optional[float] = None
    end_s: Optional[float] = None
    calibration: Optional[CalibrationInput] = None
    inspect_dir: Optional[str] = None        # where to write inspection frames
    extra: dict = field(default_factory=dict)


def options_from_json(d: dict, inspect_dir: Optional[str] = None) -> AnalysisOptions:
    cal = None
    c = d.get("calibration")
    if c and c.get("references"):
        refs = [Reference(tuple(r["p1"]), tuple(r["p2"]), float(r["distance_m"]), r.get("label", "Reference"))
                for r in c["references"]]
        cal = CalibrationInput(refs, float(c.get("camera_distance_m", 8.0)), float(c.get("plane_offset_m", 0.5)))
    f = lambda k: (float(d[k]) if d.get(k) not in (None, "") else None)  # noqa: E731
    return AnalysisOptions(capture_fps=f("capture_fps"), start_s=f("start_s"), end_s=f("end_s"),
                           calibration=cal, inspect_dir=inspect_dir)


def analyse(path: str, opts: AnalysisOptions, progress: ProgressFn = lambda *a: None) -> dict:
    progress("processing", 0.0, "Reading video metadata")
    info = probe(path)
    span = info.duration_s
    if opts.start_s is not None or opts.end_s is not None:
        span = (opts.end_s or info.duration_s) - (opts.start_s or 0.0)
    expected = max(1, int(span * info.container_fps))
    time_scale = 1.0
    effective_fps = info.container_fps
    if opts.capture_fps and opts.capture_fps > 0:
        time_scale = info.container_fps / opts.capture_fps
        effective_fps = opts.capture_fps
    progress("processing", 1.0, f"{info.frame_count} frames at {info.container_fps:.1f} fps")

    # --- detection (sliding window of 3 grayscale frames) ---
    det: Optional[MotionDetector] = None
    window: list[tuple[int, float, np.ndarray]] = []
    frames: list[tuple[int, float, list]] = []
    shape = None
    for i, fr in enumerate(iter_frames(path, ANALYSIS_WIDTH, opts.start_s, opts.end_s)):
        g = MotionDetector.preprocess(fr.image)
        if det is None:
            shape = g.shape
            det = MotionDetector(shape)
        window.append((fr.index, fr.t, g))
        if len(window) == 3:
            (_, _, a), (bi, bt, b), (_, _, c) = window
            frames.append((bi, bt, det.detect(a, b, c)))
            window.pop(0)
        if i % 10 == 0:
            progress("detecting", min(0.99, i / expected), f"Frame {i + 1} of ~{expected}")
    if det is None or shape is None or len(frames) < 5:
        raise ValueError("The selected clip is too short to analyse.")
    total_cands = sum(len(f[2]) for f in frames)
    progress("detecting", 1.0, f"{total_cands} motion candidates in {len(frames)} frames")

    # --- tracking & smash identification ---
    progress("tracking", 0.1, "Linking detections across frames")
    tr = find_smash(frames, shape, time_scale)
    progress("tracking", 1.0, f"{tr.tracks_considered} candidate trajectories")
    progress("identifying", 0.5, "Scoring trajectories")
    h, w = shape
    detection_rate = 0.0
    if tr.points:
        span_frames = tr.points[-1].frame - tr.points[0].frame + 1
        detection_rate = sum(1 for p in tr.points if not p.interpolated) / span_frames
    progress("identifying", 1.0, "Smash segment located" if tr.points else "No smash found")

    # --- calibration & speed ---
    progress("calculating", 0.2, "Applying calibration")
    cal = calibrate(opts.calibration, (w, h)) if opts.calibration else None
    speed = estimate_speed(tr.points, time_scale, effective_fps, cal, (w, h), detection_rate,
                           contact=tr.contact) if tr.points else None
    progress("calculating", 1.0, "Done")

    # --- inspection frames ---
    progress("preparing", 0.1, "Rendering inspection frames")
    inspect = []
    if tr.points and opts.inspect_dir:
        inspect = _render_inspection(path, opts, tr.points, frames, opts.inspect_dir)
    progress("preparing", 1.0, "Complete")

    status = speed.status if speed else ("insufficient_fps" if effective_fps < MIN_EFFECTIVE_FPS else "no_shuttle")
    messages = (speed.messages if speed else [tr.reason]) + info.notes
    return dict(
        status=status,
        video=info.to_dict() | dict(analysis_width=w, analysis_height=h),
        timing=dict(time_scale=time_scale, effective_fps=effective_fps, capture_fps_override=opts.capture_fps,
                    start_s=opts.start_s, end_s=opts.end_s),
        speed=speed.to_dict() if speed else None,
        calibration=cal.to_dict() if cal else None,
        track=dict(
            points=[dict(frame=p.frame, t=round(p.t, 6), x=round(p.x / w, 5), y=round(p.y / h, 5),
                         interpolated=p.interpolated) for p in tr.points],
            hit_frame=(tr.contact.frame if tr.contact else tr.points[0].frame) if tr.points else None,
            hit_t=(tr.contact.t if tr.contact else tr.points[0].t) if tr.points else None,
            hit_source="incoming-trajectory end" if tr.contact else "first smash detection",
            outliers_removed=tr.outliers_removed, gaps_interpolated=tr.gap_frames,
            trajectories_considered=tr.tracks_considered, detection_rate=round(detection_rate, 3),
        ),
        detector=dict(name="motion-3frame", neural_available=False),
        inspection=inspect,
        messages=[m for m in messages if m],
    )


def _render_inspection(path, opts, points, frames, out_dir, pad=8) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    first, last = points[0].frame - pad, points[-1].frame + pad
    by_frame = {p.frame: p for p in points}
    cands = {f[0]: f[2] for f in frames}
    out = []
    for fr in iter_frames(path, ANALYSIS_WIDTH, opts.start_s, opts.end_s):
        if fr.index < first:
            continue
        if fr.index > last:
            break
        img = fr.image.copy()
        for c in cands.get(fr.index, []):
            cv2.circle(img, (int(c.x), int(c.y)), 6, (160, 160, 160), 1, cv2.LINE_AA)
        trail = [p for p in points if p.frame <= fr.index]
        for a, b in zip(trail, trail[1:]):
            cv2.line(img, (int(a.x), int(a.y)), (int(b.x), int(b.y)), (40, 90, 230), 2, cv2.LINE_AA)
        p = by_frame.get(fr.index)
        if p is not None:
            col = (0, 200, 255) if p.interpolated else (40, 90, 230)
            cv2.circle(img, (int(p.x), int(p.y)), 11, col, 2, cv2.LINE_AA)
        name = f"f{fr.index:06d}.jpg"
        cv2.imwrite(os.path.join(out_dir, name), img, [cv2.IMWRITE_JPEG_QUALITY, 82])
        out.append(dict(frame=fr.index, t=round(fr.t, 6), file=name, tracked=p is not None,
                        interpolated=bool(p and p.interpolated)))
    return out
