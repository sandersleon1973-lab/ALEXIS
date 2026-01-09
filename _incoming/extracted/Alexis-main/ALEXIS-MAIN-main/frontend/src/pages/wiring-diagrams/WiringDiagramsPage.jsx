import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const WiringDiagramsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-wide text-slate-100">
          Wiring Diagrams
        </h1>
        <p className="mt-2 text-sm text-slate-300/90 max-w-2xl">
          Upload wiring PDFs for ALEXIS to interpret and assist with circuit-level diagnostics
          (mock layout, no backend yet).
        </p>
      </div>

      {/* Single primary workspace panel */}
      <section className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/90 px-8 py-6 flex flex-col items-start justify-center">
        <div className="max-w-xl">
          <h2 className="text-sm font-semibold tracking-[0.22em] uppercase text-slate-200 mb-3">
            Upload Wiring Documentation
          </h2>
          <p className="text-sm text-slate-300/90 mb-4">
            Use this workspace to upload OEM wiring PDFs and let ALEXIS assist with
            interpreting the diagrams in plain technician language. The detailed
            upload & conversation console will open on a dedicated page.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/wiring-diagrams/upload")}
            className="h-10 px-6 rounded-full border-slate-500 bg-slate-900/90 text-xs tracking-[0.22em] uppercase text-slate-100 hover:bg-slate-800/90"
          >
            Upload Wiring PDF
          </Button>
        </div>
      </section>
    </div>
  );
};

export default WiringDiagramsPage;