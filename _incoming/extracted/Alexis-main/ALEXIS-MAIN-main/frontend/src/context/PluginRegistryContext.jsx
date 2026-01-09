import React, { createContext, useContext, useMemo, useState, useCallback } from "react";

const PluginRegistryContext = createContext(null);

const DEFAULT_PLUGINS = [
  {
    id: "core_obd_comm",
    name: "OBD Communication Core",
    description: "Enables live OBD / ECU communication and polling.",
    status: "active",
    authorityLevel: "advisory",
    safetyCritical: false,
  },
  {
    id: "diesel_common_rail_authority",
    name: "Diesel Common-Rail Authority",
    description: "Allows authority-level diesel fuel system diagnostics.",
    status: "inactive",
    authorityLevel: "authority",
    safetyCritical: true,
  },
  {
    id: "visual_wiring_interpretation",
    name: "Visual Wiring Interpretation",
    description: "Allows ALEXIS to trace, highlight, and reason about wiring diagrams.",
    status: "active",
    authorityLevel: "advisory",
    safetyCritical: false,
  },
  {
    id: "fault_injection_simulator",
    name: "Fault Injection Simulator",
    description: "Enables simulated faults for training and validation.",
    status: "inactive",
    authorityLevel: "advisory",
    safetyCritical: false,
  },
  {
    id: "voice_diagnostics_engine",
    name: "Voice Diagnostics Engine",
    description: "Enables voice-based interaction and spoken diagnostic flow.",
    status: "active",
    authorityLevel: "advisory",
    safetyCritical: false,
  },
];

export const PluginRegistryProvider = ({ children }) => {
  const [plugins, setPlugins] = useState(DEFAULT_PLUGINS);

  const setPluginStatus = useCallback((id, status) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p))
    );
  }, []);

  const value = useMemo(
    () => ({ plugins, setPluginStatus }),
    [plugins, setPluginStatus]
  );

  return (
    <PluginRegistryContext.Provider value={value}>
      {children}
    </PluginRegistryContext.Provider>
  );
};

export const usePluginRegistry = () => {
  const ctx = useContext(PluginRegistryContext);
  if (!ctx) {
    throw new Error("usePluginRegistry must be used within PluginRegistryProvider");
  }
  return ctx;
};

export const usePluginCapability = (requiredIds = []) => {
  const { plugins } = usePluginRegistry();

  if (!requiredIds.length) {
    return {
      canUseLive: true,
      canUseAuthority: true,
      blockedBy: [],
      blockReason: null,
    };
  }

  const requiredPlugins = plugins.filter((p) => requiredIds.includes(p.id));
  const blockedBy = requiredPlugins.filter(
    (p) => p.status !== "active" || p.status === "locked"
  );

  const anySafetyCriticalInactive = requiredPlugins.some(
    (p) => p.safetyCritical && p.status !== "active"
  );

  const canUseLive = blockedBy.length === 0;
  const canUseAuthority = canUseLive && !anySafetyCriticalInactive;

  const blockReason =
    blockedBy.length > 0
      ? `Capability limited: ${blockedBy
          .map((p) => `${p.name} (${p.status})`)
          .join(", ")}`
      : null;

  return {
    canUseLive,
    canUseAuthority,
    blockedBy,
    blockReason,
  };
};
