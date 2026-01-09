import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import LoginPage from "@/pages/auth/LoginPage";
import VoiceDiagnosticsPage from "@/pages/voice-diagnostics/VoiceDiagnosticsPage";
import VisualDiagnosticsPage from "@/pages/visual-diagnostics/VisualDiagnosticsPage";
import WiringUploadPage from "@/pages/wiring-diagrams/WiringUploadPage";

/**
 * ALEXIS FINAL EMERGENT BUILD
 * 
 * Technician-facing routes:
 * - Dashboard (entry point)
 * - Wiring Diagrams
 * - Visual Diagnostics (camera + mobile QR)
 * - Voice Diagnostics (ALEXIS voice)
 */

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Technician Routes - FINAL BUILD */}
        <Route element={<AppLayout />}>
          <Route index path="/" element={<DashboardPage />} />
          <Route path="/wiring-diagrams" element={<WiringUploadPage />} />
          <Route path="/visual-diagnostics" element={<VisualDiagnosticsPage />} />
          <Route path="/voice-diagnostics" element={<VoiceDiagnosticsPage />} />
          
          {/* Catch-all redirect to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
