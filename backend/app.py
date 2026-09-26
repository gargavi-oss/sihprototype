import base64
import csv
import io
import json
import os
import pickle
import re
import shutil
from datetime import date, datetime, timedelta
from functools import wraps

import numpy as np
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_file, send_from_directory, session
from flask_cors import CORS

load_dotenv()

from agent.pipeline import run_simulate_pipeline, run_solve_pipeline  # noqa: E402
from models import (  # noqa: E402
    DEPARTMENTS, BlockPlan, CoaDelay, CoaTimetable, CoaUpload, User, db, seed_users,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
os.makedirs(INSTANCE_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY", "railopt-dev-secret-change-me")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
)
CORS(app, supports_credentials=True)

app.config["UPLOAD_FOLDER"] = os.path.join(BASE_DIR, "uploads")
app.config["DEMO_DATA_FOLDER"] = os.path.join(BASE_DIR, "demo_data")
app.config["SOLVER_DIR"] = os.path.abspath(os.path.join(BASE_DIR, "..", "solver_workspace"))


def _sqlite(name):
    return "sqlite:///" + os.path.join(INSTANCE_DIR, name).replace("\\", "/")


# One database per department (see models.py)
app.config["SQLALCHEMY_DATABASE_URI"] = _sqlite("core.db")
app.config["SQLALCHEMY_BINDS"] = {
    "tms": _sqlite("tms.db"),
    "smms": _sqlite("smms.db"),
    "tdms": _sqlite("tdms.db"),
    "coa": _sqlite("coa.db"),
}
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
os.makedirs(app.config["SOLVER_DIR"], exist_ok=True)

with app.app_context():
    db.create_all()
    seed_users()

# Network limits used by the existing pipeline (matrix_builder.py)
MAX_TRACK, MAX_SECTION, T_SLOTS, MAX_TRAINS = 18, 13, 120, 9
CPLEX_VAR_LIMIT = 1000
SLOT_RE = re.compile(r"^R(\d+)_S(\d+)$")


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def dump_pickle(obj):
    return base64.b64encode(pickle.dumps(obj)).decode("utf-8")


def load_pickle(b64_str):
    if not b64_str:
        return None
    return pickle.loads(base64.b64decode(b64_str))


def current_user():
    uid = session.get("uid")
    return db.session.get(User, uid) if uid else None


def login_required(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "Please sign in."}), 401
            if roles and user.role not in roles:
                return jsonify({"error": "You do not have access to this action."}), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco


def err(msg, code=400):
    return jsonify({"error": msg}), code


def _read_csv_upload():
    f = request.files.get("file")
    if not f or not f.filename:
        raise ValueError("Choose a CSV file to upload.")
    text = f.read().decode("utf-8-sig")
    return f.filename, text


def _to_int(val, field, line):
    try:
        return int(str(val).strip())
    except (TypeError, ValueError):
        raise ValueError(f"Row {line}: '{field}' must be a whole number (got '{val}').")


def parse_block_csv(text):
    reader = csv.DictReader(io.StringIO(text))
    need = ["track_id", "section_id", "block_duration", "deadline", "maintenance_type"]
    missing = [c for c in need if c not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"Missing column(s): {', '.join(missing)}. Expected: {', '.join(need)}.")
    rows, seen = [], set()
    for i, r in enumerate(reader, start=2):
        if not any((v or "").strip() for v in r.values()):
            continue
        row = {
            "track_id": _to_int(r["track_id"], "track_id", i),
            "section_id": _to_int(r["section_id"], "section_id", i),
            "block_duration": _to_int(r["block_duration"], "block_duration", i),
            "deadline": _to_int(r["deadline"], "deadline", i),
            "maintenance_type": (r["maintenance_type"] or "").strip() or "unknown",
        }
        if not 1 <= row["track_id"] <= MAX_TRACK:
            raise ValueError(f"Row {i}: track_id must be 1–{MAX_TRACK}.")
        if not 1 <= row["section_id"] <= MAX_SECTION:
            raise ValueError(f"Row {i}: section_id must be 1–{MAX_SECTION}.")
        if row["block_duration"] <= 0:
            raise ValueError(f"Row {i}: block_duration must be greater than 0.")
        if not 0 <= row["deadline"] < T_SLOTS:
            raise ValueError(f"Row {i}: deadline must be a slot between 0 and {T_SLOTS - 1}.")
        key = (row["track_id"], row["section_id"])
        if key in seen:
            raise ValueError(f"Row {i}: duplicate request for R{key[0]} S{key[1]}.")
        seen.add(key)
        rows.append(row)
    if not rows:
        raise ValueError("The file has no data rows.")
    return rows


def parse_timetable_csv(text):
    reader = csv.DictReader(io.StringIO(text))
    need = ["train_id", "engine_type", "category"]
    missing = [c for c in need if c not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"Missing column(s): {', '.join(missing)}.")
    rows, ids = [], set()
    for i, r in enumerate(reader, start=2):
        if not (r.get("train_id") or "").strip():
            continue
        tid = _to_int(r["train_id"], "train_id", i)
        eng = (r["engine_type"] or "").strip().upper()
        if eng not in ("D", "H", "E"):
            raise ValueError(f"Row {i}: engine_type must be D, H or E.")
        cat = _to_int(r["category"], "category", i)
        if cat not in (1, 2):
            raise ValueError(f"Row {i}: category must be 1 or 2.")
        slots = {}
        for t in range(T_SLOTS):
            v = (r.get(f"t{t}") or "").strip()
            if v:
                m = SLOT_RE.match(v)
                if not m or not (1 <= int(m.group(1)) <= MAX_TRACK and 1 <= int(m.group(2)) <= MAX_SECTION):
                    raise ValueError(f"Row {i}, t{t}: '{v}' is not a valid section (e.g. R3_S5).")
                slots[f"t{t}"] = v
        if tid in ids:
            raise ValueError(f"Row {i}: train {tid} appears twice.")
        ids.add(tid)
        rows.append({"train_id": tid, "engine_type": eng, "category": cat, "slots": slots})
    if not rows:
        raise ValueError("The file has no trains.")
    if len(rows) > MAX_TRAINS:
        raise ValueError(f"The optimiser currently supports up to {MAX_TRAINS} trains (file has {len(rows)}).")
    return rows


def parse_delay_csv_text(text):
    reader = csv.DictReader(io.StringIO(text))
    if not {"train_id", "delay"} <= set(reader.fieldnames or []):
        raise ValueError("Missing column(s). Expected: train_id, delay.")
    rows = []
    for i, r in enumerate(reader, start=2):
        if not (r.get("train_id") or "").strip():
            continue
        d = _to_int(r["delay"], "delay", i)
        if d < 0:
            raise ValueError(f"Row {i}: delay cannot be negative.")
        rows.append({"train_id": _to_int(r["train_id"], "train_id", i), "delay": d})
    if not rows:
        raise ValueError("The file has no data rows.")
    return rows


def _deactivate(model, **filters):
    for u in model.query.filter_by(is_active=True, **filters).all():
        u.is_active = False


def store_block_upload(dept, filename, rows, username, note=None):
    cfg = DEPARTMENTS[dept]
    Up, Req = cfg["upload"], cfg["request"]
    _deactivate(Up)
    up = Up(filename=filename, row_count=len(rows), uploaded_by=username, note=note)
    db.session.add(up)
    db.session.flush()
    for r in rows:
        db.session.add(Req(upload_id=up.id, **r))
    db.session.commit()
    return up


def store_coa_upload(kind, filename, rows, username, note=None):
    _deactivate(CoaUpload, kind=kind)
    up = CoaUpload(kind=kind, filename=filename, row_count=len(rows), uploaded_by=username, note=note)
    db.session.add(up)
    db.session.flush()
    for r in rows:
        if kind == "timetable":
            db.session.add(CoaTimetable(upload_id=up.id, train_id=r["train_id"], engine_type=r["engine_type"],
                                        category=r["category"], slots=json.dumps(r["slots"])))
        else:
            db.session.add(CoaDelay(upload_id=up.id, **r))
    db.session.commit()
    return up


def active_upload(dept, kind=None):
    if dept == "coa":
        return CoaUpload.query.filter_by(is_active=True, kind=kind).order_by(CoaUpload.id.desc()).first()
    Up = DEPARTMENTS[dept]["upload"]
    return Up.query.filter_by(is_active=True).order_by(Up.id.desc()).first()


def active_block_rows(dept):
    up = active_upload(dept)
    if not up:
        return [], None
    Req = DEPARTMENTS[dept]["request"]
    return [r.to_dict() for r in Req.query.filter_by(upload_id=up.id).order_by(Req.id).all()], up


def estimate_model_size():
    """Same compression as matrix_builder.build_solver_matrices."""
    per_track = {}
    for d in DEPARTMENTS:
        rows, _ = active_block_rows(d)
        for r in rows:
            per_track.setdefault(r["track_id"], set()).add(r["section_id"])
    if not per_track:
        return 0
    return len(per_track) * T_SLOTS * max(len(s) for s in per_track.values())


def write_pipeline_csvs(out_dir):
    """Rebuilds the five CSVs (same format as demo_data) from the department databases."""
    os.makedirs(out_dir, exist_ok=True)
    paths, sources = {}, {}
    header = ["track_id", "section_id", "block_duration", "deadline", "maintenance_type"]
    for dept, cfg in DEPARTMENTS.items():
        rows, up = active_block_rows(dept)
        path = os.path.join(out_dir, f"{cfg['pipeline_key']}.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(header)
            for r in rows:
                w.writerow([r[h] for h in header])
        paths[cfg["pipeline_key"]] = path
        sources[dept] = up.id if up else None

    tt_up = active_upload("coa", "timetable")
    path = os.path.join(out_dir, "schedule.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["train_id", "engine_type", "category"] + [f"t{t}" for t in range(T_SLOTS)])
        if tt_up:
            for tr in CoaTimetable.query.filter_by(upload_id=tt_up.id).order_by(CoaTimetable.train_id).all():
                slots = json.loads(tr.slots)
                w.writerow([tr.train_id, tr.engine_type, tr.category] + [slots.get(f"t{t}", "") for t in range(T_SLOTS)])
    paths["schedule"] = path
    sources["coa_timetable"] = tt_up.id if tt_up else None

    dl_up = active_upload("coa", "delay")
    path = os.path.join(out_dir, "delay.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["train_id", "delay"])
        if dl_up:
            for d in CoaDelay.query.filter_by(upload_id=dl_up.id).order_by(CoaDelay.train_id).all():
                w.writerow([d.train_id, d.delay])
    paths["delay"] = path
    sources["coa_delay"] = dl_up.id if dl_up else None
    return paths, sources


def build_result_preview(index_maps, blocks, X_solver):
    """One row per maintenance block — first X=1 is the start (unchanged logic)."""
    info = {(b["track"], b["section"]): b for b in blocks}
    out = []
    for j_real, j_s in index_maps["track_to_solver_j"].items():
        for (jk_real, k_s) in index_maps["section_to_solver_k"].items():
            if jk_real[0] != j_real:
                continue
            k_real = jk_real[1]
            active = np.where(X_solver[j_s, :, k_s] >= 0.5)[0]
            if len(active) == 0:
                continue
            b = info.get((j_real, k_real), {})
            start = int(active[0])
            dur = b.get("duration", 1)
            out.append({
                "track": f"R{j_real + 1}",
                "section": f"S{k_real + 1}",
                "start_time": start,
                "end_time": start + dur,
                "duration": dur,
                "deadline": b.get("deadline"),
                "dept": b.get("dept"),
                "type": b.get("type"),
            })
    out.sort(key=lambda r: (r["start_time"], r["track"], r["section"]))
    return out


# Pipeline labels departments by its original keys; map them to the new names.
PIPELINE_DEPT = {"TDMS": "tdms", "SMMS": "smms", "TDS": "tms"}


def analyse_plan(results, trains, delays):
    """Real, deterministic metrics: which trains pass through each block while it is active."""
    delays = {int(k): v for k, v in delays.items()}
    per_block, trains_hit, conflict_slots = [], set(), 0
    for r in results:
        loc = f"{r['track']}_{r['section']}"
        hits = []
        for tr in trains:
            d = delays.get(int(tr["train_id"]), 0)
            slots = [int(t) + d for t, v in tr["schedule"].items() if v == loc]
            inside = [s for s in slots if r["start_time"] <= s < r["end_time"]]
            if inside:
                hits.append({"train_id": tr["train_id"], "from": min(inside), "to": max(inside) + 1})
                trains_hit.add(tr["train_id"])
                conflict_slots += len(inside)
        per_block.append({**r, "dept_key": PIPELINE_DEPT.get(r.get("dept"), r.get("dept")),
                          "trains_affected": hits,
                          "on_time": r.get("deadline") is None or r["start_time"] <= r["deadline"],
                          "slack": None if r.get("deadline") is None else r["deadline"] - r["start_time"]})

    total_block_slots = sum(r["duration"] for r in results)
    return {
        "blocks": per_block,
        "summary": {
            "blocks_scheduled": len(results),
            "departments": sorted({b["dept_key"] for b in per_block if b["dept_key"]}),
            "on_time": sum(1 for b in per_block if b["on_time"]),
            "total_block_slots": total_block_slots,
            "trains_total": len(trains),
            "trains_affected": len(trains_hit),
            "conflict_slots": conflict_slots,
            "earliest_start": min((r["start_time"] for r in results), default=None),
            "latest_end": max((r["end_time"] for r in results), default=None),
        },
    }


def plan_to_dict(plan, full=False):
    results = json.loads(plan.result_preview or "[]")
    d = {
        "id": plan.id,
        "plan_date": plan.plan_date.isoformat(),
        "title": plan.title,
        "status": plan.status,
        "created_by": plan.created_by,
        "created_at": plan.created_at.isoformat() + "Z" if plan.created_at else None,
        "approved_by": plan.approved_by,
        "approved_at": plan.approved_at.isoformat() + "Z" if plan.approved_at else None,
        "simulated_at": plan.simulated_at.isoformat() + "Z" if plan.simulated_at else None,
        "has_ai_result": plan.ai_agent_result is not None,
        "has_trajectory": os.path.exists(_trajectory_path(plan.id)),
        "solver": json.loads(plan.solver_info or "{}"),
        "block_count": len(results),
        "dept_counts": {},
    }
    for r in results:
        k = PIPELINE_DEPT.get(r.get("dept"), r.get("dept"))
        d["dept_counts"][k] = d["dept_counts"].get(k, 0) + 1
    if full:
        trains = json.loads(plan.trains or "[]")
        delays = json.loads(plan.delays or "{}")
        d["analysis"] = analyse_plan(results, trains, delays)
        d["trains"] = trains
        d["delays"] = delays
        d["sources"] = json.loads(plan.source_uploads or "{}")
    return d


def run_and_store_plan(file_paths, plan_date, title, username, sources):
    solver_dir = app.config["SOLVER_DIR"]
    index_maps, blocks, trains, delays = run_solve_pipeline(
        file_paths["tdms"], file_paths["smms"], file_paths["tds"],
        file_paths["schedule"], file_paths["delay"], solver_dir,
    )
    result_path = os.path.join(solver_dir, "X_result.npy")
    if not os.path.exists(result_path):
        raise RuntimeError("Solver did not produce an output matrix.")
    X_solver = np.load(result_path)
    results = build_result_preview(index_maps, blocks, X_solver)

    solver_info = {}
    log_path = os.path.join(solver_dir, "solver_log.txt")
    if os.path.exists(log_path):
        log = open(log_path, encoding="utf-8", errors="ignore").read()
        m = re.search(r"Objective Value\s*:\s*([-\d.eE+]+)", log)
        solver_info["objective"] = float(m.group(1)) if m else None
        solver_info["optimal"] = "strictly OPTIMAL" in log
        m = re.search(r"Model size: (\d+) binary variables", log)
        solver_info["variables"] = int(m.group(1)) if m else None
        m = re.search(r"Model size: (\d+) constraints", log)
        solver_info["constraints"] = int(m.group(1)) if m else None

    buf = io.BytesIO()
    np.save(buf, X_solver)
    plan = BlockPlan(
        plan_date=plan_date, title=title, status="draft", created_by=username,
        source_uploads=json.dumps(sources),
        index_maps=dump_pickle({**index_maps, "_X": base64.b64encode(buf.getvalue()).decode()}),
        blocks=json.dumps(blocks), trains=json.dumps(trains), delays=json.dumps(delays),
        result_preview=json.dumps(results), solver_info=json.dumps(solver_info),
    )
    db.session.add(plan)
    db.session.commit()
    return plan, results


SUMO_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "sumo", "spiderweb_network"))
SUMO_OUTPUT_DIR = os.path.join(SUMO_DIR, "output")
TRAJ_DIR = os.path.join(INSTANCE_DIR, "trajectories")
os.makedirs(TRAJ_DIR, exist_ok=True)


def _trajectory_path(plan_id):
    return os.path.join(TRAJ_DIR, f"plan_{int(plan_id)}.json")


def _plan_or_latest(plan_id):
    if plan_id:
        return db.session.get(BlockPlan, int(plan_id))
    return BlockPlan.query.order_by(BlockPlan.id.desc()).first()


def _restore_plan_matrix(plan):
    """Writes the plan's own X matrix back so SUMO simulates that plan."""
    maps = load_pickle(plan.index_maps)
    x_b64 = maps.pop("_X", None)
    if x_b64:
        X = np.load(io.BytesIO(base64.b64decode(x_b64)))
        np.save(os.path.join(app.config["SOLVER_DIR"], "X_result.npy"), X)
    return maps


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
@app.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    user = User.query.filter_by(username=(data.get("username") or "").strip().lower()).first()
    if not user or not user.check_password(data.get("password") or ""):
        return err("Incorrect username or password.", 401)
    session.clear()
    session.permanent = True
    session["uid"] = user.id
    return jsonify({"user": user.to_dict()})


@app.post("/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/auth/me")
def me():
    user = current_user()
    if not user:
        return err("Not signed in.", 401)
    return jsonify({"user": user.to_dict()})


# --------------------------------------------------------------------------
# Department data (each department writes only to its own database)
# --------------------------------------------------------------------------
def _can_read(user, dept):
    return user.role == "planner" or user.role == dept


@app.get("/departments")
@login_required()
def departments():
    return jsonify({k: {x: v[x] for x in ("name", "system", "full")} for k, v in DEPARTMENTS.items()})


@app.get("/dept/<dept>/requests")
@login_required()
def dept_requests(dept):
    user = current_user()
    if dept not in DEPARTMENTS:
        return err("Unknown department.", 404)
    if not _can_read(user, dept):
        return err("You can only view your own department's requests.", 403)
    rows, up = active_block_rows(dept)
    Up = DEPARTMENTS[dept]["upload"]
    history = [u.to_dict() for u in Up.query.order_by(Up.id.desc()).limit(20).all()]
    return jsonify({"active": up.to_dict() if up else None, "rows": rows, "history": history})


@app.post("/dept/<dept>/upload")
@login_required()
def dept_upload(dept):
    user = current_user()
    if dept not in DEPARTMENTS:
        return err("Unknown department.", 404)
    if user.role != dept:
        return err("Only this department's users can upload its requests.", 403)
    try:
        filename, text = _read_csv_upload()
        rows = parse_block_csv(text)
    except ValueError as e:
        return err(str(e))
    up = store_block_upload(dept, filename, rows, user.username, request.form.get("note"))
    return jsonify({"upload": up.to_dict(), "rows": len(rows)})


@app.post("/dept/<dept>/sample")
@login_required()
def dept_sample(dept):
    user = current_user()
    if dept not in DEPARTMENTS or user.role != dept:
        return err("Not allowed.", 403)
    path = os.path.join(app.config["DEMO_DATA_FOLDER"], DEPARTMENTS[dept]["demo_file"])
    rows = parse_block_csv(open(path, encoding="utf-8").read())
    up = store_block_upload(dept, DEPARTMENTS[dept]["demo_file"], rows, user.username, "Sample data")
    return jsonify({"upload": up.to_dict(), "rows": len(rows)})


@app.post("/dept/<dept>/withdraw")
@login_required()
def dept_withdraw(dept):
    user = current_user()
    if dept not in DEPARTMENTS or user.role != dept:
        return err("Not allowed.", 403)
    _deactivate(DEPARTMENTS[dept]["upload"])
    db.session.commit()
    return jsonify({"ok": True})


@app.get("/coa/data")
@login_required("coa", "planner")
def coa_data():
    out = {}
    for kind in ("timetable", "delay"):
        up = active_upload("coa", kind)
        if kind == "timetable":
            rows = [r.to_dict() for r in CoaTimetable.query.filter_by(upload_id=up.id).order_by(CoaTimetable.train_id)] if up else []
        else:
            rows = [r.to_dict() for r in CoaDelay.query.filter_by(upload_id=up.id).order_by(CoaDelay.train_id)] if up else []
        hist = [u.to_dict() for u in CoaUpload.query.filter_by(kind=kind).order_by(CoaUpload.id.desc()).limit(20)]
        out[kind] = {"active": up.to_dict() if up else None, "rows": rows, "history": hist}
    return jsonify(out)


@app.post("/coa/upload/<kind>")
@login_required("coa")
def coa_upload(kind):
    if kind not in ("timetable", "delay"):
        return err("Unknown file type.", 404)
    try:
        filename, text = _read_csv_upload()
        rows = parse_timetable_csv(text) if kind == "timetable" else parse_delay_csv_text(text)
    except ValueError as e:
        return err(str(e))
    up = store_coa_upload(kind, filename, rows, current_user().username, request.form.get("note"))
    return jsonify({"upload": up.to_dict(), "rows": len(rows)})


@app.post("/coa/sample/<kind>")
@login_required("coa")
def coa_sample(kind):
    fname = {"timetable": "train_schedule.csv", "delay": "train_delay.csv"}.get(kind)
    if not fname:
        return err("Unknown file type.", 404)
    text = open(os.path.join(app.config["DEMO_DATA_FOLDER"], fname), encoding="utf-8").read()
    rows = parse_timetable_csv(text) if kind == "timetable" else parse_delay_csv_text(text)
    up = store_coa_upload(kind, fname, rows, current_user().username, "Sample data")
    return jsonify({"upload": up.to_dict(), "rows": len(rows)})


@app.get("/templates/<name>.csv")
def csv_template(name):
    headers = {
        "blocks": "track_id,section_id,block_duration,deadline,maintenance_type\n",
        "timetable": "train_id,engine_type,category," + ",".join(f"t{t}" for t in range(T_SLOTS)) + "\n",
        "delay": "train_id,delay\n",
    }
    if name not in headers:
        return err("Unknown template.", 404)
    return Response(headers[name], mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={name}_template.csv"})


# --------------------------------------------------------------------------
# Block planner
# --------------------------------------------------------------------------
@app.get("/planner/overview")
@login_required("planner")
def planner_overview():
    sources = []
    for dept, cfg in DEPARTMENTS.items():
        rows, up = active_block_rows(dept)
        sources.append({
            "key": dept, "name": cfg["name"], "system": cfg["system"],
            "rows": len(rows), "upload": up.to_dict() if up else None,
            "block_slots": sum(r["block_duration"] for r in rows),
            "earliest_deadline": min((r["deadline"] for r in rows), default=None),
        })
    for kind, label in (("timetable", "Train timetable"), ("delay", "Delay forecast")):
        up = active_upload("coa", kind)
        sources.append({"key": f"coa_{kind}", "name": label, "system": "COA",
                        "rows": up.row_count if up else 0, "upload": up.to_dict() if up else None})

    all_rows = []
    for dept in DEPARTMENTS:
        rows, _ = active_block_rows(dept)
        all_rows += [{**r, "dept": dept} for r in rows]
    all_rows.sort(key=lambda r: (r["deadline"], -r["block_duration"]))

    ready = all(s["upload"] for s in sources if s["key"].startswith("coa_")) and any(
        s["upload"] for s in sources if not s["key"].startswith("coa_"))
    recent = [plan_to_dict(p) for p in BlockPlan.query.order_by(BlockPlan.id.desc()).limit(6)]
    return jsonify({
        "sources": sources,
        "requests": all_rows,
        "model_size": estimate_model_size(),
        "model_limit": CPLEX_VAR_LIMIT,
        "ready": ready,
        "recent_plans": recent,
    })


@app.post("/planner/load_demo")
@login_required("planner")
def planner_load_demo():
    folder = app.config["DEMO_DATA_FOLDER"]
    for dept, cfg in DEPARTMENTS.items():
        rows = parse_block_csv(open(os.path.join(folder, cfg["demo_file"]), encoding="utf-8").read())
        store_block_upload(dept, cfg["demo_file"], rows, "demo", "Demo data loaded by planner")
    store_coa_upload("timetable", "train_schedule.csv",
                     parse_timetable_csv(open(os.path.join(folder, "train_schedule.csv"), encoding="utf-8").read()),
                     "demo", "Demo data loaded by planner")
    store_coa_upload("delay", "train_delay.csv",
                     parse_delay_csv_text(open(os.path.join(folder, "train_delay.csv"), encoding="utf-8").read()),
                     "demo", "Demo data loaded by planner")
    return jsonify({"ok": True})


@app.post("/planner/solve")
@login_required("planner")
def planner_solve():
    data = request.get_json(silent=True) or {}
    try:
        plan_date = date.fromisoformat(data.get("plan_date") or date.today().isoformat())
    except ValueError:
        return err("Invalid plan date.")
    if not active_upload("coa", "timetable") or not active_upload("coa", "delay"):
        return err("Control Office has not uploaded the timetable and delay forecast yet.")
    if not any(active_upload(d) for d in DEPARTMENTS):
        return err("No department has submitted block requests yet.")
    size = estimate_model_size()
    if size > CPLEX_VAR_LIMIT:
        return err(f"Model needs {size} variables; CPLEX Community Edition allows {CPLEX_VAR_LIMIT}. "
                   "Reduce the number of tracks in the requests.")
    try:
        paths, sources = write_pipeline_csvs(os.path.join(app.config["UPLOAD_FOLDER"], "plan_inputs"))
        plan, results = run_and_store_plan(paths, plan_date, data.get("title"), current_user().username, sources)
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        return err(f"Optimiser failed: {e}", 500)
    return jsonify({"success": True, "plan": plan_to_dict(plan, full=True), "results": results})


@app.get("/plans")
@login_required()
def list_plans():
    q = BlockPlan.query
    if request.args.get("from"):
        q = q.filter(BlockPlan.plan_date >= date.fromisoformat(request.args["from"]))
    if request.args.get("to"):
        q = q.filter(BlockPlan.plan_date <= date.fromisoformat(request.args["to"]))
    user = current_user()
    if user.role != "planner":
        q = q.filter(BlockPlan.status == "approved")
    plans = q.order_by(BlockPlan.plan_date, BlockPlan.id).all()
    out = []
    for p in plans:
        d = plan_to_dict(p)
        results = json.loads(p.result_preview or "[]")
        d["blocks"] = [{**r, "dept_key": PIPELINE_DEPT.get(r.get("dept"), r.get("dept"))} for r in results]
        out.append(d)
    return jsonify({"plans": out})


@app.get("/plans/<int:plan_id>")
@login_required()
def get_plan(plan_id):
    plan = db.session.get(BlockPlan, plan_id)
    if not plan:
        return err("Plan not found.", 404)
    if current_user().role != "planner" and plan.status != "approved":
        return err("This plan has not been approved yet.", 403)
    return jsonify({"plan": plan_to_dict(plan, full=True)})


@app.post("/plans/<int:plan_id>/approve")
@login_required("planner")
def approve_plan(plan_id):
    plan = db.session.get(BlockPlan, plan_id)
    if not plan:
        return err("Plan not found.", 404)
    plan.status = "approved"
    plan.approved_by = current_user().username
    plan.approved_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"plan": plan_to_dict(plan)})


@app.post("/plans/<int:plan_id>/reopen")
@login_required("planner")
def reopen_plan(plan_id):
    plan = db.session.get(BlockPlan, plan_id)
    if not plan:
        return err("Plan not found.", 404)
    plan.status, plan.approved_by, plan.approved_at = "draft", None, None
    db.session.commit()
    return jsonify({"plan": plan_to_dict(plan)})


@app.patch("/plans/<int:plan_id>")
@login_required("planner")
def update_plan(plan_id):
    plan = db.session.get(BlockPlan, plan_id)
    if not plan:
        return err("Plan not found.", 404)
    data = request.get_json(silent=True) or {}
    if "plan_date" in data:
        try:
            plan.plan_date = date.fromisoformat(data["plan_date"])
        except ValueError:
            return err("Invalid plan date.")
    if "title" in data:
        plan.title = data["title"] or None
    db.session.commit()
    return jsonify({"plan": plan_to_dict(plan)})


@app.delete("/plans/<int:plan_id>")
@login_required("planner")
def delete_plan(plan_id):
    plan = db.session.get(BlockPlan, plan_id)
    if not plan:
        return err("Plan not found.", 404)
    if plan.status == "approved":
        return err("Reopen the plan before deleting it.")
    if os.path.exists(_trajectory_path(plan.id)):
        os.remove(_trajectory_path(plan.id))
    db.session.delete(plan)
    db.session.commit()
    return jsonify({"ok": True})


# --------------------------------------------------------------------------
# Simulation + AI rerouting (unchanged pipeline, now per plan)
# --------------------------------------------------------------------------
@app.post("/simulate")
@login_required("planner")
def simulate():
    data = request.get_json(silent=True) or {}
    plan = _plan_or_latest(data.get("plan_id") or request.args.get("plan_id"))
    if not plan:
        return err("No plan found. Run the optimiser first.")
    try:
        print("Starting simulation pipeline...")
        maps = _restore_plan_matrix(plan)
        headless = bool(data.get("headless"))
        traj_src = os.path.join(SUMO_OUTPUT_DIR, "trajectory.json")
        if os.path.exists(traj_src):
            os.remove(traj_src)
        run_simulate_pipeline(maps, json.loads(plan.blocks), json.loads(plan.trains),
                              json.loads(plan.delays), app.config["SOLVER_DIR"], headless=headless)
        if not os.path.exists(traj_src):
            return err("SUMO finished without writing a trajectory. Check the backend console.", 500)
        shutil.copyfile(traj_src, _trajectory_path(plan.id))
        plan.simulated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({"success": True, "message": "Simulation finished. Trajectory saved for the live map."})
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        return err(str(e), 500)


@app.get("/plans/<int:plan_id>/trajectory")
@login_required()
def plan_trajectory(plan_id):
    plan = db.session.get(BlockPlan, plan_id)
    if not plan:
        return err("Plan not found.", 404)
    if current_user().role != "planner" and plan.status != "approved":
        return err("This plan has not been approved yet.", 403)
    path = _trajectory_path(plan_id)
    if not os.path.exists(path):
        return err("This plan has not been simulated yet.", 404)
    return send_file(path, mimetype="application/json")


_NETWORK_CACHE = {}


@app.get("/network")
@login_required()
def network():
    """Track geometry straight from the SUMO network, keyed by section id (R3_S5)."""
    if "data" not in _NETWORK_CACHE:
        import sumolib
        net = sumolib.net.readNet(os.path.join(SUMO_DIR, "network", "network.net.xml"))
        sections = {}
        for e in net.getEdges():
            eid = e.getID()
            if eid.startswith(":"):
                continue
            sections[eid] = {
                "shape": [[round(x, 1), round(y, 1)] for x, y in e.getLanes()[0].getShape()],
                "length": round(e.getLength(), 1),
                "from": e.getFromNode().getID(),
                "to": e.getToNode().getID(),
            }
        nodes = {n.getID(): [round(c, 1) for c in n.getCoord()] for n in net.getNodes()}
        cfg = json.load(open(os.path.join(SUMO_DIR, "config", "network_config.json")))
        mapping = json.load(open(os.path.join(SUMO_DIR, "config", "track_mapping.json")))
        stations = []
        for s in cfg["stations"]:
            plat = mapping["station_tracks"].get(s["id"], [{}])[0]
            p1 = nodes.get(f"{s['id']}_P1")
            stations.append({"id": s["id"], "name": s["name"], "track": plat.get("r_id"), "pos": p1})
        junctions = [{"id": j["id"], "pos": nodes.get(j["id"])} for j in cfg["junctions"]]
        tracks = [{"id": t["id"], "from": t["from"], "to": t["to"], "sections": t["num_sections"]} for t in cfg["tracks"]]
        xs = [p[0] for s in sections.values() for p in s["shape"]]
        ys = [p[1] for s in sections.values() for p in s["shape"]]
        _NETWORK_CACHE["data"] = {
            "sections": sections, "stations": stations, "junctions": junctions, "tracks": tracks,
            "bounds": [min(xs), min(ys), max(xs), max(ys)],
            "section_length_m": cfg.get("section_length_m"),
        }
    return jsonify(_NETWORK_CACHE["data"])


@app.get("/alternate_data")
@login_required("planner")
def alternate_data():
    plan = _plan_or_latest(request.args.get("plan_id"))
    if not plan or not plan.result_preview:
        return err("No solved plan found. Run the optimiser first.")
    try:
        from agent.ai_agent import analyze_and_reroute
        refresh = request.args.get("refresh") == "1"
        if plan.ai_agent_result is not None and not refresh:
            agent_result = json.loads(plan.ai_agent_result)
        else:
            print("Invoking LangChain AI agent to compute alternate routes...")
            agent_result = analyze_and_reroute(
                json.loads(plan.blocks), json.loads(plan.trains),
                json.loads(plan.delays), json.loads(plan.result_preview),
            )
            plan.ai_agent_result = json.dumps(agent_result)
            db.session.commit()
        return jsonify({
            "success": True,
            "plan_id": plan.id,
            "data": agent_result,
            "blocks": json.loads(plan.result_preview),
            "trains": json.loads(plan.trains),
        })
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        return err(str(e), 500)


# --------------------------------------------------------------------------
# Legacy endpoints (old single-page UI in backend/static)
# --------------------------------------------------------------------------
@app.get("/demo_data")
def get_demo_data():
    demo_files = {"tdms": "tdms_blocks.csv", "smms": "smms_blocks.csv", "tds": "tds_blocks.csv",
                  "schedule": "train_schedule.csv", "delay": "train_delay.csv"}
    data = {}
    for key, filename in demo_files.items():
        p = os.path.join(app.config["DEMO_DATA_FOLDER"], filename)
        data[key] = open(p, encoding="utf-8").read() if os.path.exists(p) else ""
    return jsonify(data)


@app.post("/solve")
@login_required("planner")
def solve_legacy():
    """Direct multipart upload of all five CSVs (bypasses department databases)."""
    file_paths = {}
    for key in ["tdms", "smms", "tds", "schedule", "delay"]:
        if key not in request.files:
            return err(f"Missing file for {key}")
        path = os.path.join(app.config["UPLOAD_FOLDER"], f"{key}.csv")
        request.files[key].save(path)
        file_paths[key] = path
    try:
        plan, results = run_and_store_plan(file_paths, date.today(), "Direct upload",
                                           current_user().username, {"direct_upload": True})
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        return err(str(e), 500)
    return jsonify({"success": True, "message": "Solver completed successfully!",
                    "results": results, "plan_id": plan.id})


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    app.run(
        host=os.environ.get("FLASK_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_PORT", 5050)),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )
