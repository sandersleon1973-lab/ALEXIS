from enum import Enum
from dataclasses import dataclass
from typing import Optional, List


class AlexisMode(Enum):
    DIAGNOSE = "diagnose"
    EXPLAIN = "explain"
    REFUSE = "refuse"


class RefusalReason(Enum):
    INSUFFICIENT_CONTEXT = "insufficient_context"
    UNSAFE_OPERATION = "unsafe_operation"
    POLICY_VIOLATION = "policy_violation"


@dataclass(frozen=True)
class DiagnosticContext:
    dtcs: Optional[List[str]] = None
    symptoms: Optional[List[str]] = None
    vehicle_identified: bool = False
    ignition_state_known: bool = False
    live_data_available: bool = False


@dataclass(frozen=True)
class ReasoningDecision:
    allowed: bool
    mode: AlexisMode
    explanation: str
    refusal_reason: Optional[RefusalReason] = None


class AlexisReasoningContract:
    """
    THIS CLASS IS CONSTITUTIONAL.
    Any reasoning performed by ALEXIS MUST pass through here.
    """

    @staticmethod
    def evaluate_context(context: DiagnosticContext) -> ReasoningDecision:
        # Absolute safety gate: context object must exist
        if context is None:
            return ReasoningDecision(
                allowed=False,
                mode=AlexisMode.REFUSE,
                refusal_reason=RefusalReason.UNSAFE_OPERATION,
                explanation="No diagnostic context provided. Reasoning blocked."
            )

        # Minimum viable diagnostic signal required
        has_signal = bool(context.dtcs) or bool(context.symptoms)
        if not has_signal:
            return ReasoningDecision(
                allowed=False,
                mode=AlexisMode.EXPLAIN,
                refusal_reason=RefusalReason.INSUFFICIENT_CONTEXT,
                explanation=(
                    "No fault codes or symptoms supplied. "
                    "ALEXIS will not speculate. Provide technician input to proceed."
                )
            )

        # Vehicle identity must be known before structured diagnosis
        if not context.vehicle_identified:
            return ReasoningDecision(
                allowed=False,
                mode=AlexisMode.EXPLAIN,
                refusal_reason=RefusalReason.INSUFFICIENT_CONTEXT,
                explanation=(
                    "Vehicle identification missing. "
                    "Accurate diagnosis requires confirmed vehicle details."
                )
            )

        # Ignition state ambiguity is a hard stop for safety
        if not context.ignition_state_known:
            return ReasoningDecision(
                allowed=False,
                mode=AlexisMode.EXPLAIN,
                refusal_reason=RefusalReason.UNSAFE_OPERATION,
                explanation=(
                    "Ignition state unknown. "
                    "ALEXIS will not reason under unsafe electrical conditions."
                )
            )

        # If all mandatory conditions are satisfied, reasoning is permitted
        return ReasoningDecision(
            allowed=True,
            mode=AlexisMode.DIAGNOSE,
            explanation=(
                "Sufficient diagnostic context verified. "
                "Proceeding with technician-first diagnostic reasoning."
            )
        )
from enum import auto
from pathlib import Path
import json


class DiagnosticState(Enum):
    IDLE = auto()
    NO_COMMUNICATION = auto()
    DIESEL_NO_START = auto()
    EXIT = auto()


class AuthorityViolation(Exception):
    pass


class DiagnosticStateMachine:
    def __init__(self):
        self.state = DiagnosticState.IDLE
        self.resolved_states = set()

    def route(self, context: DiagnosticContext) -> DiagnosticState:
        if context is None:
            raise AuthorityViolation("No diagnostic context available.")

        if not context.live_data_available and not context.ignition_state_known:
            self.state = DiagnosticState.NO_COMMUNICATION
            return self.state

        if context.live_data_available:
            self.state = DiagnosticState.DIESEL_NO_START
            return self.state

        raise AuthorityViolation("No valid diagnostic state for given context.")

    def resolve(self):
        self.resolved_states.add(self.state)
        self.state = DiagnosticState.EXIT


class SpineRegistry:
    def __init__(self, spines_root: Path):
        self.spines_root = spines_root
        self._cache = {}

    def load_spine(self, spine_id: str) -> dict:
        if spine_id in self._cache:
            return self._cache[spine_id]

        for spine_dir in self.spines_root.iterdir():
            definition_path = spine_dir / "spine_definition.json"
            if not definition_path.exists():
                continue

            with open(definition_path, "r", encoding="utf-8") as f:
                definition = json.load(f)

            if definition.get("spine_id") == spine_id:
                self._cache[spine_id] = definition
                return definition

        raise FileNotFoundError(f"Spine definition not found for '{spine_id}'")
