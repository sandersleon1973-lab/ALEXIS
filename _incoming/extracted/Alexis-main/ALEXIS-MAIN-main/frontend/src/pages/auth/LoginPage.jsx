import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LoginPage = () => {
  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_bottom,_#0b101e,_#02040a_60%,_#000000)] flex items-center justify-center px-4"
      data-testid="login-page-root"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-600/60 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-black/95 shadow-[0_0_40px_rgba(15,23,42,0.9)] px-8 py-10">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="https://customer-assets.emergentagent.com/job_diag-platform-1/artifacts/o9ft2qn0_ChatGPT%20Image%20Jan%202%2C%202026%2C%2003_53_58%20PM%20%281%29.png"
            alt="SA Diagnostic Solutions logo"
            className="h-[96px] w-auto object-contain mb-4"
          />
          <h1 className="text-xl font-semibold tracking-[0.28em] uppercase text-slate-100 text-center">
            Technician Portal Login
          </h1>
          <p className="mt-3 text-xs text-slate-400 text-center max-w-sm">
            Secure access to the ALEXIS diagnostics console for verified technicians.
          </p>
        </div>

        {/* Form */}
        <form className="space-y-5" data-testid="login-form">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs tracking-[0.18em] uppercase text-slate-300">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="bg-slate-950/80 border-slate-700 text-slate-100 text-sm"
              placeholder="technician@example.com"
              data-testid="login-email-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs tracking-[0.18em] uppercase text-slate-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="bg-slate-950/80 border-slate-700 text-slate-100 text-sm"
              placeholder="Enter your password"
              data-testid="login-password-input"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Forgot password?</span>
            <span>Need access? Contact SA Diagnostic Solutions.</span>
          </div>

          <Button
            type="button"
            className="w-full h-11 rounded-full mt-2 bg-sky-600 hover:bg-sky-500 text-xs tracking-[0.24em] uppercase shadow-[0_0_24px_rgba(56,189,248,0.85)]"
            data-testid="login-submit-button"
          >
            Log In
          </Button>

          <div className="mt-4 text-[11px] text-slate-500 text-center">
            This login screen is a visual prototype. Authentication and user accounts
            will be wired in a later phase.
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
