import json
import time
import uuid
from pathlib import Path
from flask import Flask, request, jsonify

from diagnostic_spines.engine import DiagnosticSpineEngine, SpineExecutionError

app = Flask(__name__)

# ============================================================
# GLOBAL SAFETY CONTROLS
# ============================================================

BLACK_BOX_KILL_SWITCH = False
SESSION_TTL_SECONDS = 20 * 60  # 20 minutes


# ============================================================
# BLACK BOX (STRICTLY EPHEMERAL)
# ============================================================

class BlackBox:
    def __init__(self):
        self._data = {}

    def write(self, key: str, value):
        self._data[key] = value

    def read(self, key: str):
        return self._data.get(key)

    def purge(self):
        self._data.clear()


# ============================================================
# DIAGNOSTIC SESSION
# ============================================================

class DiagnosticSession:
    def __init__(self, session_id: str, engine: DiagnosticSpineEngine):
        self.session_id = session_id
        self.engine = engine
        self.black_box = BlackBox()
        self.created_at = time.time()
        self.last_active = time.time()
        self.terminated = False

    def touch(self):
        self.last_active = time.time()

    def expired(self) -> bool:
        return (time.time() - self.last_active) > SESSION_TTL_SECONDS

    def enforce_alive(self):
        if self.terminated or self.engine is None:
            raise RuntimeError("Session is terminated")

    def purge(self):
        self.black_box.purge()
        self.engine = None
        self.terminated = True


# ============================================================
# SESSION STORE
# ============================================================

SESSIONS: dict[str, DiagnosticSession] = {}


def cleanup_expired_sessions():
    expired_ids = [
        sid for sid, session in SESSIONS.items()
        if session.expired()
    ]
    for sid in expired_ids:
        session = SESSIONS.pop(sid)
        session.purge()


# ============================================================
# SPINE LOADER
# ============================================================

def load_spine_definition(spine_id: str) -> dict:
    spine_path = (
        Path(__file__).parent
        / "diagnostic_spines"
        / spine_id
        / "spine_definition.json"
    )

    if not spine_path.exists():
        raise FileNotFoundError(f"Spine '{spine_id}' not found.")

    return json.loads(spine_path.read_text())


# ============================================================
# START DIAGNOSTIC SESSION
# ============================================================

@app.route("/diagnostic/start", methods=["POST"])
def start_diagnostic():
    if BLACK_BOX_KILL_SWITCH:
        return jsonify({
            "state": "BLOCKED",
            "error": "System disabled by kill switch"
        }), 503

    payload = request.get_json(force=True)
    spine_id = payload.get("spine_id")

    if not spine_id:
        return jsonify({
            "state": "BLOCKED",
            "error": "Missing spine_id"
        }), 400

    cleanup_expired_sessions()

    spine_definition = load_spine_definition(spine_id)
    engine = DiagnosticSpineEngine(
        spine_definition=spine_definition,
        spine_id=spine_id,
    )

    session_id = uuid.uuid4().hex
    SESSIONS[session_id] = DiagnosticSession(
        session_id=session_id,
        engine=engine
    )

    return jsonify({
        "state": "STARTED",
        "session_id": session_id
    }), 200


# ============================================================
# ADVANCE DIAGNOSTIC (SPINE)
# ============================================================

@app.route("/diagnostic/advance", methods=["POST"])
def advance_diagnostic():
    if BLACK_BOX_KILL_SWITCH:
        return jsonify({
            "state": "BLOCKED",
            "error": "System disabled by kill switch"
        }), 503

    payload = request.get_json(force=True)
    session_id = payload.get("session_id")
    measured_data = payload.get("measured_data", {})

    if not session_id:
        return jsonify({
            "state": "BLOCKED",
            "error": "Missing session_id"
        }), 400

    cleanup_expired_sessions()

    session = SESSIONS.get(session_id)
    if not session:
        return jsonify({
            "state": "TERMINATED",
            "error": "Session expired or not found"
        }), 410

    try:
        session.enforce_alive()
        session.touch()

        try:
            session.engine.advance(measured_data)
        except SpineExecutionError:
            pass

        return jsonify(session.engine.get_ui_state()), 200

    except Exception as e:
        return jsonify({
            "state": "ERROR",
            "error": str(e)
        }), 500


# ============================================================
# WIRING STATE MACHINE EVENT
# ============================================================

@app.route("/diagnostic/wiring/event", methods=["POST"])
def wiring_event():
    payload = request.get_json(force=True)
    session_id = payload.get("session_id")
    event = payload.get("event")

    if not session_id or not event:
        return jsonify({
            "state": "BLOCKED",
            "error": "Missing session_id or event"
        }), 400

    session = SESSIONS.get(session_id)
    if not session:
        return jsonify({
            "state": "TERMINATED",
            "error": "Session expired or not found"
        }), 410

    try:
        session.enforce_alive()
        session.touch()

        session.engine.wiring_fsm.transition(event)

        return jsonify(session.engine.get_ui_state()), 200

    except Exception as e:
        return jsonify({
            "state": "BLOCKED",
            "error": str(e),
            "wiring_state": session.engine.wiring_fsm.state.name
        }), 400


# ============================================================
# END DIAGNOSTIC SESSION
# ============================================================

@app.route("/diagnostic/end", methods=["POST"])
def end_diagnostic_session():
    payload = request.get_json(force=True)
    session_id = payload.get("session_id")

    session = SESSIONS.pop(session_id, None)
    if session:
        session.purge()

    return jsonify({
        "state": "TERMINATED",
        "message": "Session ended and memory purged"
    }), 200


if __name__ == "__main__":
    app.run(debug=True)
