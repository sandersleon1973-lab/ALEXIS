import React from "react";
import { Button } from "@/components/ui/button";

const PaymentProfilePage = () => {
  return (
    <div
      className="flex flex-col h-full text-slate-100"
      data-testid="payment-profile-page"
    >
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-wide">Billing & Payment Profile</h1>
          <p className="mt-2 text-sm text-slate-300/90 max-w-2xl">
            Manage your subscription to the ALEXIS diagnostic portal. Update plan
            details and keep technician access in sync with your workshop needs.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Current Plan */}
        <section className="lg:col-span-1 rounded-2xl border border-slate-600/70 bg-slate-950/90 p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-[0.22em] uppercase text-slate-200 mb-2">
              Current Plan
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Active subscription for this workshop.
            </p>
            <div className="text-2xl font-semibold mb-1">Professional Technician</div>
            <p className="text-sm text-slate-300">R1,250 / month (per technician seat)</p>
            <ul className="mt-4 text-xs text-slate-300 space-y-1 list-disc list-inside">
              <li>ALEXIS voice & visual diagnostics access</li>
              <li>Unlimited DTC validation sessions</li>
              <li>Up to 5 concurrent vehicles</li>
            </ul>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-6 h-9 rounded-full border-slate-500 text-xs tracking-[0.2em] uppercase"
            data-testid="change-plan-button"
          >
            Change plan
          </Button>
        </section>

        {/* Payment method */}
        <section className="lg:col-span-1 rounded-2xl border border-slate-600/70 bg-slate-950/90 p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-[0.22em] uppercase text-slate-200 mb-2">
              Payment Method
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Card or account used to settle monthly ALEXIS access.
            </p>
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm">Visa ending •••• 4821</p>
                <p className="text-xs text-slate-400">Expires 08/27 • Leon Sanders</p>
              </div>
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                Active
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-6 h-9 rounded-full border-slate-500 text-xs tracking-[0.2em] uppercase"
            data-testid="update-payment-method-button"
          >
            Update payment method
          </Button>
        </section>

        {/* Billing overview */}
        <section className="lg:col-span-1 rounded-2xl border border-slate-600/70 bg-slate-950/90 p-6 flex flex-col">
          <h2 className="text-sm font-semibold tracking-[0.22em] uppercase text-slate-200 mb-2">
            Billing Overview
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            High-level view of upcoming billing and recent invoices.
          </p>
          <div className="space-y-3 text-sm text-slate-200">
            <div className="flex items-center justify-between">
              <span>Next billing date</span>
              <span className="text-sky-300" data-testid="next-billing-date">01 Feb 2026</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Seats billed</span>
              <span className="text-sky-300" data-testid="seats-billed">3 technicians</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Estimated charge</span>
              <span className="text-sky-300" data-testid="estimated-charge">R3,750</span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
            <span>Invoice history available on request.</span>
            <Button
              type="button"
              variant="outline"
              className="h-8 px-4 rounded-full border-slate-500 text-[11px] tracking-[0.18em] uppercase"
              data-testid="download-invoices-button"
            >
              Download invoices
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PaymentProfilePage;
