"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Map as MapIcon, Play, RotateCcw, Route, Trash2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import BlockTimeline from "@/components/BlockTimeline";
import {
  Button, Card, DeptTag, Loc, Notice, PageHeader, Spinner, Stat, StatusPill, inputCls,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate, fmtDateTime } from "@/lib/format";

export default function PlanDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isPlanner = user?.role === "planner";

  const { data, error, reload: load } = useApi(`/plans/${id}`);
  const plan = data?.plan;
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const act = async (key, fn, okText) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      await load();
      if (okText) setMsg({ tone: "ok", text: okText });
    } catch (e) {
      setMsg({ tone: "bad", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!plan) return <Spinner />;

  const { blocks, summary } = plan.analysis;
  const approved = plan.status === "approved";

  return (
    <>
      <Link href={isPlanner ? "/planner" : "/plans"} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink mb-4">
        <ArrowLeft className="size-3.5" aria-hidden /> {isPlanner ? "Block planning" : "Plan calendar"}
      </Link>

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Plan #{plan.id} <StatusPill status={plan.status} />
          </span>
        }
        title={`${plan.title || "Block plan"} · ${fmtDate(plan.plan_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
        description={
          approved
            ? `Approved by ${plan.approved_by} on ${fmtDateTime(plan.approved_at)}. Visible to all departments.`
            : "Draft — only the planning cell can see this plan until it is approved."
        }
        actions={
          isPlanner && (
            <>
              <Button
                icon={Play}
                loading={busy === "sim"}
                onClick={() =>
                  act("sim", () => api.post("/simulate", { plan_id: plan.id }), "SUMO run finished. Results saved to sumo/spiderweb_network/output/T_matrix.npy.")
                }
              >
                Run SUMO
              </Button>
              <Button icon={MapIcon} href={`/map?plan=${plan.id}`}>
                Live map
              </Button>
              <Button icon={Route} href={`/plans/${plan.id}/reroute`}>
                AI rerouting
              </Button>
              {approved ? (
                <Button icon={RotateCcw} loading={busy === "reopen"} onClick={() => act("reopen", () => api.post(`/plans/${plan.id}/reopen`))}>
                  Reopen
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={Check}
                  loading={busy === "approve"}
                  onClick={() => act("approve", () => api.post(`/plans/${plan.id}/approve`), "Plan approved and published to departments.")}
                >
                  Approve plan
                </Button>
              )}
            </>
          )
        }
      />

      {busy === "sim" && (
        <Notice className="mb-5">
          SUMO is running. If the GUI opens, press play; this page updates when the simulation window closes.
        </Notice>
      )}
      {msg && <Notice tone={msg.tone} className="mb-5">{msg.text}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat
          label="Blocks scheduled"
          value={summary.blocks_scheduled}
          hint={`${summary.departments.length} departments · ${summary.total_block_slots} slots`}
        />
        <Stat
          label="Started on time"
          value={`${summary.on_time}/${summary.blocks_scheduled}`}
          tone={summary.on_time === summary.blocks_scheduled ? "ok" : "bad"}
          hint="Blocks starting by their start-by slot"
        />
        <Stat
          label="Trains inside a block"
          value={`${summary.trains_affected}/${summary.trains_total}`}
          tone={summary.trains_affected ? "warn" : "ok"}
          hint={`${summary.conflict_slots} train-slots overlap a block`}
        />
        <Stat
          label="Optimiser"
          value={plan.solver.optimal || plan.solver.all_optimal ? "Optimal" : plan.solver.objective != null ? "Feasible" : "—"}
          hint={
            plan.solver.decomposed
              ? `${plan.solver.total_vars_before_split} vars → ${plan.solver.num_partitions} partitions · cost ${Number(plan.solver.objective ?? 0).toFixed(1)}`
              : plan.solver.variables
                ? `${plan.solver.variables} variables · cost ${Number(plan.solver.objective ?? 0).toFixed(1)}`
                : "CPLEX MIP"
          }
        />
      </div>

      <Card title="Block windows" description="Time in slots across the 120-slot planning window." flush>
        <BlockTimeline blocks={blocks} trains={plan.trains} delays={plan.delays} />
        <div className="h-4" />
      </Card>

      <Card className="mt-5" title="Block schedule" flush>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-5">Department</th>
                <th>Section</th>
                <th>Work type</th>
                <th className="text-right">Start</th>
                <th className="text-right">End</th>
                <th className="text-right">Duration</th>
                <th className="text-right">Start by</th>
                <th className="text-right">Slack</th>
                <th className="pr-5">Trains inside block</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <tr key={i}>
                  <td className="pl-5">
                    <DeptTag dept={b.dept_key} withName />
                  </td>
                  <td>
                    <Loc track={b.track} section={b.section} />
                  </td>
                  <td className="capitalize">{b.type}</td>
                  <td className="text-right">{b.start_time}</td>
                  <td className="text-right">{b.end_time}</td>
                  <td className="text-right">{b.duration}</td>
                  <td className="text-right">{b.deadline ?? "—"}</td>
                  <td className={`text-right ${b.on_time ? "" : "text-bad"}`}>{b.slack ?? "—"}</td>
                  <td className="pr-5">
                    {b.trains_affected.length ? (
                      <span className="text-bad">
                        {b.trains_affected.map((t) => `#${t.train_id}`).join(", ")}
                      </span>
                    ) : (
                      <span className="text-ink-3">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isPlanner && (
        <div className="grid gap-5 lg:grid-cols-2 mt-5 items-start">
          <Card title="Plan settings">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block text-[13px] font-medium mb-1.5">Plan date</span>
                <input
                  type="date"
                  className={`${inputCls} w-44`}
                  defaultValue={plan.plan_date}
                  onChange={(e) =>
                    e.target.value && act("date", () => api.patch(`/plans/${plan.id}`, { plan_date: e.target.value }), "Plan date updated.")
                  }
                />
              </label>
              {!approved && (
                <Button
                  variant="danger"
                  icon={Trash2}
                  loading={busy === "del"}
                  onClick={async () => {
                    if (!confirm("Delete this draft plan?")) return;
                    setBusy("del");
                    try {
                      await api.del(`/plans/${plan.id}`);
                      router.replace("/planner");
                    } catch (e) {
                      setMsg({ tone: "bad", text: e.message });
                      setBusy(null);
                    }
                  }}
                >
                  Delete draft
                </Button>
              )}
            </div>
          </Card>
          <Card title="Run record">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[14px]">
              <dt className="text-ink-3">Created</dt>
              <dd>{fmtDateTime(plan.created_at)} by {plan.created_by}</dd>
              <dt className="text-ink-3">Constraints</dt>
              <dd className="tnum">{plan.solver.constraints ?? "—"}</dd>
              {plan.solver.decomposed && (
                <>
                  <dt className="text-ink-3">Decomposed</dt>
                  <dd className="tnum">
                    {plan.solver.num_partitions} partitions
                    {plan.solver.total_vars_before_split ? ` (${plan.solver.total_vars_before_split} total vars)` : ""}
                  </dd>
                </>
              )}
              <dt className="text-ink-3">Last SUMO run</dt>
              <dd>{plan.simulated_at ? fmtDateTime(plan.simulated_at) : "Not run"}</dd>
              <dt className="text-ink-3">AI rerouting</dt>
              <dd>{plan.has_ai_result ? "Generated" : "Not generated"}</dd>
            </dl>
          </Card>
        </div>
      )}
    </>
  );
}
