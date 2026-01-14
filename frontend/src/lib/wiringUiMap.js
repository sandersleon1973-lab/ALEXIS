export function mapWiringStateToUI(wiringState) {
  switch (wiringState) {
    case "IDLE":
      return {
        mode: "LOCKED",
        allowDiagramLoad: true,
        allowSelection: false,
        allowCommands: false,
        message: "Load wiring diagram to begin",
      };

    case "DIAGRAM_LOADED":
      return {
        mode: "PASSIVE",
        allowDiagramLoad: true,
        allowSelection: true,
        allowCommands: false,
        message: "Select a wire, pin, or component",
      };

    case "SELECTION_CAPTURED":
      return {
        mode: "HOLD",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: false,
        message: "Analyzing selection",
      };

    case "INVALID_SELECTION":
      return {
        mode: "BLOCKED",
        allowDiagramLoad: false,
        allowSelection: true,
        allowCommands: false,
        message: "Invalid selection. Choose a valid circuit element.",
      };

    case "CIRCUIT_IDENTIFIED":
      return {
        mode: "TEACHING",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: false,
        message: "Circuit identified",
      };

    case "SEMANTIC_OVERLAY_ACTIVE":
      return {
        mode: "GUIDED",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: false,
        message: "Follow the circuit logic",
      };

    case "AUTHORITY_DECLARATION":
      return {
        mode: "PRE_COMMAND",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: false,
        message: "Confirmation required before issuing command",
      };

    case "ACTION_COMMAND":
      return {
        mode: "COMMAND",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: true,
        message: "Perform action exactly as instructed",
      };

    case "RESULT_EVALUATION":
      return {
        mode: "EVALUATING",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: false,
        message: "Evaluating result",
      };

    case "CIRCUIT_CONFIRMED":
      return {
        mode: "SUCCESS",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: false,
        message: "Circuit confirmed",
      };

    case "CIRCUIT_FAILED":
      return {
        mode: "FAILURE",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: false,
        message: "Circuit fault identified",
      };

    default:
      return {
        mode: "BLOCKED",
        allowDiagramLoad: false,
        allowSelection: false,
        allowCommands: false,
        message: "Wiring state unavailable",
      };
  }
}
