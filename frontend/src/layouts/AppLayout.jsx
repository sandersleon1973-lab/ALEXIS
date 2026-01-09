import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  HardDrive,
  ActivitySquare,
  PlugZap,
  AlertTriangle,
  Cpu,
  FlaskConical,
  ScanEye,
  Mic,
  Cable,
  Settings,
  Menu,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/devices", label: "Devices", icon: HardDrive },
  { to: "/diagnostic-console", label: "Diagnostic Console", icon: ActivitySquare },
  { to: "/plugins", label: "Plugins", icon: PlugZap },
  { to: "/fault-injection", label: "Fault Injection", icon: AlertTriangle },
  { to: "/simulator", label: "Simulator", icon: Cpu },
  { to: "/test-scenarios", label: "Test Scenarios", icon: FlaskConical },
  { to: "/visual-diagnostics", label: "Visual Diagnostics", icon: ScanEye },
  { to: "/voice-diagnostics", label: "Voice Diagnostics", icon: Mic },
  { to: "/wiring-diagrams", label: "Wiring Diagrams", icon: Cable },
  { to: "/settings", label: "Settings", icon: Settings },
];

const AppLayout = () => {
  return (
    <div className="h-screen bg-[radial-gradient(circle_at_bottom,_#0b101e,_#02040a_60%,_#000000)] flex items-center justify-center py-4" data-testid="app-shell">
      <div className="w-[95vw] max-w-[1400px] h-[88vh] rounded-[24px] border border-slate-500/30 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),_rgba(15,23,42,0.9)_45%,_rgba(3,7,18,0.98))] shadow-[0_0_40px_rgba(15,23,42,0.9)] overflow-hidden flex text-slate-100">
        {/* Sidebar */}
        <aside className="w-[260px] bg-gradient-to-b from-slate-950/95 via-slate-950/90 to-black/95 border-r border-slate-500/40 relative flex flex-col" data-testid="sidebar">
          {/* Brand */}
          <div className="px-2 pt-4 pb-5 border-b border-slate-500/30 flex items-center justify-start">
            <img
              src="https://customer-assets.emergentagent.com/job_zipcheck-agent/artifacts/430tb5p5_ChatGPT%20Image%20Jan%2010%2C%202026%2C%2012_42_08%20AM.png"
              alt="SA Diagnostic Solutions logo"
              className="h-[144px] w-full object-contain sa-logo-img" style={{ paddingTop: "2px" }}
              data-testid="sidebar-sa-logo"
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 pt-6 pb-4 space-y-1 overflow-y-auto custom-scrollbars" data-testid="sidebar-nav">
            {navItems.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                data-testid={`sidebar-navlink-${label.toLowerCase().replace(/\s+/g, "-")}`}
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

          {/* Bottom spacer to mimic chrome rail without controls */}
          <div className="px-4 pb-4 pt-2 mt-auto">
            <div className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/70 shadow-[0_0_18px_rgba(15,23,42,0.9)]" />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 relative bg-gradient-to-b from-slate-900/70 via-slate-950/80 to-black/95 px-10 pt-6 pb-8 flex flex-col min-h-0">
          {/* Top header brand band */}
          <div className="absolute top-0 left-10 flex items-center h-[90px] z-10">
            <img
              src="https://customer-assets.emergentagent.com/job_zipcheck-agent/artifacts/430tb5p5_ChatGPT%20Image%20Jan%2010%2C%202026%2C%2012_42_08%20AM.png"
              alt="SA Diagnostic Solutions logo"
              className="h-[82px] w-auto object-contain" style={{ filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.45))" }}
              data-testid="header-sa-logo"
            />
          </div>
          <div className="absolute top-1 right-10 flex items-center justify-center h-[60px] w-[320px] z-10" style={{ transform: "translate(-19px, -8px)" }}>
            <img
              src="https://customer-assets.emergentagent.com/job_zipcheck-agent/artifacts/4z758eq0_ChatGPT%20Image%20Jan%2010%2C%202026%2C%2012_40_06%20AM.png"
              alt="ALEXIS logo"
              className="h-full w-auto object-contain opacity-100 visible transform scale-[1.22]"
              data-testid="header-alexis-logo"
            />
          </div>

          {/* Inner frame for routed content */}
          <div className="flex-1 w-full mt-6 rounded-[20px] border border-slate-500/40 bg-gradient-to-b from-[#050b1f]/90 via-[#06031c]/95 to-black/95 shadow-[0_0_26px_rgba(15,23,42,0.85)] p-8 flex flex-col overflow-y-auto min-h-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
