import React from "react";

const AboutCompanyPage = () => {
  return (
    <div
      className="flex flex-col h-full text-slate-100"
      data-testid="about-company-page"
    >
      <h1 className="text-3xl font-semibold tracking-wide mb-4">About SA Diagnostic Solutions</h1>
      <p className="text-sm text-slate-300/90 max-w-3xl mb-3">
        SA Diagnostic Solutions is focused on giving workshop technicians OEM-level
        diagnostic capability without drowning them in theory. The ALEXIS platform
        combines structured test sequences, wiring interpretation, and live voice
        guidance into a single technician-first portal.
      </p>
      <p className="text-sm text-slate-300/90 max-w-3xl mb-3">
        Instead of guesswork and forum hunting, technicians get a clear, enforced
        diagnostic path: electrical survival checks, ECU power integrity, RPM and
        fueling validation, all backed by strict DTC applicability rules. This keeps
        diagnosis repeatable, auditable, and easier to train across a workshop.
      </p>
      <p className="text-sm text-slate-300/90 max-w-3xl">
        The same discipline is applied to the visual and wiring-diagram tooling
        inside the portal. ALEXIS explains what you are looking at in simple
        language while enforcing safety and sequence, so every repair feels
        controlled rather than experimental.
      </p>
    </div>
  );
};

export default AboutCompanyPage;
