"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, DeptTag, Empty, Notice, PageHeader, Spinner, StatusPill, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { DEPTS, addDays, fmtDate, isoDate, startOfWeek } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function PlanCalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);

  const range = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(anchor);
      return { start: s, end: addDays(s, 6), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const gridStart = startOfWeek(first);
    const weeks = Math.ceil(((last - gridStart) / 86400000 + 1) / 7);
    return {
      start: first,
      end: last,
      gridStart,
      days: Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i)),
    };
  }, [view, anchor]);

  useEffect(() => {
    let alive = true;
    const from = isoDate(range.days[0]);
    const to = isoDate(range.days[range.days.length - 1]);
    api
      .get(`/plans?from=${from}&to=${to}`)
      .then((r) => alive && (setPlans(r.plans), setError(null)))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [range]);

  const byDay = useMemo(() => {
    const m = {};
    (plans || []).forEach((p) => (m[p.plan_date] ||= []).push(p));
    return m;
  }, [plans]);

  const inRange = (plans || []).filter((p) => p.plan_date >= isoDate(range.start) && p.plan_date <= isoDate(range.end));
  const deptTotals = {};
  let slotTotal = 0;
  inRange.forEach((p) =>
    p.blocks.forEach((b) => {
      deptTotals[b.dept_key] = (deptTotals[b.dept_key] || 0) + 1;
      slotTotal += b.duration;
    })
  );

  const shift = (dir) =>
    setAnchor((a) => (view === "week" ? addDays(a, dir * 7) : new Date(a.getFullYear(), a.getMonth() + dir, 1)));

  const label =
    view === "week"
      ? `${fmtDate(isoDate(range.start), { day: "numeric", month: "short" })} – ${fmtDate(isoDate(range.end), { day: "numeric", month: "short", year: "numeric" })}`
      : anchor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const today = isoDate(new Date());
  const isPlanner = user?.role === "planner";

  return (
    <>
      <PageHeader
        title={isPlanner ? "Plan calendar" : "Approved block plans"}
        description={
          isPlanner
            ? "Weekly and monthly view of all block plans. Drafts are only visible to the planning cell."
            : "Block plans approved by the planning cell for all departments."
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="tablist">
            {["week", "month"].map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cx(
                  "h-8 px-3 rounded text-[13px] capitalize cursor-pointer",
                  view === v ? "bg-sunken font-medium" : "text-ink-2 hover:text-ink"
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} aria-label="Previous" className="size-8 grid place-items-center rounded-md hover:bg-sunken cursor-pointer">
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-[190px] text-center font-medium tnum">{label}</div>
          <button onClick={() => shift(1)} aria-label="Next" className="size-8 grid place-items-center rounded-md hover:bg-sunken cursor-pointer">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {error && <Notice tone="bad" className="mb-4">{error}</Notice>}

      {/* Summary for the visible horizon */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-2 mb-4">
        <span>
          <span className="text-ink font-medium tnum">{inRange.length}</span> {inRange.length === 1 ? "plan" : "plans"}
        </span>
        <span>
          <span className="text-ink font-medium tnum">{inRange.filter((p) => p.status === "approved").length}</span> approved
        </span>
        <span>
          <span className="text-ink font-medium tnum">{slotTotal}</span> block slots
        </span>
        {["tms", "smms", "tdms"].map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5">
            <DeptTag dept={d} /> <span className="tnum">{deptTotals[d] || 0}</span>
          </span>
        ))}
      </div>

      {!plans ? (
        <Spinner />
      ) : view === "week" ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-line border border-line rounded-lg overflow-hidden">
          {range.days.map((d, i) => {
            const key = isoDate(d);
            const list = byDay[key] || [];
            return (
              <div key={key} className="bg-surface min-h-[220px] p-2.5">
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <span className="text-[12px] text-ink-3">{WEEKDAYS[i]}</span>
                  <span
                    className={cx(
                      "tnum text-[13px]",
                      key === today ? "bg-accent text-white rounded px-1.5 font-medium" : "text-ink-2"
                    )}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="space-y-2">
                  {list.map((p) => (
                    <PlanCard key={p.id} plan={p} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-line rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-surface border-b border-line">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2.5 py-2 text-[12px] text-ink-3">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-line">
            {range.days.map((d) => {
              const key = isoDate(d);
              const list = byDay[key] || [];
              const out = d.getMonth() !== anchor.getMonth();
              return (
                <div key={key} className={cx("min-h-[104px] p-1.5", out ? "bg-sunken/60" : "bg-surface")}>
                  <div
                    className={cx(
                      "tnum text-[12px] px-1 mb-1 inline-block",
                      key === today ? "bg-accent text-white rounded font-medium" : out ? "text-ink-3" : "text-ink-2"
                    )}
                  >
                    {d.getDate()}
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((p) => (
                      <Link
                        key={p.id}
                        href={`/plans/${p.id}`}
                        className={cx(
                          "block rounded px-1.5 py-1 text-[12px] leading-tight hover:ring-1 hover:ring-line-strong",
                          p.status === "approved" ? "bg-ok-soft" : "bg-sunken"
                        )}
                      >
                        <div className="truncate font-medium">{p.title || "Block plan"}</div>
                        <div className="flex gap-1 mt-0.5">
                          {Object.entries(p.dept_counts).map(([dk, n]) => (
                            <span key={dk} className="inline-flex items-center gap-0.5 text-[11px] text-ink-2">
                              <span className="size-1.5 rounded-full" style={{ background: DEPTS[dk]?.color }} />
                              {n}
                            </span>
                          ))}
                        </div>
                      </Link>
                    ))}
                    {list.length > 3 && <div className="text-[11px] text-ink-3 px-1">+{list.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plans && inRange.length === 0 && (
        <Card className="mt-4">
          <Empty title={`No plans this ${view}`}>
            {isPlanner
              ? "Run the optimiser from Block planning and pick a date in this range."
              : "Approved plans will appear here once the planning cell publishes them."}
          </Empty>
        </Card>
      )}
    </>
  );
}

function PlanCard({ plan }) {
  return (
    <Link
      href={`/plans/${plan.id}`}
      className="block rounded-md border border-line hover:border-line-strong bg-surface p-2 text-[12px]"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-[13px] truncate">{plan.title || "Block plan"}</span>
      </div>
      <div className="mt-1">
        <StatusPill status={plan.status} />
      </div>
      <ul className="mt-2 space-y-1">
        {plan.blocks.map((b, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-1 self-stretch rounded-full" style={{ background: DEPTS[b.dept_key]?.color }} />
            <span className="font-mono">
              {b.track}·{b.section}
            </span>
            <span className="ml-auto text-ink-3 tnum">
              {b.start_time}–{b.end_time}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  );
}
