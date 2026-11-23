"""Multi-hypothesis tracking and smash-segment selection.

1. Every frame's candidates are associated to active tracks with a constant-velocity
   prediction and a speed-dependent gate (global assignment via the Hungarian
   method). Unmatched candidates seed new tracks; tracks survive up to MAX_MISS
   missed frames (motion blur, occlusion by the player or net).
2. Finished tracks are scored. A smash is fast, nearly straight and decelerating;
   bodies are slow, rackets are fast but short-lived and curved.
3. The chosen track is cleaned with RANSAC against a smooth quadratic motion model,
   extended a few frames at each end, and short gaps are interpolated (flagged).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy.optimize import linear_sum_assignment

from .detect import Candidate

MAX_MISS = 3
MIN_TRACK_POINTS = 5


@dataclass
class TrackPoint:
    frame: int
    t: float
    x: float
    y: float
    interpolated: bool = False
    area: float = 0.0
    length: float = 0.0


@dataclass
class Track:
    points: list[TrackPoint] = field(default_factory=list)
    misses: int = 0

    def velocity(self) -> np.ndarray | None:
        if len(self.points) < 2:
            return None
        a, b = self.points[-2], self.points[-1]
        dt = b.t - a.t
        if dt <= 0:
            return None
        return np.array([(b.x - a.x) / dt, (b.y - a.y) / dt])

    def predict(self, t: float) -> np.ndarray:
        p = np.array([self.points[-1].x, self.points[-1].y])
        v = self.velocity()
        if v is None:
            return p
        return p + v * (t - self.points[-1].t)


@dataclass
class TrackingResult:
    points: list[TrackPoint]
    candidates_per_frame: list[int]
    tracks_considered: int
    score: float
    outliers_removed: int
    gap_frames: int
    reason: str = ""
    contact: Optional[TrackPoint] = None


def build_tracks(frames: list[tuple[int, float, list[Candidate]]], diag: float,
                 min_points: int = MIN_TRACK_POINTS) -> list[Track]:
    active: list[Track] = []
    done: list[Track] = []
    seed_gate = 0.22 * diag
    big = 1e9
    for fidx, t, cands in frames:
        if active and cands:
            cost = np.full((len(active), len(cands)), big)
            for i, tr in enumerate(active):
                pred = tr.predict(t)
                v = tr.velocity()
                last = tr.points[-1]
                dt = max(t - last.t, 1e-6)
                if v is None:
                    gate, penalty = seed_gate, 0.25 * seed_gate
                else:
                    speed = float(np.hypot(*v))
                    gate = 0.04 * diag + 0.45 * speed * dt * (1 + tr.misses)
                    penalty = 0.0
                for j, c in enumerate(cands):
                    d = float(np.hypot(c.x - pred[0], c.y - pred[1]))
                    if d <= gate:
                        cost[i, j] = d + penalty
            rows, cols = linear_sum_assignment(cost)
            matched_t, matched_c = set(), set()
            for r, c in zip(rows, cols):
                if cost[r, c] >= big:
                    continue
                cd = cands[c]
                active[r].points.append(TrackPoint(fidx, t, cd.x, cd.y, False, cd.area, cd.length))
                active[r].misses = 0
                matched_t.add(r)
                matched_c.add(c)
        else:
            matched_t, matched_c = set(), set()
        still = []
        for i, tr in enumerate(active):
            if i not in matched_t:
                tr.misses += 1
            if tr.misses > MAX_MISS:
                done.append(tr)
            else:
                still.append(tr)
        active = still
        for j, c in enumerate(cands):
            if j not in matched_c:
                active.append(Track([TrackPoint(fidx, t, c.x, c.y, False, c.area, c.length)]))
    done.extend(active)
    return [tr for tr in done if len(tr.points) >= min_points]


def _track_features(tr: Track, diag: float) -> dict:
    p = np.array([[q.x, q.y] for q in tr.points])
    t = np.array([q.t for q in tr.points])
    seg = np.hypot(*np.diff(p, axis=0).T)
    dt = np.diff(t)
    sp = seg / np.maximum(dt, 1e-6)
    path = float(seg.sum())
    chord = float(np.hypot(*(p[-1] - p[0])))
    straight = chord / path if path > 0 else 0.0
    med_speed = float(np.median(sp)) / diag  # frame diagonals per second
    return dict(n=len(tr.points), straight=straight, med_speed=med_speed, chord=chord / diag)


def score_track(tr: Track, diag: float, time_scale: float = 1.0) -> float:
    f = _track_features(tr, diag)
    f["med_speed"] /= time_scale  # container seconds -> real seconds
    if f["med_speed"] < 1.0 or f["straight"] < 0.8 or f["chord"] < 0.12:
        return 0.0
    return f["med_speed"] * (f["straight"] ** 4) * np.log1p(f["n"]) * np.sqrt(f["chord"])


def _fit_quadratic(t: np.ndarray, v: np.ndarray) -> np.ndarray:
    deg = 2 if len(t) >= 4 else 1
    return np.polyfit(t, v, deg)


def ransac_clean(points: list[TrackPoint], diag: float, iters: int = 200,
                 rng: np.random.Generator | None = None) -> tuple[list[TrackPoint], int]:
    if len(points) < 6:
        return points, 0
    rng = rng or np.random.default_rng(0)
    t = np.array([q.t for q in points])
    x = np.array([q.x for q in points])
    y = np.array([q.y for q in points])
    tol = 0.012 * diag
    best = None
    for _ in range(iters):
        idx = rng.choice(len(points), 3, replace=False)
        try:
            px = np.polyfit(t[idx], x[idx], 2)
            py = np.polyfit(t[idx], y[idx], 2)
        except Exception:
            continue
        r = np.hypot(np.polyval(px, t) - x, np.polyval(py, t) - y)
        inl = r < tol
        if best is None or inl.sum() > best.sum():
            best = inl
    if best is None or best.sum() < 4:
        return points, 0
    kept = [q for q, k in zip(points, best) if k]
    return kept, int((~best).sum())


def extend_and_fill(points: list[TrackPoint], frames: list[tuple[int, float, list[Candidate]]],
                    diag: float) -> tuple[list[TrackPoint], int]:
    """Recover detections just outside the track ends, then interpolate interior gaps."""
    by_idx = {f[0]: f for f in frames}
    pts = sorted(points, key=lambda q: q.frame)
    tol = 0.02 * diag
    for direction in (-1, 1):
        for _ in range(4):
            ref = pts[0] if direction < 0 else pts[-1]
            fidx = ref.frame + direction
            if fidx not in by_idx:
                break
            _, t, cands = by_idx[fidx]
            tt = np.array([q.t for q in pts])
            px = _fit_quadratic(tt, np.array([q.x for q in pts]))
            py = _fit_quadratic(tt, np.array([q.y for q in pts]))
            pred = np.array([np.polyval(px, t), np.polyval(py, t)])
            best = min(cands, key=lambda c: np.hypot(c.x - pred[0], c.y - pred[1]), default=None)
            if best is None or np.hypot(best.x - pred[0], best.y - pred[1]) > tol:
                break
            np_ = TrackPoint(fidx, t, best.x, best.y, False, best.area, best.length)
            if direction < 0:
                pts.insert(0, np_)
            else:
                pts.append(np_)
    # interpolate interior gaps (<= MAX_MISS frames) with a local quadratic fit
    filled: list[TrackPoint] = []
    gaps = 0
    tt = np.array([q.t for q in pts])
    px = _fit_quadratic(tt, np.array([q.x for q in pts]))
    py = _fit_quadratic(tt, np.array([q.y for q in pts]))
    for a, b in zip(pts, pts[1:]):
        filled.append(a)
        for missing in range(a.frame + 1, b.frame):
            if missing in by_idx and b.frame - a.frame - 1 <= MAX_MISS:
                t = by_idx[missing][1]
                filled.append(TrackPoint(missing, t, float(np.polyval(px, t)), float(np.polyval(py, t)), True))
                gaps += 1
    filled.append(pts[-1])
    return filled, gaps


def split_at_events(tr: Track, diag: float) -> list[Track]:
    """Split a track wherever its velocity changes abruptly (racket contact, a bounce,
    or a mis-association onto another object). The shuttle between contacts moves
    smoothly: drag only slows it, gravity bends it gently."""
    pts = tr.points
    if len(pts) < 3:
        return [tr]
    segs: list[list[TrackPoint]] = [[pts[0], pts[1]]]
    prev_v = None
    for a, b in zip(pts, pts[1:]):
        dt = b.t - a.t
        v = np.array([(b.x - a.x) / dt, (b.y - a.y) / dt]) if dt > 0 else np.zeros(2)
        if prev_v is not None and b is not segs[-1][-1]:
            sp_a, sp_b = float(np.hypot(*prev_v)), float(np.hypot(*v))
            slow = 0.6 * diag  # below this (diag/s) direction noise dominates; don't split on angle
            cosang = float(prev_v @ v / (sp_a * sp_b)) if sp_a > 0 and sp_b > 0 else 1.0
            ratio = (sp_b + 1e-6) / (sp_a + 1e-6)
            if (ratio > 2.2 or ratio < 0.4) or (max(sp_a, sp_b) > slow and cosang < 0.8):
                segs.append([a, b])
                prev_v = v
                continue
            segs[-1].append(b)
        prev_v = v
    return [Track(s) for s in segs]


def find_smash(frames: list[tuple[int, float, list[Candidate]]], frame_shape: tuple[int, int],
               time_scale: float = 1.0) -> TrackingResult:
    h, w = frame_shape
    diag = float(np.hypot(w, h))
    counts = [len(f[2]) for f in frames]
    raw = build_tracks(frames, diag, min_points=3)
    segments = [seg for tr in raw for seg in split_at_events(tr, diag)]
    tracks = [s for s in segments if len(s.points) >= MIN_TRACK_POINTS]
    scored = sorted(((score_track(tr, diag, time_scale), tr) for tr in tracks), key=lambda s: s[0], reverse=True)
    if not scored or scored[0][0] <= 0:
        return TrackingResult([], counts, len(tracks), 0.0, 0, 0,
                              reason="No fast, straight shuttle trajectory was found in this clip.")
    score, best = scored[0]
    clean, removed = ransac_clean(best.points, diag)
    final, gaps = extend_and_fill(clean, frames, diag)
    contact = find_contact(final, segments, diag)
    return TrackingResult(final, counts, len(tracks), float(score), removed, gaps, contact=contact)


def find_contact(smash: list[TrackPoint], segments: list[Track], diag: float,
                 max_frames_before: int = 15) -> Optional[TrackPoint]:
    """The racket-contact point is where the incoming shuttle's path ends and the
    smash path begins. Look for a slower segment that ends shortly before the smash
    is first seen, close to the smash line extended backwards."""
    meas = [p for p in smash if not p.interpolated]
    if len(meas) < 3:
        return None
    p0 = np.array([meas[0].x, meas[0].y])
    d = np.array([meas[-1].x, meas[-1].y]) - p0
    n = float(np.hypot(*d))
    if n == 0:
        return None
    u = d / n
    best, best_err = None, None
    for seg in segments:
        last = seg.points[-1]
        if not (0 < meas[0].frame - last.frame <= max_frames_before):
            continue
        if any(q is last for q in smash):
            continue
        rel = np.array([last.x, last.y]) - p0
        along = float(rel @ u)
        perp = abs(float(rel[0] * u[1] - rel[1] * u[0]))
        if along >= 0 or perp > 0.03 * diag or -along > 0.35 * diag:
            continue
        if best_err is None or perp < best_err:
            best, best_err = last, perp
    return best
