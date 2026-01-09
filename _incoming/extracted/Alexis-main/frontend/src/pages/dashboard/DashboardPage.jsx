import React from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Cable, Mic, ScanEye } from "lucide-react";

// FINAL EMERGENT BUILD: Clean technician dashboard

const InfoCard = ({ label, value, icon: Icon, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-w-[200px] max-w-[280px] rounded-xl border border-slate-500/50 bg-gradient-to-br from-[#09132c] via-[#05031c] to-black shadow-[0_0_18px_rgba(15,23,42,0.8)] px-6 py-5 relative overflow-hidden text-left transition-transform duration-150 hover:-translate-y-[1px] focus:outline-none"
    >
      <div className="pointer-events-none absolute -right-16 top-1/2 h-[2px] w-40 -translate-y-1/2 bg-[radial-gradient(circle_at_left,_rgba(129,140,248,0.6),_transparent)] opacity-80" />
      <div className="text-[11px] tracking-[0.25em] uppercase text-slate-300/80 mb-3">
        {label}
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="text-base font-semibold tracking-wide text-slate-50">
          {value}
        </div>
        {Icon && (
          <div className="h-10 w-10 rounded-lg border border-slate-400/70 bg-slate-950/70 flex items-center justify-center shadow-[0_0_10px_rgba(129,140,248,0.6)]">
            <Icon className="h-5 w-5 text-slate-200" />
          </div>
        )}
      </div>
    </button>
  );
};

const DashboardPage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-wide text-slate-50">
          Technician Dashboard
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Select a diagnostic tool to begin
        </p>
      </div>

      {/* Core diagnostic tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard
          label="Wiring Diagrams"
          value="Interactive teaching"
          icon={Cable}
          onClick={() => navigate("/wiring-diagrams")}
        />
        <InfoCard
          label="Visual Diagnostics"
          value="Camera inspection"
          icon={ScanEye}
          onClick={() => navigate("/visual-diagnostics")}
        />
        <InfoCard
          label="Voice Diagnostics"
          value="ALEXIS assistant"
          icon={Mic}
          onClick={() => navigate("/voice-diagnostics")}
        />
        <InfoCard
          label="Active Session"
          value="No active session"
          icon={Activity}
        />
      </div>

      {/* Status indicator */}
      <div className="mt-8 flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs text-slate-400 tracking-wide">
          ALEXIS SYSTEM ONLINE
        </span>
      </div>
    </div>
  );
};

export default DashboardPage;
