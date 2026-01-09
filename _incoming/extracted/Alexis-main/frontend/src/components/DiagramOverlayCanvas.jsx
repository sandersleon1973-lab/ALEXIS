import React, { useEffect, useState, useRef, useCallback } from "react";

/**
 * DiagramOverlayCanvas - Visual Interaction Layer for Diagram Teaching
 * 
 * Features:
 * 1. Renders ALEXIS visual commands (highlight, pulse, trace, arrow)
 * 2. User click-to-select region interaction
 * 3. Animated overlays for teaching emphasis
 */

// Color palette for overlays
const COLORS = {
  cyan: { fill: "rgba(56, 189, 248, 0.3)", stroke: "rgb(56, 189, 248)" },
  green: { fill: "rgba(34, 197, 94, 0.3)", stroke: "rgb(34, 197, 94)" },
  purple: { fill: "rgba(168, 85, 247, 0.3)", stroke: "rgb(168, 85, 247)" },
  yellow: { fill: "rgba(234, 179, 8, 0.4)", stroke: "rgb(234, 179, 8)" },
  red: { fill: "rgba(239, 68, 68, 0.3)", stroke: "rgb(239, 68, 68)" },
  white: { fill: "rgba(255, 255, 255, 0.2)", stroke: "rgb(255, 255, 255)" },
};

// Generate unique ID
const genId = () => `overlay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const DiagramOverlayCanvas = ({
  page,
  zoom = 1,
  viewportOrigin = { x: 0, y: 0 },
  overlayCommands = [],
  onRegionSelect = null, // Callback when user selects a region
  enableUserSelection = true,
}) => {
  const [activeCommands, setActiveCommands] = useState([]);
  const [userSelection, setUserSelection] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null);
  const canvasRef = useRef(null);

  // Process incoming overlay commands
  useEffect(() => {
    if (!overlayCommands || overlayCommands.length === 0) {
      // Use setTimeout to avoid direct setState in effect
      const id = setTimeout(() => setActiveCommands([]), 0);
      return () => clearTimeout(id);
    }

    const now = Date.now();
    const withExpiry = overlayCommands.map((cmd, idx) => ({
      ...cmd,
      id: cmd.id || genId(),
      _expiresAt: now + (cmd.durationMs || 5000),
      _index: idx,
    }));

    const id = setTimeout(() => setActiveCommands(withExpiry), 0);
    return () => clearTimeout(id);
  }, [overlayCommands]);

  // Prune expired overlays
  useEffect(() => {
    if (activeCommands.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setActiveCommands((prev) => prev.filter((cmd) => cmd._expiresAt > now));
    }, 200);

    return () => clearInterval(timer);
  }, [activeCommands.length]);

  // Handle user mouse down for region selection
  const handleMouseDown = useCallback((e) => {
    if (!enableUserSelection) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    setIsSelecting(true);
    setSelectionStart({ x, y });
    setUserSelection(null);
  }, [enableUserSelection, zoom]);

  // Handle user mouse move for region selection
  const handleMouseMove = useCallback((e) => {
    if (!isSelecting || !selectionStart) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    const minX = Math.min(selectionStart.x, x);
    const minY = Math.min(selectionStart.y, y);
    const maxX = Math.max(selectionStart.x, x);
    const maxY = Math.max(selectionStart.y, y);

    setUserSelection({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    });
  }, [isSelecting, selectionStart, zoom]);

  // Handle user mouse up - finalize selection
  const handleMouseUp = useCallback(() => {
    if (!isSelecting) return;
    
    setIsSelecting(false);
    
    if (userSelection && userSelection.width > 10 && userSelection.height > 10) {
      // Valid selection - notify parent
      if (onRegionSelect) {
        onRegionSelect({
          page,
          bounds: userSelection,
          zoom,
        });
      }
    } else {
      // Too small - clear
      setUserSelection(null);
    }
    
    setSelectionStart(null);
  }, [isSelecting, userSelection, page, zoom, onRegionSelect]);

  // Clear selection on click outside
  const handleDoubleClick = useCallback(() => {
    setUserSelection(null);
  }, []);

  if (!page) return null;

  // Render HIGHLIGHT_BOX - Calm, soft glow
  const renderHighlightBox = (cmd) => {
    if (!cmd.bounds) return null;
    const { x, y, width, height } = cmd.bounds;
    const color = COLORS[cmd.style?.color] || COLORS.cyan;
    const intensity = cmd.style?.intensity || 0.4;

    return (
      <div
        key={cmd.id}
        className="absolute transition-all duration-500"
        style={{
          left: (x - viewportOrigin.x) * zoom,
          top: (y - viewportOrigin.y) * zoom,
          width: width * zoom,
          height: height * zoom,
          backgroundColor: color.fill.replace('0.3', (0.2 * intensity).toString()),
          border: `2px solid ${color.stroke}`,
          borderRadius: '8px',
          boxShadow: `0 0 30px ${color.fill}, inset 0 0 20px ${color.fill}`,
          pointerEvents: "none",
          animation: "softGlow 3s ease-in-out infinite",
        }}
      >
        {/* Subtle corner accents - not distracting */}
        <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 rounded-tl-lg opacity-60" style={{ borderColor: color.stroke }} />
        <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 rounded-tr-lg opacity-60" style={{ borderColor: color.stroke }} />
        <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 rounded-bl-lg opacity-60" style={{ borderColor: color.stroke }} />
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 rounded-br-lg opacity-60" style={{ borderColor: color.stroke }} />
      </div>
    );
  };

  // Render PULSE_DOT - Gentle pulse, not aggressive
  const renderPulseDot = (cmd) => {
    if (!cmd.anchor) return null;
    const { x, y } = cmd.anchor;
    const color = COLORS[cmd.style?.color] || COLORS.yellow;
    const size = 16;

    return (
      <div
        key={cmd.id}
        className="absolute"
        style={{
          left: (x - viewportOrigin.x) * zoom - size / 2,
          top: (y - viewportOrigin.y) * zoom - size / 2,
          pointerEvents: "none",
        }}
      >
        {/* Soft outer glow - not aggressive ping */}
        <div
          className="absolute rounded-full"
          style={{
            width: size * 2.5,
            height: size * 2.5,
            left: -size * 0.75,
            top: -size * 0.75,
            backgroundColor: color.fill,
            opacity: 0.3,
            animation: "softPulse 2s ease-in-out infinite",
          }}
        />
        {/* Inner solid dot */}
        <div
          className="absolute rounded-full"
          style={{
            width: size,
            height: size,
            backgroundColor: color.stroke,
            boxShadow: `0 0 20px ${color.fill}`,
          }}
        />
      </div>
    );
  };

  // Render TRACE_PATH
  const renderTracePath = (cmd) => {
    if (!cmd.pathPoints || cmd.pathPoints.length < 2) return null;
    const color = COLORS[cmd.style?.color] || COLORS.cyan;

    const points = cmd.pathPoints.map((pt) => ({
      x: (pt.x - viewportOrigin.x) * zoom,
      y: (pt.y - viewportOrigin.y) * zoom,
    }));

    const pathD = points
      .map((pt, idx) => `${idx === 0 ? "M" : "L"}${pt.x},${pt.y}`)
      .join(" ");

    return (
      <svg
        key={cmd.id}
        className="absolute inset-0 pointer-events-none overflow-visible"
        style={{ width: '100%', height: '100%' }}
      >
        {/* Glow effect */}
        <defs>
          <filter id={`glow_${cmd.id}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Path with animation */}
        <path
          d={pathD}
          fill="none"
          stroke={color.stroke}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#glow_${cmd.id})`}
          className="animate-pulse"
          style={{
            strokeDasharray: "10,5",
            animation: "dash 1s linear infinite",
          }}
        />
        {/* Start and end markers */}
        <circle cx={points[0].x} cy={points[0].y} r={6} fill={color.stroke} />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={8} fill={color.stroke} />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill="white" />
      </svg>
    );
  };

  // Render ARROW_POINTER - Gentle bounce, not aggressive
  const renderArrowPointer = (cmd) => {
    if (!cmd.anchor) return null;
    const { x, y } = cmd.anchor;
    const color = COLORS[cmd.style?.color] || COLORS.red;
    const px = (x - viewportOrigin.x) * zoom;
    const py = (y - viewportOrigin.y) * zoom;

    return (
      <div
        key={cmd.id}
        className="absolute pointer-events-none"
        style={{
          left: px - 15,
          top: py - 40,
          animation: "gentleBounce 2s ease-in-out infinite",
        }}
      >
        {/* Simple, clean arrow */}
        <svg
          width="30"
          height="45"
          viewBox="0 0 30 45"
        >
          <defs>
            <filter id={`arrow_glow_${cmd.id}`}>
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Arrow body */}
          <polygon
            points="15,45 3,22 10,22 10,0 20,0 20,22 27,22"
            fill={color.stroke}
            filter={`url(#arrow_glow_${cmd.id})`}
            opacity="0.9"
          />
        </svg>
      </div>
    );
  };

  // Render LABEL
  const renderLabel = (cmd) => {
    if (!cmd.anchor || !cmd.text) return null;
    const { x, y } = cmd.anchor;
    const color = COLORS[cmd.style?.color] || COLORS.white;
    const px = (x - viewportOrigin.x) * zoom;
    const py = (y - viewportOrigin.y) * zoom;

    return (
      <div
        key={cmd.id}
        className="absolute pointer-events-none"
        style={{
          left: px,
          top: py,
          transform: 'translate(-50%, -100%)',
        }}
      >
        <div
          className="px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: color.stroke,
            border: `2px solid ${color.stroke}`,
            boxShadow: `0 0 15px ${color.fill}`,
          }}
        >
          {cmd.text}
          {/* Arrow pointing down */}
          <div
            className="absolute left-1/2 -bottom-2"
            style={{
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: `8px solid ${color.stroke}`,
            }}
          />
        </div>
      </div>
    );
  };

  // Render command based on type
  const renderCommand = (cmd) => {
    if (cmd.page !== page) return null;

    switch (cmd.type) {
      case "HIGHLIGHT_BOX":
        return renderHighlightBox(cmd);
      case "PULSE_DOT":
        return renderPulseDot(cmd);
      case "TRACE_PATH":
        return renderTracePath(cmd);
      case "ARROW_POINTER":
        return renderArrowPointer(cmd);
      case "LABEL":
        return renderLabel(cmd);
      default:
        return null;
    }
  };

  // Render user selection box
  const renderUserSelection = () => {
    if (!userSelection) return null;

    return (
      <div
        className="absolute border-2 border-dashed transition-all"
        style={{
          left: (userSelection.x - viewportOrigin.x) * zoom,
          top: (userSelection.y - viewportOrigin.y) * zoom,
          width: userSelection.width * zoom,
          height: userSelection.height * zoom,
          borderColor: isSelecting ? 'rgb(56, 189, 248)' : 'rgb(34, 197, 94)',
          backgroundColor: isSelecting 
            ? 'rgba(56, 189, 248, 0.1)' 
            : 'rgba(34, 197, 94, 0.15)',
          pointerEvents: "none",
        }}
      >
        {!isSelecting && (
          <div className="absolute -top-6 left-0 text-xs text-emerald-400 bg-slate-900/90 px-2 py-0.5 rounded">
            Ask ALEXIS about this area
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 overflow-visible"
      style={{
        cursor: enableUserSelection ? (isSelecting ? 'crosshair' : 'crosshair') : 'default',
        pointerEvents: enableUserSelection ? 'auto' : 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* CSS for calm, instructional animations */}
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -15;
          }
        }
        @keyframes softGlow {
          0%, 100% {
            opacity: 0.9;
            box-shadow: 0 0 25px rgba(56, 189, 248, 0.3), inset 0 0 15px rgba(56, 189, 248, 0.1);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 35px rgba(56, 189, 248, 0.4), inset 0 0 20px rgba(56, 189, 248, 0.15);
          }
        }
        @keyframes softPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.2;
          }
        }
        @keyframes gentleBounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
      `}</style>

      {/* ALEXIS visual commands */}
      {activeCommands.map(renderCommand)}

      {/* User selection overlay */}
      {renderUserSelection()}

      {/* Selection hint when no overlays */}
      {activeCommands.length === 0 && !userSelection && enableUserSelection && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-full pointer-events-none">
          Click and drag to select an area, then ask ALEXIS
        </div>
      )}
    </div>
  );
};

export default DiagramOverlayCanvas;
