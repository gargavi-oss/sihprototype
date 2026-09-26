"""
Database models.

Each department owns a separate SQLite database (SQLAlchemy "binds"):

    core.db  – users, saved block plans           (bind: default)
    tms.db   – Engineering / Track Management      (bind: "tms")
    smms.db  – Signal & Telecom                    (bind: "smms")
    tdms.db  – Traction Distribution               (bind: "tdms")
    coa.db   – Control Office: timetable + delays  (bind: "coa")

Department tables store rows in exactly the same shape as the CSVs the
solver pipeline already consumes, so the optimiser input is unchanged.
"""
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


def _now():
    return datetime.utcnow()


# --------------------------------------------------------------------------
# Core database
# --------------------------------------------------------------------------
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    # tms | smms | tdms | coa | planner
    role = db.Column(db.String(16), nullable=False)
    designation = db.Column(db.String(120), nullable=True)
    created_at = db.Column(db.DateTime, default=_now)

    def __init__(
        self,
        username=None,
        full_name=None,
        role=None,
        designation=None,
        name=None,
        desig=None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        if username is not None:
            self.username = username
        self.full_name = full_name or name or ""
        if role is not None:
            self.role = role
        self.designation = designation or desig

    @property
    def name(self):
        return self.full_name

    @name.setter
    def name(self, val):
        self.full_name = val

    @property
    def desig(self):
        return self.designation

    @desig.setter
    def desig(self, val):
        self.designation = val

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role,
            "designation": self.designation,
        }


class BlockPlan(db.Model):
    """One optimiser run, assigned to a calendar date by the Block Planner."""
    __tablename__ = "block_plans"
    id = db.Column(db.Integer, primary_key=True)
    plan_date = db.Column(db.Date, nullable=False, index=True)
    title = db.Column(db.String(160), nullable=True)
    status = db.Column(db.String(16), default="draft")  # draft | approved
    created_by = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=_now)
    approved_by = db.Column(db.String(64), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)

    # Snapshot of the inputs used (upload ids per department)
    source_uploads = db.Column(db.Text)  # JSON {dept: upload_id}

    # Pipeline state (same fields the old RunState held)
    index_maps = db.Column(db.Text)       # base64 pickle
    blocks = db.Column(db.Text)           # JSON
    trains = db.Column(db.Text)           # JSON
    delays = db.Column(db.Text)           # JSON
    result_preview = db.Column(db.Text)   # JSON list of scheduled blocks
    solver_info = db.Column(db.Text)      # JSON {status, objective}
    ai_agent_result = db.Column(db.Text)  # JSON (cached Gemini output)
    simulated_at = db.Column(db.DateTime, nullable=True)


class RunState(db.Model):
    """Legacy single-run state (kept so old databases still load)."""
    __tablename__ = "run_state"
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=_now)
    index_maps = db.Column(db.Text, nullable=True)
    blocks = db.Column(db.Text, nullable=True)
    trains = db.Column(db.Text, nullable=True)
    delays = db.Column(db.Text, nullable=True)
    result_preview = db.Column(db.Text, nullable=True)
    ai_agent_result = db.Column(db.Text, nullable=True)


# --------------------------------------------------------------------------
# Department databases – one bind per department
# --------------------------------------------------------------------------
class _UploadMixin:
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255))
    row_count = db.Column(db.Integer, default=0)
    uploaded_by = db.Column(db.String(64))
    uploaded_at = db.Column(db.DateTime, default=_now)
    is_active = db.Column(db.Boolean, default=True, index=True)
    note = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "row_count": self.row_count,
            "uploaded_by": self.uploaded_by,
            "uploaded_at": (
                self.uploaded_at.isoformat() + "Z"
                if self.uploaded_at else None
            ),
            "is_active": self.is_active,
            "note": self.note,
            **({"kind": self.kind} if hasattr(self, "kind") else {}),
        }


class _BlockRequestMixin:
    """Same columns as tdms_blocks.csv / smms_blocks.csv / tds_blocks.csv."""
    id = db.Column(db.Integer, primary_key=True)
    track_id = db.Column(db.Integer, nullable=False)
    section_id = db.Column(db.Integer, nullable=False)
    block_duration = db.Column(db.Integer, nullable=False)
    deadline = db.Column(db.Integer, nullable=False)
    maintenance_type = db.Column(db.String(32), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "upload_id": self.upload_id,
            "track_id": self.track_id,
            "section_id": self.section_id,
            "block_duration": self.block_duration,
            "deadline": self.deadline,
            "maintenance_type": self.maintenance_type,
        }


# Engineering – Track Management System
class TmsUpload(db.Model, _UploadMixin):
    __bind_key__ = "tms"
    __tablename__ = "tms_uploads"


class TmsRequest(db.Model, _BlockRequestMixin):
    __bind_key__ = "tms"
    __tablename__ = "tms_block_requests"
    upload_id = db.Column(
        db.Integer, db.ForeignKey("tms_uploads.id"), index=True
    )


# Signal & Telecom – SMMS
class SmmsUpload(db.Model, _UploadMixin):
    __bind_key__ = "smms"
    __tablename__ = "smms_uploads"


class SmmsRequest(db.Model, _BlockRequestMixin):
    __bind_key__ = "smms"
    __tablename__ = "smms_block_requests"
    upload_id = db.Column(
        db.Integer, db.ForeignKey("smms_uploads.id"), index=True
    )


# Traction Distribution – TDMS
class TdmsUpload(db.Model, _UploadMixin):
    __bind_key__ = "tdms"
    __tablename__ = "tdms_uploads"


class TdmsRequest(db.Model, _BlockRequestMixin):
    __bind_key__ = "tdms"
    __tablename__ = "tdms_block_requests"
    upload_id = db.Column(
        db.Integer, db.ForeignKey("tdms_uploads.id"), index=True
    )


# Control Office – timetable + delay forecast
class CoaUpload(db.Model, _UploadMixin):
    __bind_key__ = "coa"
    __tablename__ = "coa_uploads"
    kind = db.Column(db.String(16), nullable=False)  # timetable | delay


class CoaTimetable(db.Model):
    """Same columns as train_schedule.csv (t0..t119 stored as JSON)."""
    __bind_key__ = "coa"
    __tablename__ = "coa_timetable"
    id = db.Column(db.Integer, primary_key=True)
    upload_id = db.Column(
        db.Integer, db.ForeignKey("coa_uploads.id"), index=True
    )
    train_id = db.Column(db.Integer, nullable=False)
    engine_type = db.Column(db.String(4), nullable=False)
    category = db.Column(db.Integer, nullable=False)
    slots = db.Column(db.Text, nullable=False)  # JSON {"t0": "R11_S1", ...}

    def to_dict(self):
        import json
        slots = json.loads(self.slots)
        occupied = sorted(int(k[1:]) for k, v in slots.items() if v)
        return {
            "id": self.id,
            "upload_id": self.upload_id,
            "train_id": self.train_id,
            "engine_type": self.engine_type,
            "category": self.category,
            "first_slot": occupied[0] if occupied else None,
            "last_slot": occupied[-1] if occupied else None,
            "route": _route_summary(slots),
        }


class CoaDelay(db.Model):
    """Same columns as train_delay.csv."""
    __bind_key__ = "coa"
    __tablename__ = "coa_delays"
    id = db.Column(db.Integer, primary_key=True)
    upload_id = db.Column(
        db.Integer, db.ForeignKey("coa_uploads.id"), index=True
    )
    train_id = db.Column(db.Integer, nullable=False)
    delay = db.Column(db.Integer, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "upload_id": self.upload_id,
            "train_id": self.train_id,
            "delay": self.delay,
        }


def _route_summary(slots):
    """'R11 → R1 → R3 → R5 → R6' from the ordered slot map."""
    tracks = []
    for t in range(120):
        v = slots.get(f"t{t}")
        if v:
            tr = v.split("_")[0]
            if not tracks or tracks[-1] != tr:
                tracks.append(tr)
    return " → ".join(tracks)


# Registry used by the API layer
DEPARTMENTS = {
    "tms": {
        "name": "Engineering",
        "system": "TMS",
        "full": "Track Management System",
        "upload": TmsUpload,
        "request": TmsRequest,
        # The pipeline's third input was called "tds"; TMS feeds that slot.
        "pipeline_key": "tds",
        "demo_file": "tds_blocks.csv",
    },
    "smms": {
        "name": "Signal & Telecom",
        "system": "SMMS",
        "full": "Signalling Maintenance & Management System",
        "upload": SmmsUpload,
        "request": SmmsRequest,
        "pipeline_key": "smms",
        "demo_file": "smms_blocks.csv",
    },
    "tdms": {
        "name": "Traction Distribution",
        "system": "TDMS",
        "full": "Traction Distribution Management System",
        "upload": TdmsUpload,
        "request": TdmsRequest,
        "pipeline_key": "tdms",
        "demo_file": "tdms_blocks.csv",
    },
}

SEED_USERS = [
    # username, password, full name, role, designation
    (
        "tms", "tms123", "Engineering Department", "tms",
        "Sr. Section Engineer (P.Way)"
    ),
    (
        "smms", "smms123", "Signal & Telecom Department", "smms",
        "Sr. Section Engineer (Signal)"
    ),
    (
        "tdms", "tdms123", "Traction Distribution Department", "tdms",
        "Sr. Section Engineer (TRD)"
    ),
    ("coa", "coa123", "Control Office", "coa", "Chief Controller"),
    (
        "planner", "planner123", "Block Planning Cell", "planner",
        "Sr. Divisional Operations Manager"
    ),
]


def seed_users():
    for username, pw, name, role, desig in SEED_USERS:
        if not User.query.filter_by(username=username).first():
            u = User(
                username=username,
                full_name=name,
                role=role,
                designation=desig,
            )
            u.set_password(pw)
            db.session.add(u)
    db.session.commit()
