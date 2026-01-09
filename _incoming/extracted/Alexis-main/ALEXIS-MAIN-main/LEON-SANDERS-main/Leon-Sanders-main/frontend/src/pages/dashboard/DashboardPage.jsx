import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Activity, Usb, Clock3, ChevronRight, Mic, ScanEye, Info } from "lucide-react";
import { technicianDashboardMock } from "@/mock/dashboardMock";

const InfoCard = ({ label, value, icon: Icon, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-w-[240px] max-w-[320px] rounded-xl border border-slate-500/50 bg-gradient-to-br from-[#09132c] via-[#05031c] to-black shadow-[0_0_18px_rgba(15,23,42,0.8)] px-7 py-5 relative overflow-hidden text-left transition-transform duration-150 hover:-translate-y-[1px] focus:outline-none"
    >
      {/* highlight streak */}
      <div className="pointer-events-none absolute -right-16 top-1/2 h-[2px] w-40 -translate-y-1/2 bg-[radial-gradient(circle_at_left,_rgba(129,140,248,0.6),_transparent)] opacity-80" />
      <div className="text-[11px] tracking-[0.25em] uppercase text-slate-300/80 mb-3">
        {label}
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="text-lg font-semibold tracking-wide text-slate-50">
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
  const { technicianName, shiftStart, activeSession, j2534Device, pendingFaults } =
    technicianDashboardMock;

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* Header row */}
      <div className="flex items-start justify-end gap-6 mb-4">
        <div className="flex items-start" />

        <div className="flex items-center gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-slate-400/70 bg-slate-900/70 text-slate-50 text-xs tracking-[0.28em] uppercase px-6 py-2 rounded-full shadow-[0_0_14px_rgba(15,23,42,0.8)] hover:bg-slate-800/80 hover:border-sky-400/80 hover:text-sky-100 hover:shadow-[0_0_18px_rgba(56,189,248,0.55)] transition-colors transition-shadow duration-200"
              >
                <span className="mr-2">Session History</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-950/95 border-slate-600/80 text-slate-100">
              <DialogHeader>
                <DialogTitle>Session History</DialogTitle>
                <DialogDescription>
                  This is a placeholder for the session history view. We will
                  connect it to real diagnostic sessions in a later phase.
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                className="border border-sky-400/80 bg-gradient-to-r from-sky-500/30 via-sky-400/30 to-sky-300/20 text-slate-50 text-xs tracking-[0.28em] uppercase px-7 py-2 rounded-full shadow-[0_0_26px_rgba(56,189,248,0.85)] hover:border-sky-300 hover:shadow-[0_0_34px_rgba(56,189,248,1)] transition-colors transition-shadow duration-200"
              >
                <span className="mr-2">New Scan</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-950/95 border-sky-500/60 text-slate-100">
              <DialogHeader>
                <DialogTitle>New Scan</DialogTitle>
                <DialogDescription>
                  This is a mocked start of a new diagnostic scan. In the full
                  application this will launch the live scan workflow.
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 2 x 3 grid of dashboard cards */}
      <div className="mt-0 grid grid-cols-1 md:grid-cols-3 gap-6">
        <InfoCard
          label="Active Session"
          value={activeSession.vehicle}
          icon={Activity}
        />
        <InfoCard
          label="J2534 Device"
          value={j2534Device.status}
          icon={Usb}
        />
        <InfoCard
          label="Pending Faults"
          value={pendingFaults.label}
          icon={Clock3}
        />
        <InfoCard
          label="Voice Diagnostics (ALEXIS)"
          value="Hands-free voice sessions"
          icon={Mic}
          onClick={() => navigate("/voice-diagnostics")}
        />
        <InfoCard
          label="Visual Diagnostics"
          value="Camera and visual analysis"
          icon={ScanEye}
          onClick={() => navigate("/visual-diagnostics")}
        />
        <InfoCard
          label="About ALEXIS / System Overview"
          value="Learn about the diagnostics assistant"
          icon={Info}
          onClick={() => navigate("/about-alexis")}
        />
      </div>
    </div>
  );
};

export default DashboardPage;
