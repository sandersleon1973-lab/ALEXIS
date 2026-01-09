import React from "react";

const PlaceholderPage = ({ title, description }) => {
  return (
    <div className="flex flex-col h-full items-start justify-start text-slate-100">
      <h1 className="text-2xl font-semibold tracking-wide mb-3 drop-shadow-[0_0_16px_rgba(148,163,253,0.8)]">
        {title}
      </h1>
      <p className="text-sm text-slate-300/80 max-w-xl">
        {description || "This section of the diagnostics platform will be implemented in a later phase."}
      </p>
    </div>
  );
};

export default PlaceholderPage;
