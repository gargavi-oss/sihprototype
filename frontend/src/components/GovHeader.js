"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function GovHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50">
      {/* Tricolor stripe */}
      <div className="tricolor-stripe" />

      {/* Main header bar */}
      <div className="bg-gov-navy text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Emblem / Logo area */}
            <div className="w-10 h-10 bg-white/15 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-2xl">
                directions_railway
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-tight">
                RailOpt
              </h1>
              <p className="text-[11px] text-white/70 tracking-wide uppercase">
                Ministry of Railways · Maintenance Scheduler
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/alternate"
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                pathname === "/alternate"
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              Alternate Schedule
            </Link>
          </nav>
        </div>
      </div>

      {/* Sub-header breadcrumb bar */}
      <div className="bg-white border-b border-gov-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gov-text-muted">
            <span className="material-symbols-outlined text-sm">home</span>
            <span>/</span>
            <span className="text-gov-text-secondary font-medium">
              {pathname === "/" ? "Dashboard" : "Alternate Schedule"}
            </span>
          </div>
          <div className="text-[11px] text-gov-text-muted">
            Intelligent Track Maintenance Optimization System
          </div>
        </div>
      </div>
    </header>
  );
}
