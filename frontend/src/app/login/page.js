"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ShieldCheck,
  Activity,
  Sparkles,
  CheckCircle2,
  Eye,
  EyeOff,
  Train,
  Check,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { Button, Field, Notice, inputCls } from "@/components/ui";
import { homeFor } from "@/lib/format";

const DEMO = [
  {
    u: "tms",
    p: "tms123",
    role: "Engineering",
    sys: "TMS",
    subtitle: "Track Management & Machine Tamping",
    color: "bg-eng/10 text-eng border-eng/20",
  },
  {
    u: "smms",
    p: "smms123",
    role: "Signal & Telecom",
    sys: "SMMS",
    subtitle: "Interlocking & Point Machines",
    color: "bg-snt/10 text-snt border-snt/20",
  },
  {
    u: "tdms",
    p: "tdms123",
    role: "Traction Distribution",
    sys: "TDMS",
    subtitle: "25kV AC OHE Power Blocks",
    color: "bg-trd/10 text-trd border-trd/20",
  },
  {
    u: "coa",
    p: "coa123",
    role: "Control Office",
    sys: "COA",
    subtitle: "Section Train Regulation & Paths",
    color: "bg-coa/10 text-coa border-coa/20",
  },
  {
    u: "planner",
    p: "planner123",
    role: "Block Planning Cell",
    sys: "Planner",
    subtitle: "Corridor Bundling & Conflict Arbitrator",
    color: "bg-accent-soft text-accent border-accent/20",
  },
];

const WORKFLOW = [
  { step: "01", title: "Submit", desc: "Dept requisitions" },
  { step: "02", title: "Combine", desc: "Shadow corridors" },
  { step: "03", title: "Optimise", desc: "Conflict resolution" },
  { step: "04", title: "Publish", desc: "Operating circular" },
];

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(homeFor(user.role));
    }
  }, [user, loading, router]);

  const selectDemoAccount = (item) => {
    setUsername(item.u);
    setPassword(item.p);
    setSelectedRole(item.u);
    setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();

    setError(null);
    setBusy(true);

    try {
      const u = await login(username.trim(), password);
      router.replace(homeFor(u.role));
    } catch (err) {
      setError(err?.message || "Unable to sign in. Please verify credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-surface text-ink">

      {/* =====================================================
          BACKGROUND AMBIENCE & SUBTLE RAILWAY GRID
      ===================================================== */}

      <div className="absolute -top-64 -left-64 w-[850px] h-[850px] rounded-full bg-accent/[0.045] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-72 -right-72 w-[800px] h-[800px] rounded-full bg-eng/[0.035] blur-3xl pointer-events-none" />

      {/* Railway Grid Background */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(27,27,25,1) 1px, transparent 1px), linear-gradient(90deg, rgba(27,27,25,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* =====================================================
          MAIN CONTAINER
      ===================================================== */}

      <div className="relative z-10 min-h-screen max-w-[1500px] mx-auto px-6 sm:px-10 lg:px-14 xl:px-20 flex flex-col justify-between">

        {/* ===================================================
            HEADER
        =================================================== */}

        <header className="pt-7 lg:pt-10 flex items-center justify-between border-b border-line/60 pb-6">

          {/* Logo with original /railopt.png icon */}
          <div className="flex items-center gap-3.5">
            <div className="relative size-11 rounded-xl bg-accent grid place-items-center shadow-lg shadow-accent/20 overflow-hidden shrink-0">
              <img src="/railopt.png" alt="RailOpt" className="size-8 object-contain" />
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-emerald-500 border-2 border-surface" />
            </div>

            <div>
              <div className="font-bold text-[20px] tracking-[-0.02em] leading-none flex items-center gap-2">
                <span>RailOpt</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-accent-soft text-accent border border-accent/20">
                  National Portal
                </span>
              </div>
              <div className="text-[9px] text-ink-3 uppercase tracking-[0.18em] font-bold mt-1.5">
                Ministry of Railways · Government of India
              </div>
            </div>
          </div>

          {/* System status */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-[11px] text-ink-3 font-mono">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>CRIS Secure Network Connected</span>
            </div>
            <div className="hidden sm:inline-block h-3.5 w-px bg-line" />
            <div className="flex items-center gap-1.5 text-[11px] text-ink-3 font-semibold">
              <ShieldCheck className="size-3.5 text-accent" />
              <span>SSL 256-Bit</span>
            </div>
          </div>

        </header>


        {/* ===================================================
            MAIN CONTENT
        =================================================== */}

        <main className="py-12 lg:py-16 grid lg:grid-cols-[1fr_450px] gap-12 xl:gap-20 items-center">

          {/* =================================================
              LEFT SIDE
          ================================================= */}

          <section className="relative">

            {/* Decorative railway geometric circles */}
            <div className="absolute -left-20 top-0 w-[500px] h-[500px] opacity-[0.045] pointer-events-none">
              <div className="absolute inset-0 rounded-full border-2 border-accent" />
              <div className="absolute inset-[55px] rounded-full border border-accent" />
              <div className="absolute inset-[110px] rounded-full border border-accent" />
              <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-accent" />
              <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-accent" />
            </div>

            <div className="relative max-w-[720px]">

              {/* Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent-soft px-3.5 py-1.5 shadow-sm">
                <Activity className="size-3.5 text-accent" />
                <span className="text-[10px] font-bold text-accent uppercase tracking-[0.14em]">
                  Intelligent Block Corridor Planning
                </span>
                <span className="size-1.5 rounded-full bg-accent animate-pulse" />
              </div>

              {/* Main heading */}
              <h1 className="mt-6 text-[42px] sm:text-[48px] xl:text-[56px] leading-[1.05] font-bold tracking-[-0.04em]">
                Coordinate every block.
                <span className="block text-accent mt-1">
                  Keep trains moving.
                </span>
              </h1>

              {/* Description */}
              <p className="mt-6 max-w-[620px] text-[15px] xl:text-[16px] leading-relaxed text-ink-2">
                RailOpt connects Engineering (TMS), Signal &amp; Telecom (SMMS),
                Traction Distribution (TDMS) and the Control Office (COA) into one
                unified, conflict-aware maintenance corridor planning system.
              </p>

              {/* =================================================
                  MODULE CARDS
              ================================================= */}

              <div className="grid sm:grid-cols-3 gap-3.5 mt-9 max-w-[660px]">

                {/* Maintenance (with original /railopt.png icon) */}
                <div className="group rounded-xl border border-line bg-white/70 backdrop-blur-sm p-4 transition-all duration-200 hover:-translate-y-1 hover:border-eng/30 hover:shadow-sm">
                  <div className="size-9 rounded-lg bg-eng/10 grid place-items-center mb-3 overflow-hidden">
                    <img src="/railopt.png" alt="Maintenance" className="size-6 object-contain" />
                  </div>
                  <div className="text-[13px] font-bold">
                    Maintenance
                  </div>
                  <div className="text-[11px] text-ink-3 mt-1 leading-snug">
                    Engineering, tamping &amp; civil infrastructure blocks
                  </div>
                </div>

                {/* Operations */}
                <div className="group rounded-xl border border-line bg-white/70 backdrop-blur-sm p-4 transition-all duration-200 hover:-translate-y-1 hover:border-snt/30 hover:shadow-sm">
                  <div className="size-9 rounded-lg bg-snt/10 text-snt grid place-items-center mb-3">
                    <Activity className="size-4" />
                  </div>
                  <div className="text-[13px] font-bold">
                    Operations
                  </div>
                  <div className="text-[11px] text-ink-3 mt-1 leading-snug">
                    Signals, 25kV traction &amp; train movement
                  </div>
                </div>

                {/* Optimisation */}
                <div className="group rounded-xl border border-line bg-white/70 backdrop-blur-sm p-4 transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-sm">
                  <div className="size-9 rounded-lg bg-accent-soft text-accent grid place-items-center mb-3">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="text-[13px] font-bold">
                    Optimisation
                  </div>
                  <div className="text-[11px] text-ink-3 mt-1 leading-snug">
                    Conflict-aware shadow block scheduling
                  </div>
                </div>

              </div>

              {/* =================================================
                  WORKFLOW
              ================================================= */}

              <div className="mt-11">
                <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-ink-3 mb-4">
                  Planning workflow
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-[660px]">
                  {WORKFLOW.map((item) => (
                    <div
                      key={item.step}
                      className="p-3 rounded-xl border border-line bg-white/50 backdrop-blur-xs transition-colors hover:bg-white/80"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="size-6 rounded-full bg-accent-soft border border-accent/15 text-accent grid place-items-center text-[10px] font-bold font-mono">
                          {item.step}
                        </span>
                        <div className="text-[12px] font-bold">
                          {item.title}
                        </div>
                      </div>
                      <div className="text-[10px] text-ink-3 mt-0.5 leading-tight">
                        {item.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Access note */}
              <div className="mt-10 flex items-center gap-2 text-[11px] text-ink-3 font-semibold">
                <ShieldCheck className="size-4 text-accent" />
                <span>Authorised Railway Department Access · Baroda House HQ</span>
              </div>

            </div>

          </section>


          {/* =================================================
              RIGHT SIDE LOGIN CARD
          ================================================= */}

          <section className="w-full">

            <div className="rounded-2xl border border-line bg-white/85 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.06)] p-7 sm:p-9 relative">

              {/* Login heading */}
              <div className="mb-7">
                <div className="size-11 rounded-xl bg-accent-soft text-accent grid place-items-center mb-4 border border-accent/15 shadow-sm">
                  <ShieldCheck className="size-5" />
                </div>

                <h2 className="text-[26px] font-bold tracking-[-0.03em] leading-tight">
                  Sign in
                </h2>

                <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">
                  Access your department&apos;s RailOpt planning workspace.
                </p>
              </div>

              {/* =================================================
                  LOGIN FORM
              ================================================= */}

              <form onSubmit={submit} className="space-y-4">

                <Field label="Username">
                  <input
                    className={`${inputCls} h-11 rounded-lg text-[13px] font-medium transition-all`}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setSelectedRole(e.target.value);
                    }}
                    autoComplete="username"
                    autoFocus
                    required
                    placeholder="Enter username (e.g. planner, tms)"
                  />
                </Field>

                <Field label="Password">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={`${inputCls} h-11 rounded-lg text-[13px] pr-10 transition-all`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      placeholder="Enter password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 p-0.5 text-ink-3 hover:text-ink transition-colors cursor-pointer"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </Field>

                {error && (
                  <Notice tone="bad">
                    {error}
                  </Notice>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  loading={busy}
                  className="w-full h-11 rounded-lg font-semibold text-[13px] shadow-md shadow-accent/20 cursor-pointer"
                >
                  {busy ? "Authenticating…" : "Sign in"}
                  {!busy && (
                    <ArrowRight
                      className="size-4 ml-1.5"
                      aria-hidden
                    />
                  )}
                </Button>

              </form>

              {/* =================================================
                  DEMO ACCOUNTS
              ================================================= */}

              <div className="mt-7 pt-6 border-t border-line">

                <div className="flex items-center justify-between mb-3.5">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em]">
                      Demo accounts
                    </div>
                    <div className="text-[10px] text-ink-3 mt-0.5">
                      Click any account to auto-populate credentials
                    </div>
                  </div>
                  <Sparkles className="size-4 text-accent" />
                </div>

                <div className="space-y-2">
                  {DEMO.map((d) => {
                    const isSelected = selectedRole === d.u || username.toLowerCase() === d.u.toLowerCase();

                    return (
                      <button
                        key={d.u}
                        type="button"
                        onClick={() => selectDemoAccount(d)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer group ${
                          isSelected
                            ? "bg-accent-soft/70 border-accent/40 ring-1 ring-accent/30 shadow-xs"
                            : "border-line bg-sunken/30 hover:bg-white hover:border-line hover:shadow-xs"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`size-7 rounded-lg border grid place-items-center shrink-0 transition-colors ${
                              isSelected
                                ? "bg-accent text-white border-accent"
                                : "bg-surface border-line text-ink-3 group-hover:text-accent group-hover:border-accent/30"
                            }`}
                          >
                            {isSelected ? (
                              <Check className="size-3.5 stroke-[2.5]" />
                            ) : (
                              <CheckCircle2 className="size-3.5" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold truncate group-hover:text-accent transition-colors">
                              {d.role}
                            </div>
                            <div className="text-[10px] text-ink-3 font-mono truncate">
                              {d.u} / {d.p}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-mono font-bold rounded-md px-2 py-0.5 border tracking-wider shrink-0 ${d.color}`}
                        >
                          {d.sys}
                        </span>
                      </button>
                    );
                  })}
                </div>

              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-center gap-2 mt-5 text-[10px] text-ink-3 font-mono">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                RailOpt Secure Authentication · CRIS Compliant
              </div>

            </div>

          </section>

        </main>

        {/* ===================================================
            FOOTER
        =================================================== */}

        <footer className="py-5 border-t border-line/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-ink-3 font-mono">
          <div>
            © 2026 Ministry of Railways, Government of India.
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>Operational · Delhi - Kanpur Main Line</span>
          </div>
        </footer>

      </div>

    </div>
  );
}