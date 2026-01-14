from enum import Enum, auto


class WiringState(Enum):
    IDLE = auto()
    DIAGRAM_LOADED = auto()
    SELECTION_CAPTURED = auto()
    INVALID_SELECTION = auto()
    CIRCUIT_IDENTIFIED = auto()
    SEMANTIC_OVERLAY_ACTIVE = auto()
    AUTHORITY_DECLARATION = auto()
    ACTION_COMMAND = auto()
    RESULT_EVALUATION = auto()
    CIRCUIT_CONFIRMED = auto()
    CIRCUIT_FAILED = auto()
    VISION_VALIDATION = auto()
    SESSION_TERMINATED = auto()


class WiringStateMachine:
    def __init__(self):
        self.state = WiringState.IDLE

    def transition(self, event: str):
        """
        Deterministic wiring transitions.
        No guessing. Invalid transitions raise immediately.
        """

        if self.state == WiringState.IDLE:
            if event == "diagram_opened":
                self.state = WiringState.DIAGRAM_LOADED
                return
            raise RuntimeError("Invalid transition from IDLE")

        if self.state == WiringState.DIAGRAM_LOADED:
            if event == "selection_made":
                self.state = WiringState.SELECTION_CAPTURED
                return
            raise RuntimeError("Selection required")

        if self.state == WiringState.SELECTION_CAPTURED:
            if event == "selection_invalid":
                self.state = WiringState.INVALID_SELECTION
                return
            if event == "circuit_resolved":
                self.state = WiringState.CIRCUIT_IDENTIFIED
                return
            raise RuntimeError("Invalid selection resolution")

        if self.state == WiringState.INVALID_SELECTION:
            if event == "selection_made":
                self.state = WiringState.SELECTION_CAPTURED
                return
            raise RuntimeError("Awaiting valid selection")

        if self.state == WiringState.CIRCUIT_IDENTIFIED:
            if event == "overlay_ready":
                self.state = WiringState.SEMANTIC_OVERLAY_ACTIVE
                return
            raise RuntimeError("Overlay preparation required")

        if self.state == WiringState.SEMANTIC_OVERLAY_ACTIVE:
            if event == "confidence_reached":
                self.state = WiringState.AUTHORITY_DECLARATION
                return
            raise RuntimeError("Confidence threshold not met")

        if self.state == WiringState.AUTHORITY_DECLARATION:
            if event == "action_issued":
                self.state = WiringState.ACTION_COMMAND
                return
            raise RuntimeError("Action not issued")

        if self.state == WiringState.ACTION_COMMAND:
            if event == "result_received":
                self.state = WiringState.RESULT_EVALUATION
                return
            raise RuntimeError("Awaiting technician result")

        if self.state == WiringState.RESULT_EVALUATION:
            if event == "result_ok":
                self.state = WiringState.CIRCUIT_CONFIRMED
                return
            if event == "result_fail":
                self.state = WiringState.CIRCUIT_FAILED
                return
            raise RuntimeError("Invalid result")

        if self.state in (
            WiringState.CIRCUIT_CONFIRMED,
            WiringState.CIRCUIT_FAILED,
        ):
            if event == "next_circuit":
                self.state = WiringState.CIRCUIT_IDENTIFIED
                return
            raise RuntimeError("Awaiting next circuit")

        raise RuntimeError("State machine locked")
