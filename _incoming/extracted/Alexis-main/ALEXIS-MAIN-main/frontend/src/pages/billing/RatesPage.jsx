import React from "react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    id: "starter",
    name: "Technician Starter",
    price: "R650 / month",
    description: "Single technician, light diagnostic usage.",
    features: [
      "1 technician seat",
      "Core ALEXIS voice diagnostics",
      "Basic DTC validation",
      "Business hours support",
    ],
  },
  {
    id: "pro",
    name: "Workshop Professional",
    price: "R1,250 / month",
    description: "Ideal for independent workshops.",
    features: [
      "Up to 3 technician seats",
      "Voice & visual diagnostics",
      "Wiring diagram assistance",
      "Priority support window",
    ],
  },
  {
    id: "fleet",
    name: "Fleet & Dealer",
    price: "Talk to us",
    description: "Custom deployments for high-volume operations.",
    features: [
      "10+ technician seats",
      "On-site onboarding",
      "Integration with OEM tooling",
      "Dedicated support channel",
    ],
  },
];

const RatesPage = () => {
  return (
    <div
      className="flex flex-col h-full text-slate-100"
      data-testid="rates-page"
    >
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-wide">Rates & Access Options</h1>
        <p className="mt-2 text-sm text-slate-300/90 max-w-2xl">
          Transparent tariffs for ALEXIS diagnostic access. Choose a plan that matches
          the number of technicians and the depth of diagnostics in your workshop.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <section
            key={plan.id}
            className="rounded-2xl border border-slate-600/70 bg-slate-950/90 p-6 flex flex-col"
            data-testid={`plan-card-${plan.id}`}
          >
            <h2 className="text-lg font-semibold mb-1">{plan.name}</h2>
            <p className="text-sky-300 text-sm mb-1" data-testid={`plan-price-${plan.id}`}>
              {plan.price}
            </p>
            <p className="text-xs text-slate-400 mb-4">{plan.description}</p>
            <ul className="text-xs text-slate-200 space-y-1 mb-4 list-disc list-inside">
              {plan.features.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-auto">
              <Button
                type="button"
                variant={plan.id === "pro" ? "default" : "outline"}
                className={`w-full h-9 rounded-full text-xs tracking-[0.2em] uppercase ${
                  plan.id === "pro"
                    ? "bg-sky-600 hover:bg-sky-500 shadow-[0_0_24px_rgba(56,189,248,0.85)]"
                    : "border-slate-500 hover:border-sky-400"
                }`}
                data-testid={`select-plan-button-${plan.id}`}
              >
                {plan.id === "fleet" ? "Contact SA Diagnostic Solutions" : "Select plan"}
              </Button>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-500 max-w-3xl">
        All rates are indicative and exclude VAT. Final pricing and contract terms
        will be confirmed in writing with SA Diagnostic Solutions before activation
        of ALEXIS access for your technicians.
      </p>
    </div>
  );
};

export default RatesPage;
