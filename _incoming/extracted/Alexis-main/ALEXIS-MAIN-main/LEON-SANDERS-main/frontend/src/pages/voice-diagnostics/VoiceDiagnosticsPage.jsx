import React from "react";
import ALEXISConversationPanel from "@/components/ALEXISConversationPanel";

const VoiceDiagnosticsPage = () => {
  return (
    <div className="h-full flex flex-col">
      <ALEXISConversationPanel context="VOICE_SYMPTOM_DIAGNOSTICS" />
    </div>
  );
};

export default VoiceDiagnosticsPage;
