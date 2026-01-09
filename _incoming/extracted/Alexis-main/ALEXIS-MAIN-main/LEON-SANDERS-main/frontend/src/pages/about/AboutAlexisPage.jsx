import React from "react";

const AboutAlexisPage = () => {
  return (
    <div className="flex flex-col h-full text-slate-100">
      <h1 className="text-3xl font-semibold tracking-wide text-slate-100 mb-4">
        About ALEXIS
      </h1>
      <p className="text-sm text-slate-300/90 max-w-2xl">
        ALEXIS is the intelligent diagnostics assistant for this portal. It combines
        structured vehicle data, OEM-level diagnostic workflows, and AI guidance to
        help technicians localize faults faster and with more confidence. This page
        will later include system capabilities, safety notes, and integration
        details for your workshop.
      </p>
    </div>
  );
};

export default AboutAlexisPage;
