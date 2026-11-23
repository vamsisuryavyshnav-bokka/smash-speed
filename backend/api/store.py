"""Tiny SQLite-backed store for uploads and analysis jobs (single process)."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY, filename TEXT, path TEXT, size INTEGER, created REAL,
  info TEXT, proxy_status TEXT, proxy_error TEXT
);
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY, upload_id TEXT, created REAL, updated REAL,
  status TEXT, stage TEXT, stage_progress REAL, message TEXT,
  options TEXT, result TEXT, error TEXT
);
"""


class Store:
    def __init__(self, path: str):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)
            # Jobs interrupted by a server restart can never finish.
            self._db.execute("UPDATE analyses SET status='failed', error='Server restarted during analysis.' "
                             "WHERE status IN ('queued','running')")
            self._db.commit()

    def _exec(self, sql: str, args: tuple = ()) -> None:
        with self._lock:
            self._db.execute(sql, args)
            self._db.commit()

    def _one(self, sql: str, args: tuple = ()) -> Optional[dict]:
        with self._lock:
            r = self._db.execute(sql, args).fetchone()
        return dict(r) if r else None

    # uploads
    def add_upload(self, id: str, filename: str, path: str, size: int, info: dict) -> None:
        self._exec("INSERT INTO uploads VALUES (?,?,?,?,?,?,?,?)",
                   (id, filename, path, size, time.time(), json.dumps(info), "pending", None))

    def set_proxy(self, id: str, status: str, error: Optional[str] = None) -> None:
        self._exec("UPDATE uploads SET proxy_status=?, proxy_error=? WHERE id=?", (status, error, id))

    def get_upload(self, id: str) -> Optional[dict]:
        r = self._one("SELECT * FROM uploads WHERE id=?", (id,))
        if r:
            r["info"] = json.loads(r["info"])
        return r

    # analyses
    def add_analysis(self, id: str, upload_id: str, options: dict) -> None:
        now = time.time()
        self._exec("INSERT INTO analyses VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                   (id, upload_id, now, now, "queued", None, 0.0, "Waiting for worker", json.dumps(options),
                    None, None))

    def update_analysis(self, id: str, **fields: Any) -> None:
        if "result" in fields and fields["result"] is not None:
            fields["result"] = json.dumps(fields["result"])
        fields["updated"] = time.time()
        cols = ", ".join(f"{k}=?" for k in fields)
        self._exec(f"UPDATE analyses SET {cols} WHERE id=?", (*fields.values(), id))

    def get_analysis(self, id: str) -> Optional[dict]:
        r = self._one("SELECT * FROM analyses WHERE id=?", (id,))
        if r:
            r["options"] = json.loads(r["options"] or "{}")
            r["result"] = json.loads(r["result"]) if r["result"] else None
        return r

    def list_analyses(self, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT a.id, a.created, a.status, a.result, u.filename FROM analyses a "
                "LEFT JOIN uploads u ON u.id=a.upload_id ORDER BY a.created DESC LIMIT ?", (limit,)).fetchall()
        out = []
        for r in rows:
            res = json.loads(r["result"]) if r["result"] else None
            sp = (res or {}).get("speed") or {}
            out.append(dict(id=r["id"], created=r["created"], status=r["status"], filename=r["filename"],
                            result_status=(res or {}).get("status"), peak_kmh=sp.get("peak_kmh"),
                            contact_kmh=(sp.get("contact") or {}).get("kmh"), avg_kmh=sp.get("avg_kmh"),
                            grade=(sp.get("reliability") or {}).get("grade")))
        return out
