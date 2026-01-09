import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { DiagramTeachingProvider } from "@/context/DiagramTeachingContext";
import { PluginRegistryProvider } from "@/context/PluginRegistryContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <PluginRegistryProvider>
      <DiagramTeachingProvider>
        <App />
      </DiagramTeachingProvider>
    </PluginRegistryProvider>
  </React.StrictMode>,
);
