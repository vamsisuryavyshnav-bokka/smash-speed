"""Calibration (pixels -> metres) and speed estimation.

Calibration model (side-on capture):
    The camera looks roughly perpendicular to the smash direction. A reference of
    known length (court markings, net post) that lies in - or near - the vertical
    plane the shuttle flies in gives a scale in metres per pixel *for that plane*.
    Uncertainty components, all reported separately:
      * click precision on the reference endpoints,
      * disagreement between multiple references (if more than one),
      * plane offset: a reference d metres in front of/behind the flight plane, with
        the camera Z metres away, scales lengths by ~d/Z (sign unknown -> +-).
    Motion toward/away from the camera is invisible in one view; the measured 2D
    speed is therefore a lower bound with respect to that component.

Speed model:
    A shuttlecock is dominated by aerodynamic drag at smash speeds:
        dv/dt = -v^2 / L,   L = v_t^2 / g   (v_t = terminal velocity ~6.8 m/s)
    which gives distance travelled  s(t) = L ln(1 + v0 t / L).
    Fitting s(t) to the tracked distances yields v0, the speed at the first tracked
    point (the peak we can observe), plus its standard error. The average speed
    over the tracked interval is reported separately and is always lower.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, field
from typing import Optional

import numpy as np
from scipy.optimize import curve_fit

G = 9.81
TERMINAL_VELOCITY = 6.8                # m/s, feather & synthetic shuttles: ~6.5-7.0
L_DRAG = TERMINAL_VELOCITY ** 2 / G    # ~4.7 m
MIN_EFFECTIVE_FPS = 100.0
WORLD_RECORD_KMH = 565.0
CLICK_SIGMA_NORM = 0.003               # assumed click precision, fraction of frame size


@dataclass
class Reference:
    p1: tuple[float, float]   # normalised [0..1] image coordinates
    p2: tuple[float, float]
    distance_m: float
    label: str = "Reference"


@dataclass
class CalibrationInput:
    references: list[Reference]
    camera_distance_m: float = 8.0     # camera -> flight plane
    plane_offset_m: float = 0.5        # reference plane vs flight plane (abs)


@dataclass
class Calibration:
    method: str
    scale_m_per_px: float
    rel_sigma_click: float
    rel_sigma_spread: float
    rel_sigma_plane: float
    references: list[dict]
    warnings: list[str] = field(default_factory=list)

    @property
    def rel_sigma(self) -> float:
        return float(np.sqrt(self.rel_sigma_click ** 2 + self.rel_sigma_spread ** 2 + self.rel_sigma_plane ** 2))

    def to_dict(self) -> dict:
        d = asdict(self)
        d["rel_sigma_total"] = self.rel_sigma
        return d


def calibrate(inp: CalibrationInput, frame_wh: tuple[int, int]) -> Calibration:
    w, h = frame_wh
    diag = float(np.hypot(w, h))
    scales, rels, refs, warns = [], [], [], []
    for r in inp.references:
        if r.distance_m <= 0:
            raise ValueError("Reference distance must be positive.")
        dx = (r.p2[0] - r.p1[0]) * w
        dy = (r.p2[1] - r.p1[1]) * h
        px = float(np.hypot(dx, dy))
        if px < 0.02 * diag:
            raise ValueError(f"Reference '{r.label}' is too short in the image to be measured reliably.")
        if px < 0.08 * diag:
            warns.append(f"Reference '{r.label}' spans only {px:.0f} px; a longer reference improves accuracy.")
        sigma_px = np.sqrt(2) * CLICK_SIGMA_NORM * diag
        scales.append(r.distance_m / px)
        rels.append(sigma_px / px)
        refs.append(dict(label=r.label, distance_m=r.distance_m, length_px=round(px, 2),
                         p1=list(r.p1), p2=list(r.p2)))
    if not scales:
        raise ValueError("At least one reference is required.")
    scales_a = np.array(scales)
    wts = 1.0 / np.array(rels) ** 2
    scale = float(np.sum(scales_a * wts) / wts.sum())
    rel_click = float(1.0 / np.sqrt(wts.sum()))
    rel_spread = float(np.std(scales_a, ddof=1) / scale) if len(scales) > 1 else 0.0
    if rel_spread > 0.1:
        warns.append(f"References disagree by {rel_spread * 100:.0f}%; check that they lie in the same plane.")
    if inp.camera_distance_m <= 0:
        raise ValueError("Camera distance must be positive.")
    rel_plane = float(abs(inp.plane_offset_m) / inp.camera_distance_m)
    return Calibration("reference_scale", scale, rel_click, rel_spread, rel_plane, refs, warns)


def _s_model(t, s0, v0, L):
    return s0 + L * np.log1p(np.maximum(v0 * t / L, -0.999))


@dataclass
class SpeedResult:
    status: str
    peak_kmh: Optional[float] = None
    peak_ci_kmh: Optional[tuple[float, float]] = None
    avg_kmh: Optional[float] = None
    distance_m: Optional[float] = None
    elapsed_s: Optional[float] = None
    interval: Optional[tuple[float, float]] = None   # container timestamps
    fit: dict = field(default_factory=dict)
    contact: Optional[dict] = None
    uncertainty: dict = field(default_factory=dict)
    series: list[dict] = field(default_factory=list)
    reliability: dict = field(default_factory=dict)
    messages: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _fit(t: np.ndarray, s: np.ndarray, L: float) -> tuple[float, float, float, float]:
    v_guess = max((s[-1] - s[0]) / max(t[-1] - t[0], 1e-6), 1e-6)
    popt, pcov = curve_fit(lambda tt, s0, v0: _s_model(tt, s0, v0, L), t, s, p0=[0.0, v_guess * 1.2],
                           maxfev=10000)
    s0, v0 = (float(v) for v in popt)
    sig = float(np.sqrt(max(pcov[1, 1], 0)))
    rms = float(np.sqrt(np.mean((s - _s_model(t, s0, v0, L)) ** 2)))
    return s0, v0, sig, rms


L_BOUNDS = (2.5, 8.0)  # m; generous around the physical 4.2-5.3 m range


def _fit_free_L(t: np.ndarray, s: np.ndarray) -> tuple[float, float, float, float, float, float]:
    """Fit s0, v0 and the drag length L jointly. Only identifiable when the track
    covers a distance comparable to L (the speed must visibly decay)."""
    v_guess = max((s[-1] - s[0]) / max(t[-1] - t[0], 1e-6), 1e-6)
    popt, pcov = curve_fit(_s_model, t, s, p0=[0.0, v_guess * 1.2, L_DRAG],
                           bounds=([-np.inf, 0, L_BOUNDS[0]], [np.inf, 300, L_BOUNDS[1]]), maxfev=20000)
    s0, v0, L = (float(v) for v in popt)
    sig_v0 = float(np.sqrt(max(pcov[1, 1], 0)))
    sig_L = float(np.sqrt(max(pcov[2, 2], 0)))
    rms = float(np.sqrt(np.mean((s - _s_model(t, s0, v0, L)) ** 2)))
    return s0, v0, L, sig_v0, sig_L, rms


def _contact_speed(t, s_px, scale, L, contact_px) -> tuple[float, float, float]:
    """Returns (v_contact, v_first, dt_extrapolated) for given scale and drag length."""
    s = s_px * scale
    s0, v0, _, _ = _fit(t, s, L)
    sc = contact_px * scale
    vc = v0 * float(np.exp((s0 - sc) / L))
    dtc = (L / v0) * (1 - float(np.exp((sc - s0) / L)))  # time from contact to first point
    return vc, v0, dtc


def estimate_speed(points: list, time_scale: float, effective_fps: float,
                   cal: Optional[Calibration], frame_wh: tuple[int, int],
                   detection_rate: float, contact=None) -> SpeedResult:
    """points: TrackPoint list in analysis pixels; time_scale converts container
    seconds to real seconds (1.0 unless a slow-motion capture rate was given)."""
    msgs: list[str] = []
    meas = [p for p in points if not p.interpolated]
    if effective_fps < MIN_EFFECTIVE_FPS:
        return SpeedResult("insufficient_fps", messages=[
            f"Effective capture rate is {effective_fps:.0f} fps. At smash speeds the shuttle moves more than "
            f"{83 / effective_fps:.1f} m between frames, so the speed cannot be measured reliably. "
            f"Record at 120 fps or higher (240 fps slow motion is ideal)."])

    if len(meas) < 5:
        return SpeedResult("no_shuttle", messages=["Too few shuttle detections to measure a speed."])

    t0c = meas[0].t
    t = np.array([(p.t - t0c) * time_scale for p in meas])
    xy = np.array([[p.x, p.y] for p in meas])
    seg = np.hypot(*np.diff(xy, axis=0).T)
    path = float(seg.sum())
    chord = np.hypot(*(xy - xy[0]).T)
    straight = float(chord[-1] / path) if path > 0 else 0.0
    s_px = chord if straight >= 0.97 else np.concatenate([[0.0], np.cumsum(seg)])

    # Depth-motion heuristic: a shuttle flying toward/away from the camera changes apparent size.
    areas = np.array([max(p.area, 1.0) for p in meas])
    k = max(2, len(areas) // 4)
    size_ratio = float(np.median(areas[-k:]) / np.median(areas[:k]))

    # Fit in pixel units first (calibration only rescales).
    scale = cal.scale_m_per_px if cal else None
    if scale is None:
        msgs.append("No calibration supplied: the track is shown in pixels and no km/h value is reported.")
    s = s_px * scale if scale else s_px
    L = L_DRAG if scale else 1e12  # without metres the drag length is unknown -> near-linear model
    fit_ok = True
    L_free, sig_L = False, None
    try:
        s0, v0, sig_v0, rms = _fit(t, s, L)
        if scale and (s[-1] - s[0]) >= 2.0 and len(t) >= 10:
            s0f, v0f, Lf, sv0f, sLf, rmsf = _fit_free_L(t, s)
            # accept only if L is pinned down (decay clearly visible) and physically sensible
            if L_BOUNDS[0] < Lf < L_BOUNDS[1] and sLf / Lf < 0.15:
                s0, v0, L, sig_v0, sig_L, rms, L_free = s0f, v0f, Lf, sv0f, sLf, rmsf, True
    except Exception:
        fit_ok = False
        v0 = max((s[-1] - s[0]) / max(t[-1] - t[0], 1e-6), 1e-6)
        sig_v0, s0, rms = v0 * 0.2, 0.0, float("nan")
        msgs.append("Drag-model fit failed; using the interval average only.")

    # Racket-contact extrapolation: v(s) = v0 exp(-(s - s0)/L), evaluated at the contact
    # point's position along the smash line (behind the first tracked point).
    contact_px = None
    if contact is not None:
        u = (xy[-1] - xy[0]) / max(np.hypot(*(xy[-1] - xy[0])), 1e-9)
        contact_px = float((np.array([contact.x, contact.y]) - xy[0]) @ u)  # negative

    elapsed = float(t[-1] - t[0])
    dist = float(s[-1] - s[0])
    avg = dist / elapsed if elapsed > 0 else 0.0

    # Per-interval speeds for the chart.
    series = []
    for i in range(1, len(t)):
        dtt = t[i] - t[i - 1]
        if dtt <= 0:
            continue
        series.append(dict(t=float((t[i] + t[i - 1]) / 2), v=float((s[i] - s[i - 1]) / dtt),
                           model=float(v0 / (1 + v0 * ((t[i] + t[i - 1]) / 2) / L)) if fit_ok else None))

    if not scale:
        return SpeedResult("calibration_required", distance_m=None, elapsed_s=elapsed,
                           interval=(meas[0].t, meas[-1].t),
                           fit=dict(model="near-linear (pixels)", v0_px_s=v0, rms_px=rms, straightness=straight),
                           series=series, messages=msgs)

    rel_fit = sig_v0 / v0 if v0 > 0 else 1.0
    # Sensitivity to the drag length (terminal velocity 6.4-7.2 m/s across shuttle types).
    # When L was fitted, its uncertainty is already inside sig_v0 (joint covariance);
    # otherwise propagate the physical range of L by refitting at its bounds.
    if L_free:
        L_lo, L_hi = L - sig_L, L + sig_L
        rel_L = 0.0
    else:
        L_lo, L_hi = 6.4 ** 2 / G, 7.2 ** 2 / G
        try:
            rel_L = abs(_fit(t, s, L_hi)[1] - _fit(t, s, L_lo)[1]) / 2 / v0
        except Exception:
            rel_L = 0.0
    rel_total = float(np.sqrt(rel_fit ** 2 + cal.rel_sigma ** 2 + rel_L ** 2))
    peak = v0 * 3.6
    ci = (peak * (1 - 1.96 * rel_total), peak * (1 + 1.96 * rel_total))

    contact_res = None
    if contact_px is not None and fit_ok:
        try:
            vc, _, dtc = _contact_speed(t, s_px, scale, L, contact_px)
            if 0 < dtc <= 0.06:
                a = _contact_speed(t, s_px, scale, L_lo, contact_px)[0]
                b = _contact_speed(t, s_px, scale, L_hi, contact_px)[0]
                c1 = _contact_speed(t, s_px, scale * (1 - cal.rel_sigma), L, contact_px)[0]
                c2 = _contact_speed(t, s_px, scale * (1 + cal.rel_sigma), L, contact_px)[0]
                rel_c = float(np.sqrt(rel_fit ** 2 + (abs(b - a) / 2 / vc) ** 2 + (abs(c2 - c1) / 2 / vc) ** 2))
                ck = vc * 3.6
                contact_res = dict(kmh=round(ck, 1),
                                   ci_kmh=[round(ck * (1 - 1.96 * rel_c), 1), round(ck * (1 + 1.96 * rel_c), 1)],
                                   extrapolated_s=round(dtc, 5),
                                   extrapolated_m=round(-contact_px * scale, 3),
                                   contact_t=contact.t, contact_frame=contact.frame,
                                   contact_xy=[contact.x / frame_wh[0], contact.y / frame_wh[1]],
                                   rel_sigma=round(rel_c, 4))
                if ck > WORLD_RECORD_KMH * 1.05:
                    contact_res = None
                    msgs.append("Contact-speed extrapolation exceeded physical limits and was discarded.")
        except Exception:
            contact_res = None

    warnings = list(cal.warnings)
    if straight < 0.9:
        warnings.append("The tracked path is noticeably curved; distances were measured along the path.")
    if size_ratio > 2.5 or size_ratio < 0.4:
        warnings.append("The shuttle's apparent size changes strongly along the track, which suggests motion "
                        "toward or away from the camera. Speed in that direction is not captured.")
    if detection_rate < 0.7:
        warnings.append(f"The shuttle was detected in only {detection_rate * 100:.0f}% of frames in the segment.")

    if peak > WORLD_RECORD_KMH * 1.05:
        return SpeedResult("implausible", messages=[
            f"The computed speed ({peak:.0f} km/h) exceeds the world record (~{WORLD_RECORD_KMH:.0f} km/h). "
            "This usually means the capture frame rate or the calibration reference is wrong."],
            series=series, fit=dict(v0_m_s=v0))

    # Grade the figure the user sees first: the contact estimate when present, else the peak.
    rel_headline = contact_res["rel_sigma"] if contact_res else rel_total
    if rel_headline <= 0.08 and detection_rate >= 0.85 and len(meas) >= 8 and len(warnings) == 0:
        grade = "A"
    elif rel_headline <= 0.15 and len(meas) >= 6:
        grade = "B"
    else:
        grade = "C"

    return SpeedResult(
        status="ok",
        peak_kmh=round(peak, 1),
        peak_ci_kmh=(round(ci[0], 1), round(ci[1], 1)),
        avg_kmh=round(avg * 3.6, 1),
        distance_m=round(dist, 3),
        elapsed_s=round(elapsed, 5),
        interval=(meas[0].t, meas[-1].t),
        fit=dict(model="s(t) = s0 + L ln(1 + v0 t / L)", L_m=round(L, 3), L_fitted=L_free,
                 L_sigma_m=round(sig_L, 3) if sig_L is not None else None, v0_m_s=round(v0, 3),
                 v0_sigma_m_s=round(sig_v0, 3), rms_residual_m=round(rms, 4), straightness=round(straight, 4),
                 points_used=len(meas)),
        contact=contact_res,
        uncertainty=dict(rel_fit=round(rel_fit, 4), rel_drag=round(rel_L, 4),
                         rel_calibration_click=round(cal.rel_sigma_click, 4),
                         rel_calibration_spread=round(cal.rel_sigma_spread, 4),
                         rel_calibration_plane=round(cal.rel_sigma_plane, 4), rel_total=round(rel_total, 4),
                         interval="95% (1.96 sigma), excludes out-of-plane motion"),
        series=series,
        reliability=dict(grade=grade, graded_on="contact" if contact_res else "peak",
                         rel_sigma_graded=round(rel_headline, 4), detection_rate=round(detection_rate, 3), size_ratio=round(size_ratio, 2),
                         warnings=warnings),
        messages=msgs,
    )
