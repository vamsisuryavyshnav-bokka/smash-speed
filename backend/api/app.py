"""Smash Speed HTTP API.

Run:  python -m api.app   (from the backend/ folder)
"""
from __future__ import annotations

import os
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor

import cv2
from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

from smashspeed import STAGES, analyse, options_from_json
from smashspeed.video import frame_at, make_browser_proxy, probe

from .store import Store

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get("SMASH_DATA_DIR", os.path.join(BASE, "data"))
UPLOADS = os.path.join(DATA, "uploads")
ANALYSES = os.path.join(DATA, "analyses")
ALLOWED_EXT = {".mp4", ".mov", ".m4v"}
MAX_MB = int(os.environ.get("SMASH_MAX_UPLOAD_MB", "500"))
STAGE_WEIGHTS = {"processing": 0.05, "detecting": 0.6, "tracking": 0.1, "identifying": 0.05,
                 "calculating": 0.05, "preparing": 0.15}

os.makedirs(UPLOADS, exist_ok=True)
os.makedirs(ANALYSES, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024
CORS(app, origins=os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000").split(","))
store = Store(os.path.join(DATA, "smashspeed.db"))
analysis_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")
proxy_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="proxy")


def err(status: int, message: str, code: str = "error"):
    return jsonify(error=dict(code=code, message=message)), status


@app.errorhandler(RequestEntityTooLarge)
def too_large(_e):
    return err(413, f"The file is larger than {MAX_MB} MB. Trim the clip to the smash and try again.", "too_large")


@app.errorhandler(HTTPException)
def http_error(e: HTTPException):
    return err(e.code or 500, e.description or "Request failed.", e.name.lower().replace(" ", "_"))


@app.get("/api/health")
def health():
    return jsonify(ok=True, stages=[dict(key=k, label=l) for k, l in STAGES], max_upload_mb=MAX_MB)


# ---------------------------------------------------------------- uploads
def _upload_json(u: dict) -> dict:
    return dict(id=u["id"], filename=u["filename"], size=u["size"], info=u["info"],
                proxy_status=u["proxy_status"], proxy_error=u["proxy_error"],
                video_url=f"/api/uploads/{u['id']}/video" if u["proxy_status"] == "ready" else None)


def _build_proxy(upload_id: str, src: str) -> None:
    store.set_proxy(upload_id, "processing")
    try:
        make_browser_proxy(src, os.path.join(UPLOADS, upload_id, "proxy.mp4"))
        store.set_proxy(upload_id, "ready")
    except Exception as e:  # noqa: BLE001
        store.set_proxy(upload_id, "failed", str(e))


@app.post("/api/uploads")
def create_upload():
    f = request.files.get("file")
    if f is None or not f.filename:
        return err(400, "No video file was received.", "no_file")
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        return err(415, "Unsupported format. Please upload an MP4, MOV or M4V video.", "unsupported_format")
    uid = uuid.uuid4().hex[:12]
    folder = os.path.join(UPLOADS, uid)
    os.makedirs(folder)
    path = os.path.join(folder, "source" + ext)
    f.save(path)
    try:
        info = probe(path).to_dict()
    except Exception as e:  # noqa: BLE001
        return err(422, f"This file could not be read as a video ({e}).", "unreadable")
    store.add_upload(uid, f.filename, path, os.path.getsize(path), info)
    proxy_pool.submit(_build_proxy, uid, path)
    return jsonify(_upload_json(store.get_upload(uid))), 201


@app.get("/api/uploads/<uid>")
def get_upload(uid: str):
    u = store.get_upload(uid) or abort(404, "Upload not found.")
    return jsonify(_upload_json(u))


@app.get("/api/uploads/<uid>/video")
def upload_video(uid: str):
    u = store.get_upload(uid) or abort(404, "Upload not found.")
    if u["proxy_status"] != "ready":
        abort(409, "The browser preview is still being prepared.")
    return send_file(os.path.join(UPLOADS, uid, "proxy.mp4"), mimetype="video/mp4", conditional=True)


@app.get("/api/uploads/<uid>/frame")
def upload_frame(uid: str):
    """A still frame (JPEG) used for calibration; decoded server-side so it works
    even for codecs the browser cannot play (e.g. HEVC)."""
    u = store.get_upload(uid) or abort(404, "Upload not found.")
    t = float(request.args.get("t", 0))
    img, ts = frame_at(u["path"], t)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        abort(500, "Could not encode frame.")
    resp = app.response_class(buf.tobytes(), mimetype="image/jpeg")
    resp.headers["X-Frame-Time"] = f"{ts:.6f}"
    resp.headers["Access-Control-Expose-Headers"] = "X-Frame-Time"
    return resp


# ---------------------------------------------------------------- analyses
def _run(aid: str, upload_path: str, options: dict) -> None:
    def progress(stage: str, frac: float, message: str) -> None:
        store.update_analysis(aid, status="running", stage=stage, stage_progress=float(frac), message=message)

    try:
        opts = options_from_json(options, inspect_dir=os.path.join(ANALYSES, aid, "frames"))
        result = analyse(upload_path, opts, progress)
        store.update_analysis(aid, status="done", stage="preparing", stage_progress=1.0, message="Complete",
                              result=result)
    except ValueError as e:
        store.update_analysis(aid, status="failed", error=str(e), message="Analysis stopped")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        store.update_analysis(aid, status="failed", error=f"Unexpected error: {e}", message="Analysis stopped")


def _validate_options(d: dict) -> dict:
    out: dict = {}
    for k in ("capture_fps", "start_s", "end_s"):
        v = d.get(k)
        if v not in (None, ""):
            try:
                out[k] = float(v)
            except (TypeError, ValueError):
                abort(400, f"'{k}' must be a number.")
    if out.get("capture_fps") is not None and not (15 <= out["capture_fps"] <= 2000):
        abort(400, "Capture frame rate must be between 15 and 2000 fps.")
    if out.get("start_s") is not None and out.get("end_s") is not None and out["end_s"] - out["start_s"] < 0.05:
        abort(400, "The selected range is too short.")
    cal = d.get("calibration")
    if cal:
        refs = cal.get("references") or []
        if not refs:
            abort(400, "Calibration needs at least one reference.")
        for r in refs:
            try:
                p1, p2, dist = r["p1"], r["p2"], float(r["distance_m"])
                assert len(p1) == 2 and len(p2) == 2 and dist > 0
                assert all(0 <= float(v) <= 1 for v in (*p1, *p2))
            except Exception:
                abort(400, "Each calibration reference needs two points (0-1 coordinates) and a positive distance.")
        out["calibration"] = dict(
            references=[dict(p1=[float(v) for v in r["p1"]], p2=[float(v) for v in r["p2"]],
                             distance_m=float(r["distance_m"]), label=str(r.get("label", "Reference"))[:60])
                        for r in refs],
            camera_distance_m=float(cal.get("camera_distance_m", 8.0)),
            plane_offset_m=float(cal.get("plane_offset_m", 0.5)))
    return out


@app.post("/api/analyses")
def create_analysis():
    d = request.get_json(silent=True) or {}
    u = store.get_upload(str(d.get("upload_id", ""))) or abort(404, "Upload not found.")
    opts = _validate_options(d)
    aid = uuid.uuid4().hex[:12]
    store.add_analysis(aid, u["id"], opts)
    analysis_pool.submit(_run, aid, u["path"], opts)
    return jsonify(id=aid), 202


def _overall(a: dict) -> float:
    if a["status"] == "done":
        return 1.0
    keys = [k for k, _ in STAGES]
    if not a["stage"] or a["stage"] not in keys:
        return 0.0
    i = keys.index(a["stage"])
    done = sum(STAGE_WEIGHTS[k] for k in keys[:i])
    return min(0.999, done + STAGE_WEIGHTS[a["stage"]] * (a["stage_progress"] or 0))


@app.get("/api/analyses/<aid>")
def get_analysis(aid: str):
    a = store.get_analysis(aid) or abort(404, "Analysis not found.")
    u = store.get_upload(a["upload_id"])
    return jsonify(
        id=a["id"], status=a["status"], stage=a["stage"], stage_progress=a["stage_progress"],
        progress=_overall(a), message=a["message"], error=a["error"], created=a["created"],
        options=a["options"], result=a["result"],
        stages=[dict(key=k, label=l) for k, l in STAGES],
        upload=_upload_json(u) if u else None,
    )


@app.get("/api/analyses")
def list_analyses():
    return jsonify(items=store.list_analyses())


@app.get("/api/analyses/<aid>/frames/<name>")
def analysis_frame(aid: str, name: str):
    if not name.endswith(".jpg") or "/" in name or ".." in name:
        abort(404)
    return send_from_directory(os.path.join(ANALYSES, aid, "frames"), name, mimetype="image/jpeg")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), threaded=True, debug=False)
