import os

import pytest

from smashspeed import analyse, options_from_json
from smashspeed.measure import CalibrationInput, Reference, calibrate, estimate_speed
from smashspeed.track import TrackPoint

from .synth import L, make_clip, post_calibration


def _truth_at_first_point(truth, res):
    t_first = res["speed"]["interval"][0]
    return truth.speed_at(t_first - truth.hit_frame / truth.fps) * 3.6


@pytest.mark.parametrize("v0_kmh", [180.0, 300.0, 400.0])
def test_synthetic_240fps(tmp_path, v0_kmh):
    path = os.path.join(tmp_path, "clip.mp4")
    truth = make_clip(path, v0_kmh=v0_kmh)
    res = analyse(path, options_from_json(dict(calibration=post_calibration(truth))))
    assert res["status"] == "ok", res["messages"]
    expect = _truth_at_first_point(truth, res)
    peak = res["speed"]["peak_kmh"]
    assert abs(peak - expect) / expect < 0.05, (peak, expect)
    lo, hi = res["speed"]["peak_ci_kmh"]
    assert lo <= expect <= hi
    assert res["speed"]["avg_kmh"] < peak
    c = res["speed"]["contact"]
    if c is not None:  # contact found -> extrapolated speed should recover the true launch speed
        assert abs(c["kmh"] - v0_kmh) / v0_kmh < 0.08, (c, v0_kmh)
        assert c["ci_kmh"][0] <= v0_kmh <= c["ci_kmh"][1]


def test_slowmo_container_with_capture_override(tmp_path):
    path = os.path.join(tmp_path, "slowmo.mp4")
    truth = make_clip(path, v0_kmh=300.0, fps=240.0, write_fps=30.0)
    raw = analyse(path, options_from_json(dict(calibration=post_calibration(truth))))
    assert raw["status"] == "insufficient_fps"  # 30 fps container, no override -> refuse
    res = analyse(path, options_from_json(dict(capture_fps=240, calibration=post_calibration(truth))))
    assert res["status"] == "ok"
    t_first = (res["speed"]["interval"][0]) * res["timing"]["time_scale"]
    expect = truth.speed_at(t_first - truth.hit_frame / truth.fps) * 3.6
    assert abs(res["speed"]["peak_kmh"] - expect) / expect < 0.05


def test_low_fps_refused(tmp_path):
    path = os.path.join(tmp_path, "lowfps.mp4")
    truth = make_clip(path, v0_kmh=250.0, fps=60.0, seconds=1.0)
    res = analyse(path, options_from_json(dict(calibration=post_calibration(truth))))
    assert res["status"] in ("insufficient_fps", "no_shuttle")
    assert res["speed"] is None or res["speed"]["peak_kmh"] is None


def test_no_calibration_reports_no_kmh(tmp_path):
    path = os.path.join(tmp_path, "clip.mp4")
    make_clip(path, v0_kmh=300.0)
    res = analyse(path, options_from_json({}))
    assert res["status"] == "calibration_required"
    assert res["speed"]["peak_kmh"] is None


def test_estimate_speed_exact_model():
    import math
    v0, fps, s_px = 80.0, 240.0, 100.0
    pts = [TrackPoint(i, i / fps, 50 + s_px * L * math.log1p(v0 * (i / fps) / L), 300.0, False, 10, 4)
           for i in range(20)]
    cal = calibrate(CalibrationInput([Reference((0, 0.5), (100 / 1280, 0.5), 1.0)], 8.0, 0.0), (1280, 720))
    r = estimate_speed(pts, 1.0, fps, cal, (1280, 720), 1.0)
    assert r.status == "ok"
    assert abs(r.peak_kmh - v0 * 3.6) < 1.0


def test_plane_offset_widens_interval():
    a = calibrate(CalibrationInput([Reference((0.1, 0.5), (0.6, 0.5), 3.0)], 8.0, 0.0), (1280, 720))
    b = calibrate(CalibrationInput([Reference((0.1, 0.5), (0.6, 0.5), 3.0)], 8.0, 1.0), (1280, 720))
    assert b.rel_sigma > a.rel_sigma
    assert abs(b.rel_sigma_plane - 0.125) < 1e-9
