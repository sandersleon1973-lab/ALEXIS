import React from "react";

export default function ToolsPanel({
  diagramTeachingEnabled,
  children,
}) {
  return (
    <div className="tools-panel">
      {diagramTeachingEnabled && (
        <div className="diagram-teaching-badge">
          DIAGRAM TEACHING MODE
        </div>
      )}
      {children}
    </div>
  );
}
