import React from "react";
import ALEXISConversationPanel from "@/components/ALEXISConversationPanel";

/**
 * Voice Diagnostics Page
 * ChatGPT-style layout: Single scrollable conversation stream + fixed input bar
 */
const VoiceDiagnosticsPage = () => {
  return (
    <div className="h-full">
      <ALEXISConversationPanel context="VOICE_SYMPTOM_DIAGNOSTICS" />
    </div>
  );
};

export default VoiceDiagnosticsPage;
