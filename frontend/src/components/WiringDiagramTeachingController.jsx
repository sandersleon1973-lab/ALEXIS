import { useEffect, useState } from "react";

export default function WiringDiagramTeachingController({ totalPages, setPageNumber }) {
  const [highlight, setHighlight] = useState(null);

  useEffect(() => {
    function handleAlexisCommand(e) {
      const { command, page, bounds } = e.detail || {};

      if (command === "GOTO_PAGE" && page >= 1 && page <= totalPages) {
        setPageNumber(page);
        setHighlight(null);
        return;
      }

      if (command === "SHOW_ON_DIAGRAM") {
        if (page && page >= 1 && page <= totalPages) setPageNumber(page);
        if (bounds) setHighlight(bounds);
      }

      if (command === "CLEAR_DIAGRAM") {
        setHighlight(null);
      }
    }

    window.addEventListener("ALEXIS_DIAGRAM_COMMAND", handleAlexisCommand);
    return () => window.removeEventListener("ALEXIS_DIAGRAM_COMMAND", handleAlexisCommand);
  }, [totalPages, setPageNumber]);

  if (!highlight) return null;

  return (
    <div
      data-testid="alexis-diagram-teaching-highlight"
      style={{
        position: "absolute",
        left: highlight.x,
        top: highlight.y,
        width: highlight.width,
        height: highlight.height,
        border: "3px solid #00ffe0",
        boxShadow: "0 0 25px #00ffe0",
        animation: "alexisPulse 1.5s infinite",
        pointerEvents: "none",
        borderRadius: "4px",
        zIndex: 50,
      }}
    />
  );
}
