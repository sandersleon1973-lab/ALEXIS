from diagnostic_spines.spine_guards.assumption_guard import enforce_assumption_guard
from diagnostic_spines.wiring_states import WiringStateMachine


class SpineExecutionError(Exception):
    pass


class DiagnosticSpineEngine:
    # TARGET 6: LOCKED CORE KEYS
    LOCKED_STEP_KEYS = {
        "cause",
        "eliminates",
        "exit_condition",
        "authority",
    }

    def __init__(self, spine_definition: dict, spine_id: str = "unknown"):
        self.spine_id = spine_id
        self.spine = spine_definition
        self.sequence = spine_definition.get("diagnostic_sequence", [])
        self.current_index = 0

        # Measured and inferred data
        self.context = {}

        # TARGET 2: NEGATIVE CERTAINTY STORE
        self.eliminated_causes = set()

        # TARGET 4: LAST EXPLANATION
        self.last_explanation = None

        # UI SIGNALING
        self.last_error = None

        # WIRING INTELLIGENCE GOVERNOR (OWNED, NOT DRIVEN)
        self.wiring_fsm = WiringStateMachine()

    # -------------------------------------------------
    # CURRENT STEP
    # -------------------------------------------------
    def current_step(self) -> dict:
        if self.current_index >= len(self.sequence):
            raise SpineExecutionError("Diagnostic sequence completed.")
        return self.sequence[self.current_index]

    # -------------------------------------------------
    # TARGET 6: LOCK VS LEARN ENFORCEMENT
    # -------------------------------------------------
    def _enforce_locked_core(self, step: dict):
        dynamic_keys = step.get("dynamic_override")
        if not dynamic_keys:
            return

        for key in dynamic_keys:
            if key in self.LOCKED_STEP_KEYS:
                raise SpineExecutionError(
                    f"Attempt to modify locked diagnostic behavior: '{key}'."
                )

    # -------------------------------------------------
    # TARGET 5: DATA STRESS / RELIABILITY CHECK
    # -------------------------------------------------
    def _validate_measured_data(self, measured_data: dict):
        for key, value in measured_data.items():
            if value is None:
                raise SpineExecutionError(
                    f"Measurement '{key}' is None. Data unreliable."
                )

            if isinstance(value, (int, float)) and value != value:
                raise SpineExecutionError(
                    f"Measurement '{key}' is NaN. Data unreliable."
                )

            if isinstance(value, str) and value.strip() == "":
                raise SpineExecutionError(
                    f"Measurement '{key}' is empty. Data unreliable."
                )

    # -------------------------------------------------
    # TARGET 2: NEGATIVE CERTAINTY
    # -------------------------------------------------
    def _apply_negative_certainty(self, step: dict):
        cause = step.get("cause")
        if cause and cause in self.eliminated_causes:
            raise SpineExecutionError(
                f"Cause '{cause}' was already eliminated. Diagnostic loop prevented."
            )

        eliminates = step.get("eliminates")
        if eliminates:
            if isinstance(eliminates, str):
                self.eliminated_causes.add(eliminates)
            elif isinstance(eliminates, list):
                for item in eliminates:
                    self.eliminated_causes.add(item)

    # -------------------------------------------------
    # TARGET 3: AUTHORITY BOUNDARY
    # -------------------------------------------------
    def _enforce_authority_boundary(self, step: dict):
        authority = step.get("authority", "advise")

        if authority == "command":
            exit_condition = step.get("exit_condition")
            if not exit_condition:
                raise SpineExecutionError(
                    "Command-authority step missing exit_condition."
                )

            required_key = exit_condition.split("==")[0].strip()
            if required_key not in self.context:
                raise SpineExecutionError(
                    f"Command step requires '{required_key}' before proceeding."
                )

    # -------------------------------------------------
    # TARGET 4: EXPLANATION FIDELITY
    # -------------------------------------------------
    def _apply_explanation_fidelity(self, step: dict):
        explanation = step.get("explanation")
        if not explanation or not isinstance(explanation, dict):
            self.last_explanation = None
            return

        required_keys = {"known", "matters", "next"}
        if not required_keys.issubset(explanation.keys()):
            self.last_explanation = None
            return

        self.last_explanation = {
            "known": explanation["known"],
            "matters": explanation["matters"],
            "next": explanation["next"],
        }

    # -------------------------------------------------
    # TARGET 7: TECHNICIAN AUTHORITY PRESERVATION
    # -------------------------------------------------
    def _preserve_technician_authority(self, step: dict):
        tech_assertion = step.get("technician_assertion")
        evidence_key = step.get("evidence_key")

        if not tech_assertion or not evidence_key:
            return

        if evidence_key not in self.context:
            raise SpineExecutionError(
                f"Technician insight noted. Verify '{evidence_key}' to proceed."
            )

        if self.context.get(evidence_key) is False:
            raise SpineExecutionError(
                f"Technician insight conflicts with evidence. "
                f"Re-check '{evidence_key}' before proceeding."
            )

    # -------------------------------------------------
    # UI SIGNALING (READ-ONLY WIRING STATE)
    # -------------------------------------------------
    def get_ui_state(self) -> dict:
        step = None
        try:
            step = self.current_step()
        except SpineExecutionError:
            pass

        if self.last_error:
            return {
                "state": "BLOCKED",
                "step_id": step.get("id") if step else None,
                "explanation": self.last_explanation,
                "error": self.last_error,
                "eliminated_causes": list(self.eliminated_causes),
                "wiring_state": self.wiring_fsm.state.name,
            }

        authority = step.get("authority", "advise") if step else "advise"

        if authority == "command":
            state = "COMMAND_REQUIRED"
        elif authority == "listen":
            state = "LISTENING"
        else:
            state = "ADVISORY"

        return {
            "state": state,
            "step_id": step.get("id") if step else None,
            "explanation": self.last_explanation,
            "eliminated_causes": list(self.eliminated_causes),
            "wiring_state": self.wiring_fsm.state.name,
        }

    # -------------------------------------------------
    # ADVANCE DIAGNOSTIC
    # -------------------------------------------------
    def advance(self, measured_data: dict) -> dict:
        self.last_error = None

        try:
            step = self.current_step()

            self._enforce_locked_core(step)

            if measured_data:
                self._validate_measured_data(measured_data)
                self.context.update(measured_data)

            enforce_assumption_guard(
                spine_id=self.spine_id,
                step=step,
                context=self.context,
            )

            self._apply_negative_certainty(step)
            self._enforce_authority_boundary(step)
            self._apply_explanation_fidelity(step)
            self._preserve_technician_authority(step)

            exit_condition = step.get("exit_condition")
            if exit_condition:
                required_key = exit_condition.split("==")[0].strip()
                if required_key not in self.context:
                    raise SpineExecutionError(
                        f"Exit condition not met. Missing data: {required_key}"
                    )

            self.current_index += 1
            return self.current_step()

        except SpineExecutionError as e:
            self.last_error = str(e)
            raise
