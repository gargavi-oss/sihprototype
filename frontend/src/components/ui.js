"use client";

import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { DEPTS } from "@/lib/format";

const cx = (...c) => c.filter(Boolean).join(" ");

/* ---------- Buttons ---------- */
const BTN = {
  primary:
    "bg-accent text-white hover:bg-accent-strong border border-accent hover:border-accent-strong shadow-sm",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken hover:border-line-strong shadow-sm",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-bad border border-line-strong hover:bg-bad-soft hover:border-bad/40 shadow-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon: Icon,
  className,
  children,
  href,
  ...props
}) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all cursor-pointer select-none",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-[13px]",
    BTN[variant],
    className
  );
  const content = (
    <>
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="size-4" aria-hidden strokeWidth={1.75} />
      )}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} {...props}>
        {content}
      </Link>
    );
  }
  return (
    <button className={cls} disabled={loading || props.disabled} {...props}>
      {content}
    </button>
  );
}

/* ---------- Layout ---------- */
export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="text-[12px] text-ink-3 uppercase tracking-widest font-medium mb-2">{eyebrow}</div>}
        <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="text-ink-2 mt-2 max-w-2xl text-[14px] leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className, bodyClass, flush }) {
  return (
    <section className={cx("bg-surface border border-line rounded-lg min-w-0 elevation-1", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            {title && <h2 className="font-semibold text-[15px] tracking-[-0.01em]">{title}</h2>}
            {description && <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(flush ? "" : "px-5 pb-5", !title && !actions && !flush && "pt-5", bodyClass)}>
        {children}
      </div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }) {
  const toneCls = tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="bg-surface border border-line rounded-lg px-5 py-4 min-w-0 elevation-1">
      <div className="text-[12px] text-ink-3 uppercase tracking-wider font-medium">{label}</div>
      <div className={cx("text-[28px] font-semibold mt-1.5 tnum tracking-[-0.02em]", toneCls)}>{value}</div>
      {hint && <div className="text-[12px] text-ink-3 mt-1">{hint}</div>}
    </div>
  );
}

/* ---------- Tags & badges ---------- */
export function DeptTag({ dept, withName = false, className }) {
  const d = DEPTS[dept];
  if (!d) return <span className="text-ink-3">—</span>;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap tracking-wide uppercase",
        d.tag,
        className
      )}
    >
      {d.system}
      {withName && <span className="font-normal opacity-80 normal-case tracking-normal">· {d.name}</span>}
    </span>
  );
}

export function StatusPill({ status }) {
  const map = {
    approved: "badge-ok",
    draft: "badge-neutral",
    received: "badge-ok",
    waiting: "badge-warn",
  };
  const label = { approved: "Approved", draft: "Draft", received: "Received", waiting: "Waiting" }[status] || status;
  return (
    <span className={cx("inline-flex items-center", map[status])}>
      {label}
    </span>
  );
}

export function Loc({ track, section }) {
  return (
    <span className="font-mono text-[13px] whitespace-nowrap tracking-wide">
      {track}
      <span className="text-ink-3 mx-0.5">·</span>
      {section}
    </span>
  );
}

/* ---------- Feedback ---------- */
export function Notice({ tone = "info", children, className }) {
  const map = {
    info: "bg-sunken text-ink-2 border-line",
    ok: "bg-ok-soft text-ok border-ok/20",
    bad: "bg-bad-soft text-bad border-bad/20",
    warn: "bg-warn-soft text-warn border-warn/20",
  };
  return (
    <div className={cx("rounded-md border px-4 py-3 text-[13px] leading-relaxed", map[tone], className)} role={tone === "bad" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="font-semibold text-ink-2">{title}</div>
      {children && <p className="text-[13px] text-ink-3 mt-1.5 max-w-md mx-auto leading-relaxed">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-2.5 text-ink-3 py-12 justify-center">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span className="text-[13px]">{label}</span>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold mb-2 tracking-[-0.005em]">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-ink-3 mt-1.5 leading-relaxed">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full h-9 rounded-md border border-line-strong bg-surface px-3 text-sm placeholder:text-ink-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/12 transition-colors";

export { cx };
