"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Globe2,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { ROLE_LABEL } from "@/lib/format";
import { Spinner, cx } from "@/components/ui";

function navFor(role) {
  if (role === "planner") {
    return [
      { href: "/planner", label: "Block planning", icon: LayoutDashboard },
      { href: "/plans", label: "Plan calendar", icon: CalendarDays },
      { href: "/live-map", label: "Live map", icon: Globe2 },
      { href: "/map", label: "SUMO Simulation", icon: MapIcon },
      { section: "Department inputs" },
      { href: "/requests/tms", label: "Engineering", sub: "TMS", icon: ClipboardList },
      { href: "/requests/smms", label: "Signal & Telecom", sub: "SMMS", icon: ClipboardList },
      { href: "/requests/tdms", label: "Traction", sub: "TDMS", icon: ClipboardList },
      { href: "/control-office", label: "Control Office", sub: "COA", icon: FileSpreadsheet },
    ];
  }
  if (role === "coa") {
    return [
      { href: "/control-office", label: "Timetable & delays", icon: FileSpreadsheet },
      { href: "/plans", label: "Approved plans", icon: CalendarDays },
      { href: "/live-map", label: "Live map", icon: Globe2 },
      { href: "/map", label: "SUMO Simulation", icon: MapIcon },
    ];
  }
  return [
    { href: `/requests/${role}`, label: "Block requests", icon: ClipboardList },
    { href: "/plans", label: "Approved plans", icon: CalendarDays },
    { href: "/live-map", label: "Live map", icon: Globe2 },
    { href: "/map", label: "SUMO Simulation", icon: MapIcon },
  ];
}

export default function Shell({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Spinner />
      </div>
    );
  }

  const items = navFor(user.role);
  const isActive = (href) =>
    href === "/plans" ? pathname === "/plans" || pathname.startsWith("/plans/") : pathname === href;

  const sidebar = (
    <div className="flex h-full flex-col bg-surface">
      {/* Brand */}
      <div className="px-5 h-[68px] flex items-center gap-3 border-b border-line">
        <div className="size-9 rounded-lg bg-accent grid place-items-center shadow-sm overflow-hidden">
          <img src="/railopt.png" alt="RailOpt" className="size-7 object-contain" />
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-[15px] tracking-[-0.01em]">RailOpt</div>
          <div className="text-[11px] text-ink-3 uppercase tracking-widest font-medium">Block planning</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" aria-label="Main">
        {items.map((it, i) =>
          it.section ? (
            <div key={i} className="px-3 pt-6 pb-2 text-[10px] text-ink-3 uppercase tracking-[0.08em] font-semibold">
              {it.section}
            </div>
          ) : (
            <Link
              key={it.href}
              href={it.href}
              aria-current={isActive(it.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cx(
                "flex items-center gap-2.5 rounded-md px-3 h-9 text-[13px] transition-all",
                isActive(it.href)
                  ? "bg-accent-soft text-accent font-semibold border border-accent/10"
                  : "text-ink-2 hover:bg-sunken hover:text-ink"
              )}
            >
              <it.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="truncate">{it.label}</span>
              {it.sub && (
                <span className="ml-auto text-[10px] font-mono text-ink-3 bg-sunken rounded px-1.5 py-0.5 font-semibold tracking-wide">
                  {it.sub}
                </span>
              )}
            </Link>
          )
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-line p-3">
        <div className="px-3 py-2">
          <div className="text-[13px] font-semibold truncate">{user.designation || user.full_name}</div>
          <div className="text-[11px] text-ink-3 truncate uppercase tracking-wider font-medium mt-0.5">{ROLE_LABEL[user.role]}</div>
        </div>
        <button
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
          className="mt-1 w-full flex items-center gap-2.5 rounded-md px-3 h-9 text-[13px] text-ink-3 hover:bg-sunken hover:text-ink cursor-pointer transition-colors"
        >
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-[260px]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[260px] bg-surface border-r border-line z-30">
        {sidebar}
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 h-14 bg-surface/95 backdrop-blur-sm border-b border-line flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5 font-semibold">
          <div className="size-8 rounded-lg bg-accent grid place-items-center shadow-sm overflow-hidden">
            <img src="/railopt.png" alt="RailOpt" className="size-6 object-contain" />
          </div>
          <span className="text-[15px]">RailOpt</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="size-9 grid place-items-center rounded-md hover:bg-sunken cursor-pointer"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-surface elevation-3">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-2 top-4 size-9 grid place-items-center rounded-md hover:bg-sunken cursor-pointer"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-[1180px] px-4 sm:px-8 py-8">{children}</main>
    </div>
  );
}
