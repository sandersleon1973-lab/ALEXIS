import json
from pathlib import Path
from flask import Flask, request, jsonify

from diagnostic_spines.engine import DiagnosticSpineEngine, SpineExecutionError

app = Flask(__name__)

# Simple in-memory engine store (one per spine)
ENGINES = {}


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


def get_engine(spine_id: str) -> DiagnosticSpineEngine:
    if spine_id not in ENGINES:
        spine_definition = load_spine_definition(spine_id)
        ENGINES[spine_id] = DiagnosticSpineEngine(
            spine_definition=spine_definition,
            spine_id=spine_id,
        )
    return ENGINES[spine_id]


@app.route("/diagnostic/advance", methods=["POST"])
def advance_diagnostic():
    payload = request.get_json(force=True)

    spine_id = payload.get("spine_id")
    measured_data = payload.get("measured_data", {})

    if not spine_id:
        return jsonify({
            "state": "BLOCKED",
            "error": "Missing spine_id"
        }), 400

    try:
        engine = get_engine(spine_id)

        try:
            engine.advance(measured_data)
        except SpineExecutionError:
            # Controlled diagnostic stop
            pass

        return jsonify(engine.get_ui_state()), 200

    except Exception as e:
        return jsonify({
            "state": "ERROR",
            "error": str(e)
        }), 500


if __name__ == "__main__":
    app.run(debug=True)
