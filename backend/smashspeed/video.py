"""Video probing and decoding.

Timestamps come from the container's presentation timestamps (PTS), never from a
nominal FPS value. Slow-motion phone clips are often stored with a playback rate
(e.g. 30 fps) lower than the capture rate (e.g. 240 fps); in that case real time
elapsed between frames is the stored delta multiplied by playback/capture.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, field
from fractions import Fraction
from typing import Iterator, Optional

import av
import numpy as np


@dataclass
class VideoInfo:
    width: int
    height: int
    rotation: int
    codec: str
    frame_count: int
    duration_s: float
    container_fps: float          # median fps derived from PTS deltas
    nominal_fps: float            # what the container header claims
    variable_frame_rate: bool
    slowmo_hint: bool             # metadata suggests slow-motion capture
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _rotation(stream) -> int:
    try:
        rot = stream.metadata.get("rotate")
        if rot is not None:
            return int(rot) % 360
    except Exception:
        pass
    try:  # PyAV >= 13 exposes display-matrix side data via frame.rotation
        return 0
    except Exception:
        return 0


def probe(path: str) -> VideoInfo:
    """Read every packet's PTS (cheap: no decoding) to get true frame timing."""
    with av.open(path) as c:
        if not c.streams.video:
            raise ValueError("File contains no video stream.")
        s = c.streams.video[0]
        tb = s.time_base
        pts = []
        for pkt in c.demux(s):
            if pkt.pts is not None and pkt.size > 0:
                pts.append(pkt.pts)
        nominal = float(s.average_rate or s.guessed_rate or 0)
        meta = {k.lower(): str(v).lower() for k, v in (c.metadata or {}).items()}
        meta.update({k.lower(): str(v).lower() for k, v in (s.metadata or {}).items()})
        info_codec = s.codec_context.name
        width, height = s.codec_context.width, s.codec_context.height
        rotation = _rotation(s)

    if len(pts) < 2:
        raise ValueError("Video is too short to analyse.")
    t = np.sort(np.array(pts, dtype=np.float64)) * float(tb)
    d = np.diff(t)
    d = d[d > 0]
    med = float(np.median(d))
    fps = 1.0 / med if med > 0 else nominal
    vfr = bool(np.std(d) / med > 0.15) if med > 0 else False
    notes: list[str] = []
    slowmo = any("slow" in k or "slow" in v for k, v in meta.items()) or "com.apple.quicktime.full-frame-rate-playback-intent" in meta
    if vfr:
        notes.append("Variable frame rate detected; per-frame timestamps are used.")
    if slowmo:
        notes.append("Container metadata mentions slow motion; confirm the capture frame rate.")
    if fps < 100:
        notes.append(
            f"Stored frame rate is {fps:.0f} fps. If this clip was recorded in slow motion, "
            "enter the capture frame rate; otherwise the shuttle moves too far between frames for a reliable speed."
        )
    return VideoInfo(
        width=width, height=height, rotation=rotation, codec=info_codec,
        frame_count=len(pts), duration_s=float(t[-1] - t[0] + med),
        container_fps=round(fps, 3), nominal_fps=round(nominal, 3),
        variable_frame_rate=vfr, slowmo_hint=slowmo, notes=notes,
    )


@dataclass
class Frame:
    index: int
    t: float          # container timestamp (s) of this frame, relative to first frame
    image: np.ndarray  # BGR, possibly downscaled


def iter_frames(path: str, max_width: int = 1280, start_s: Optional[float] = None,
                end_s: Optional[float] = None) -> Iterator[Frame]:
    """Decode frames (auto-rotated) with container timestamps."""
    with av.open(path) as c:
        s = c.streams.video[0]
        s.thread_type = "AUTO"
        t0 = None
        idx = 0
        for f in c.decode(s):
            if f.pts is None:
                continue
            ts = float(f.pts * s.time_base)
            if t0 is None:
                t0 = ts
            rel = ts - t0
            if start_s is not None and rel < start_s - 1e-6:
                idx += 1
                continue
            if end_s is not None and rel > end_s + 1e-6:
                break
            img = f.to_ndarray(format="bgr24")
            rot = getattr(f, "rotation", 0) or 0
            img = _apply_rotation(img, rot)
            h, w = img.shape[:2]
            if w > max_width:
                scale = max_width / w
                img = _resize(img, scale)
            yield Frame(index=idx, t=rel, image=img)
            idx += 1


def _apply_rotation(img: np.ndarray, rot: int) -> np.ndarray:
    rot = int(rot) % 360
    if rot in (90, -270):
        return np.ascontiguousarray(np.rot90(img, 1))
    if rot in (270, -90):
        return np.ascontiguousarray(np.rot90(img, 3))
    if rot in (180, -180):
        return np.ascontiguousarray(img[::-1, ::-1])
    return img


def _resize(img: np.ndarray, scale: float) -> np.ndarray:
    import cv2
    return cv2.resize(img, (int(round(img.shape[1] * scale)), int(round(img.shape[0] * scale))),
                      interpolation=cv2.INTER_AREA)


def frame_at(path: str, t_s: float, max_width: int = 1600) -> tuple[np.ndarray, float]:
    """Return the decoded frame nearest to t_s (relative seconds) and its timestamp."""
    best = None
    for fr in iter_frames(path, max_width=max_width, start_s=max(0.0, t_s - 0.5)):
        if best is None or abs(fr.t - t_s) < abs(best.t - t_s):
            best = fr
        if fr.t > t_s:
            break
    if best is None:
        raise ValueError("Could not decode a frame at that time.")
    return best.image, best.t


def make_browser_proxy(src: str, dst: str, max_width: int = 1280) -> None:
    """Transcode to H.264/MP4 with identical frame timing so any browser can play it
    and overlay timestamps line up with analysis timestamps."""
    with av.open(src) as inp:
        s = inp.streams.video[0]
        s.thread_type = "AUTO"
        out = av.open(dst, mode="w")
        try:
            ostream = None
            t0 = None
            for f in inp.decode(s):
                if f.pts is None:
                    continue
                img = _apply_rotation(f.to_ndarray(format="rgb24"), getattr(f, "rotation", 0) or 0)
                if img.shape[1] > max_width:
                    img = _resize(img, max_width / img.shape[1])
                h, w = img.shape[:2]
                w2, h2 = w - (w % 2), h - (h % 2)
                img = np.ascontiguousarray(img[:h2, :w2])
                if ostream is None:
                    ostream = out.add_stream("libx264", rate=Fraction(1000, 1))
                    ostream.width, ostream.height = w2, h2
                    ostream.pix_fmt = "yuv420p"
                    ostream.time_base = Fraction(1, 90000)
                    ostream.codec_context.time_base = Fraction(1, 90000)
                    ostream.options = {"crf": "21", "preset": "veryfast", "movflags": "+faststart"}
                ts = float(f.pts * s.time_base)
                if t0 is None:
                    t0 = ts
                vf = av.VideoFrame.from_ndarray(img, format="rgb24")
                vf.pts = int(round((ts - t0) * 90000))
                vf.time_base = Fraction(1, 90000)
                for pkt in ostream.encode(vf):
                    out.mux(pkt)
            if ostream is not None:
                for pkt in ostream.encode():
                    out.mux(pkt)
        finally:
            out.close()
