# Smash Speed

Badminton smash speed analysis from slow-motion video. Upload a clip, mark one court reference, and the backend detects and tracks the shuttlecock, fits a drag model of its flight, and reports contact, peak and average speed with 95% confidence intervals. It reports no number when the footage can't support one.

Created by Vyshnav.

```
frontend/   Next.js 15 · React 19 · TypeScript · Tailwind v4   (landing page, analyzer, results, history)
backend/    Python 3.12 · Flask · OpenCV · PyAV · SciPy        (API, job queue, CV pipeline)
  smashspeed/   framework-free pipeline: video → detect → track → measure
  api/          HTTP API + SQLite job store + background worker
  tests/        synthetic ground-truth clips + pipeline tests
  samples/      synthetic 300 km/h, 240 fps test clip
```

## Running locally

**Backend** (port 5000):

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m api.app
```

**Frontend** (port 3000):

```bash
cd frontend
npm install
npm run dev            # or: npm run build && npm start
```

Open http://localhost:3000. Optional environment variables:

| Variable | Where | Default |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | frontend | `http://localhost:5000` |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | frontend | `500` |
| `FRONTEND_ORIGIN` | backend (CORS) | `http://localhost:3000` |
| `SMASH_MAX_UPLOAD_MB` | backend | `500` |
| `SMASH_DATA_DIR` | backend | `backend/data` |

Tests: `cd backend && .venv/Scripts/python -m pytest -q`

Try it: upload `backend/samples/synthetic_300kmh_240fps.mp4` and click the top and bottom of the white net post (preset "Net post height", 1.55 m). The clip's true launch speed is 300 km/h.

## Filming for a reliable result

- Use slow motion: 240 fps is ideal and 120 fps is the minimum. Below 100 fps effective, the analysis declines to give a speed.
- Put the camera on a tripod, side-on to the smash direction, about 6–10 m from the flight path.
- Keep a known court feature in view (the net post is best) for calibration.
- Use good light and a plain background behind the shuttle's path.
- If your phone stores slow motion at 30 fps playback, enter the real capture rate in the analyzer.

## How the measurement works

1. **Timing.** Every frame's container presentation timestamp gives its time; a nominal FPS value is never used. A user-entered capture rate rescales time for slow-motion files.
2. **Detection** (`smashspeed/detect.py`). A three-frame difference `min(|fₜ−fₜ₋₁|, |fₜ₊₁−fₜ|)` with an adaptive threshold, followed by connected components filtered by size, width and fill. This keeps small, fast objects, including motion-blur streaks.
3. **Tracking** (`smashspeed/track.py`). Constant-velocity prediction with speed-dependent gating, global (Hungarian) assignment, and up to 3 missed frames. Tracks are split wherever velocity changes abruptly (racket contact), then scored as fast, straight and long. RANSAC removes outliers, the track is extended at its ends, and short gaps are interpolated and flagged.
4. **Contact point.** This is the end of the incoming shuttle's track, provided it lies on the smash line extended backwards.
5. **Calibration** (`smashspeed/measure.py`). Scale is metres-per-pixel from a reference of known length. Its uncertainty combines marking precision, disagreement between references, and reference-plane offset (offset ÷ camera distance).
6. **Speed.** Drag-dominated flight `dv/dt = −v²/L` gives `s(t) = s₀ + L·ln(1 + v₀t/L)`. The drag length L is fitted when the track is long enough, otherwise it is bounded by shuttle physics (terminal velocity 6.4–7.2 m/s).
   - **Peak observed** = v₀ at the first tracked point.
   - **Average** = distance ÷ elapsed time.
   - **Contact** = v₀·e^((s₀−s_c)/L), extrapolated to the contact point (at most 60 ms).
7. **Checks.** These statuses produce no speed: `insufficient_fps`, `calibration_required`, `no_shuttle`, and `implausible` (> world record). Warnings cover curved paths, changes in apparent size (motion towards the camera) and low detection rate. The reliability grade (A/B/C) is based on the headline figure's uncertainty.

## Feature status

| Feature | Status |
|---|---|
| Landing page (hero, intro, how it works, report, about, footer) | ✅ Functional |
| Scroll-controlled shuttle animation (desktop path, simplified on mobile, static with reduced motion) | ✅ Functional |
| Upload: drag & drop, browse, MP4/MOV/M4V, size check, real byte progress, cancel, preview, replace/remove | ✅ Functional |
| Trim range, capture-FPS override, calibration tool (presets, multiple references, drag/keyboard refine) | ✅ Functional |
| H.264 browser preview proxy (plays iPhone HEVC files) | ✅ Functional |
| Analysis job queue with real per-stage progress | ✅ Functional |
| Motion-based shuttle detection, tracking, smash and contact identification | ✅ Functional, validated on **synthetic** clips only |
| Calibration, drag-model speed, uncertainty propagation, refusal statuses | ✅ Functional, validated on **synthetic** clips only |
| Results dashboard: speed, replay with overlay, trajectory, speed chart, methodology, frame inspector | ✅ Functional |
| History, comparison, PDF report (browser print) | ✅ Functional |
| Automatic court/net detection for calibration | ❌ Not implemented: a manual reference is required |
| Neural (TrackNet-style) detector | ❌ Not implemented: interface stub in `detect.py` only |
| Validation on real footage against a radar or other reference | ❌ Not done: **needs real 240 fps clips** |
| Accounts, cloud storage, deployment | ❌ Not in scope yet |

**Measured accuracy so far (synthetic ground truth, 240 fps):** peak-observed speed is within about 2% of the truth and contact speed within 1–3% at 180, 300 and 400 km/h. All 95% intervals contain the true value. Real footage adds blur, lighting, clutter and perspective effects that the synthetic clips don't model, so treat these figures as upper bounds on accuracy until real validation is done.

## Credits

Hero photo: Muktasim Azlan on [Unsplash](https://unsplash.com/photos/badminton-player-jumping-on-indoor-court-rjWfNR_AC5g) (Unsplash License).
