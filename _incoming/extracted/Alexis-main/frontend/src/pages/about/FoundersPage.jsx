import React from "react";

const founders = [
  {
    name: "Leon Sanders",
    role: "Founder & Master Diagnostic Technician",
    bio:
      "Leon has spent decades inside real workshops, building procedures that work under pressure. " +
      "ALEXIS captures that discipline so technicians can follow the same standard under any fault condition.",
  },
  {
    name: "Technical Advisory Panel",
    role: "OEM & Independent Specialists",
    bio:
      "A rotating group of OEM, aftermarket and fleet diagnostic experts who review ALEXIS rule sets, " +
      "DTC applicability logic and safety constraints before they reach the workshop floor.",
  },
];

const FoundersPage = () => {
  return (
    <div
      className="flex flex-col h-full text-slate-100"
      data-testid="founders-page"
    >
      <h1 className="text-3xl font-semibold tracking-wide mb-4">Founders & Vision</h1>
      <p className="text-sm text-slate-300/90 max-w-3xl mb-6">
        The ALEXIS diagnostic rules are not an academic exercise. They are built
        from real-world test sequences that prevent wasted time, unnecessary
        parts, and unsafe guesses in front of a customer vehicle.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {founders.map((f) => (
          <section
            key={f.name}
            className="rounded-2xl border border-slate-600/70 bg-slate-950/90 p-6"
            data-testid={`founder-card-${f.name.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <h2 className="text-lg font-semibold mb-1">{f.name}</h2>
            <p className="text-xs text-sky-300 mb-3">{f.role}</p>
            <p className="text-sm text-slate-300/90 whitespace-pre-line">{f.bio}</p>
          </section>
        ))}
      </div>
    </div>
  );
};

export default FoundersPage;
