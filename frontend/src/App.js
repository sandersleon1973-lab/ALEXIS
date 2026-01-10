import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import VisualDiagnosticsPage from "@/pages/visual-diagnostics/VisualDiagnosticsPage";
import VoiceDiagnosticsPage from "@/pages/voice-diagnostics/VoiceDiagnosticsPage";
import AboutAlexisPage from "@/pages/about/AboutAlexisPage";
import WiringUploadPage from "@/pages/wiring-diagrams/WiringUploadPage";

import PlaceholderPage from "@/pages/placeholders/PlaceholderPage";

// NOTE: Backend integration exists in the template, but this dashboard UI is
// CURRENTLY USING MOCKED DATA ONLY (see src/mock/dashboardMock.js).
// We will wire real APIs later.

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index path="/" element={<DashboardPage />} />
          <Route
            path="/devices"
            element={
              <PlaceholderPage
                title="Devices"
                description="Devices management view will list connected ECUs, interfaces, and profiles."
              />
            }
          />
          <Route
            path="/diagnostic-console"
            element={
              <PlaceholderPage
                title="Diagnostic Console"
                description="Live diagnostic console for viewing data streams and command history."
              />
            }
          />
          <Route
            path="/plugins"
            element={
              <PlaceholderPage
                title="Plugins"
                description="Manage installed plugins and extensions for additional diagnostic capabilities."
              />
            }
          />
          <Route
            path="/fault-injection"
            element={<PlaceholderPage title="Fault Injection" />}
          />
          <Route path="/simulator" element={<PlaceholderPage title="Simulator" />} />
          <Route
            path="/test-scenarios"
            element={<PlaceholderPage title="Test Scenarios" />}
          />
          <Route
            path="/visual-diagnostics"
            element={<VisualDiagnosticsPage />}
          />
          <Route
            path="/voice-diagnostics"
            element={<VoiceDiagnosticsPage />}
          />
          <Route path="/wiring-diagrams/upload" element={<WiringUploadPage />} />
          <Route path="/wiring-diagrams" element={<WiringUploadPage />} />
          <Route path="/about-alexis" element={<AboutAlexisPage />} />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
