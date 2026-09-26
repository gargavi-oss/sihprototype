"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Database } from "lucide-react";
import {
  Button, Card, DeptTag, Empty, Field, Loc, Notice, PageHeader, Spinner, StatusPill, cx, inputCls,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { addDays, fmtDate, fmtDateTime, isoDate } from "@/lib/format";

export default function PlannerPage() {
  const router = useRouter();
  const { data, error, reload: load } = useApi("/planner/overview");
  const [planDate, setPlanDate] = useState(isoDate(addDays(new Date(), 1)));
  const [title, setTitle] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const { plan } = await api.post("/planner/solve", { plan_date: planDate, title: title || null });
      router.push(`/plans/${plan.id}`);
    } catch (e) {
      setRunError(e.message);
      setRunning(false);
    }
  };

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <Spinner />;

  const deptSources = data.sources.filter((s) => !s.key.startsWith("coa_"));
  const coaSources = data.sources.filter((s) => s.key.startsWith("coa_"));
  const received = data.sources.filter((s) => s.upload).length;
  const pct = Math.min(100, Math.round((data.model_size / data.model_limit) * 100));
  const overLimit = data.model_size > data.model_limit;

  return (
    <>
      <PageHeader
        title="Block planning"
        description="Combine department requests with the Control Office timetable and run the optimiser to produce a coordinated block plan."
        actions={
          <Button
            icon={Database}
            loading={loadingDemo}
            onClick={async () => {
              setLoadingDemo(true);
              try {
                await api.post("/planner/load_demo");
                await load();
              } finally {
                setLoadingDemo(false);
              }
            }}
          >
            Load demo data
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
        {/* Inputs */}
        <Card
          title="Inputs for this run"
          description={`${received} of ${data.sources.length} sources received`}
          flush
        >
          <ul className="divide-y divide-line border-t border-line">
            {[...deptSources, ...coaSources].map((s) => {
              const dept = s.key.startsWith("coa_") ? "coa" : s.key;
              const href = dept === "coa" ? "/control-office" : `/requests/${dept}`;
              return (
                <li key={s.key}>
                  <Link href={href} className="flex items-center gap-4 px-5 py-3 hover:bg-sunken/60">
                    <div className="w-16 shrink-0">
                      <DeptTag dept={dept} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-[12px] text-ink-3 truncate">
                        {s.upload
                          ? `${s.upload.filename} · ${fmtDateTime(s.upload.uploaded_at)} by ${s.upload.uploaded_by}`
                          : "Waiting for upload"}
                      </div>
                    </div>
                    <div className="hidden sm:block text-right tnum text-[13px] text-ink-2 w-28">
                      {s.upload ? (
                        <>
                          {s.rows} {s.key === "coa_timetable" ? "trains" : s.key === "coa_delay" ? "entries" : s.rows === 1 ? "request" : "requests"}
                          {s.block_slots ? <span className="block text-[12px] text-ink-3">{s.block_slots} slots</span> : null}
                        </>
                      ) : null}
                    </div>
                    <StatusPill status={s.upload ? "received" : "waiting"} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Run */}
        <Card title="Run optimiser" description="Creates a draft plan for the chosen date.">
          <div className="space-y-4">
            <Field label="Plan date">
              <input type="date" className={inputCls} value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
            </Field>
            <Field label="Title" hint="Optional, e.g. “Sunday corridor block”.">
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Block plan" />
            </Field>

            <div>
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-2">Model size</span>
                <span className={cx("tnum", overLimit ? "text-bad" : "text-ink-2")}>
                  {data.model_size} / {data.model_limit} variables
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-sunken overflow-hidden">
                <div
                  className={cx("h-full rounded-full", overLimit ? "bg-bad" : pct > 85 ? "bg-warn" : "bg-ink-2")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[12px] text-ink-3 mt-1.5">
                CPLEX Community Edition limit. Grows with the number of tracks requested.
              </p>
            </div>

            {!data.ready && (
              <Notice tone="warn">
                Needs the Control Office timetable and delay forecast, plus at least one department&apos;s requests.
              </Notice>
            )}
            {runError && <Notice tone="bad">{runError}</Notice>}

            <Button
              variant="primary"
              className="w-full"
              loading={running}
              disabled={!data.ready || overLimit}
              onClick={run}
            >
              {running ? "Solving…" : "Run optimiser"}
            </Button>
          </div>
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Requests in priority order"
        description="All departments combined, most urgent start-by slot first. The optimiser must start every block by its slot."
        flush
      >
        {data.requests.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="pl-5 w-10">#</th>
                  <th>Department</th>
                  <th>Section</th>
                  <th>Work type</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right pr-5">Start by</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((r, i) => (
                  <tr key={`${r.dept}-${r.id}`}>
                    <td className="pl-5 text-ink-3 tnum">{i + 1}</td>
                    <td>
                      <DeptTag dept={r.dept} withName />
                    </td>
                    <td>
                      <Loc track={`R${r.track_id}`} section={`S${r.section_id}`} />
                    </td>
                    <td className="capitalize">{r.maintenance_type}</td>
                    <td className="text-right">{r.block_duration} slots</td>
                    <td className="text-right pr-5">slot {r.deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No requests yet">
            Departments haven&apos;t submitted anything. Use &ldquo;Load demo data&rdquo; to try the flow.
          </Empty>
        )}
      </Card>

      <Card
        className="mt-5"
        title="Recent plans"
        actions={
          <Button href="/plans" variant="ghost" size="sm">
            Calendar <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        }
        flush
      >
        {data.recent_plans.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {data.recent_plans.map((p) => (
              <li key={p.id}>
                <Link href={`/plans/${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-sunken/60">
                  <div className="w-28 shrink-0 tnum">
                    {fmtDate(p.plan_date, { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                  <div className="flex-1 min-w-0 truncate">{p.title || "Block plan"}</div>
                  <div className="hidden sm:flex gap-1.5">
                    {Object.entries(p.dept_counts).map(([d, n]) => (
                      <span key={d} className="inline-flex items-center gap-1">
                        <DeptTag dept={d} />
                        <span className="text-[12px] text-ink-3 tnum">{n}</span>
                      </span>
                    ))}
                  </div>
                  <StatusPill status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No plans yet" />
        )}
      </Card>
    </>
  );
}
