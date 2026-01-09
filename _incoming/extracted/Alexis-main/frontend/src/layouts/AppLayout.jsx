import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  Cable,
  ScanEye,
  LogOut,
} from "lucide-react";

// FINAL EMERGENT BUILD: Technician-facing navigation ONLY
const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/wiring-diagrams", label: "Wiring Diagrams", icon: Cable },
  { to: "/visual-diagnostics", label: "Visual Diagnostics", icon: ScanEye },
  { to: "/voice-diagnostics", label: "Voice Diagnostics", icon: Mic },
];

const AppLayout = () => {
  return (
    <div className="h-screen bg-[radial-gradient(circle_at_bottom,_#0b101e,_#02040a_60%,_#000000)] flex items-center justify-center py-4">
      <div className="w-[95vw] max-w-[1400px] h-[88vh] rounded-[24px] border border-slate-500/30 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),_rgba(15,23,42,0.9)_45%,_rgba(3,7,18,0.98))] shadow-[0_0_40px_rgba(15,23,42,0.9)] overflow-hidden flex text-slate-100">
        {/* Sidebar */}
        <aside className="w-[260px] bg-gradient-to-b from-slate-950/95 via-slate-950/90 to-black/95 border-r border-slate-500/40 relative flex flex-col">
          {/* Brand */}
          <div className="px-2 pt-4 pb-5 border-b border-slate-500/30 flex items-center justify-start">
            <img
              src="https://customer-assets.emergentagent.com/job_app-scan-helper/artifacts/xt3un9r4_LOGO3.png"
              alt="SA Diagnostic Solutions logo"
              className="h-[144px] w-full object-contain sa-logo-img"
            />
          </div>

          {/* Navigation - FINAL BUILD LOCKED */}
          <nav className="flex-1 px-4 pt-6 pb-4 space-y-1 overflow-y-auto custom-scrollbars">
            {navItems.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm tracking-wide",
                    "transition-colors transition-shadow duration-200",
                    "border border-transparent",
                    isActive
                      ? "bg-gradient-to-r from-sky-500/20 via-sky-400/10 to-transparent border-sky-400/60 shadow-[0_0_18px_rgba(56,189,248,0.35)] text-sky-100"
                      : "text-slate-300/80 hover:text-sky-100 hover:bg-slate-800/60 hover:border-slate-500/60",
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4 text-slate-300/90 group-hover:text-sky-300" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Exit/Logout */}
          <div className="px-4 pb-4 pt-2 mt-auto">
            <button 
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm tracking-wide text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent hover:border-slate-600/50 transition-colors"
              onClick={() => window.location.href = '/login'}
            >
              <LogOut className="h-4 w-4" />
              <span>Exit Session</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 relative bg-gradient-to-b from-slate-900/70 via-slate-950/80 to-black/95 px-10 pt-6 pb-8 flex flex-col min-h-0">
          {/* Top header brand band */}
          <div className="absolute -top-5 left-10 flex items-center h-[90px] z-10">
            <img
              src="https://customer-assets.emergentagent.com/job_app-scan-helper/artifacts/xt3un9r4_LOGO3.png"
              alt="SA Diagnostic Solutions logo"
              className="h-[86px] w-auto object-contain"
            />
          </div>
          {/* ALEXIS logo with animated glow line */}
          <div className="absolute -top-1 right-24 flex items-center justify-end h-[60px] w-[320px] z-10">
            <div className="relative">
              <img
                src="https://customer-assets.emergentagent.com/job_diag-platform-1/artifacts/edk41f92_image.png"
                alt="ALEXIS logo"
                className="h-[60px] w-auto object-contain opacity-100 visible transform scale-[1.22]"
              />
              {/* Animated glowing line through center */}
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
                <div className="alexis-glow-line" />
              </div>
            </div>
          </div>

          {/* Inner frame for routed content */}
          <div className="flex-1 w-full mt-6 rounded-[20px] border border-slate-500/40 bg-gradient-to-b from-[#050b1f]/90 via-[#06031c]/95 to-black/95 shadow-[0_0_26px_rgba(15,23,42,0.85)] p-8 flex flex-col overflow-hidden min-h-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
