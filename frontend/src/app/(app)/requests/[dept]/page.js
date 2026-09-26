"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import UploadBox from "@/components/UploadBox";
import { Button, Card, Empty, Loc, Notice, PageHeader, Spinner, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { DEPTS, addDays, fmtDate, fmtDateTime, isoDate } from "@/lib/format";

export default function DeptRequestsPage() {
  const { dept } = useParams();
  const { user } = useAuth();
  const info = DEPTS[dept];
  const canEdit = user?.role === dept;

  const { data, error, reload: load } = useApi(info ? `/dept/${dept}/requests` : null);
  const [range] = useState(() => ({
    from: isoDate(addDays(new Date(), -30)),
    to: isoDate(addDays(new Date(), 60)),
  }));
  const plansRes = useApi(`/plans?from=${range.from}&to=${range.to}`);
  const plans = (plansRes.data?.plans || []).filter((p) => p.status === "approved");

  if (!info) return <Empty title="Unknown department" />;
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <Spinner />;

  const rows = [...data.rows].sort((a, b) => a.deadline - b.deadline || b.block_duration - a.block_duration);
  const totalSlots = rows.reduce((s, r) => s + r.block_duration, 0);

  // Blocks granted to this department in approved plans
  const granted = plans.flatMap((p) =>
    p.blocks.filter((b) => b.dept_key === dept).map((b) => ({ ...b, plan: p }))
  );

  return (
    <>
      <PageHeader
        eyebrow={`${info.system} · ${info.full}`}
        title={`${info.name} block requests`}
        description={
          canEdit
            ? "Upload the maintenance blocks your department needs for the next planning cycle. A new upload replaces the current submission."
            : "Read-only view of this department's current submission."
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
        {canEdit ? (
          <Card title="Submit requests" description="One row per track section that needs a block.">
            <UploadBox
              columns="track_id, section_id, block_duration, deadline, maintenance_type"
              template="blocks"
              onUpload={async (file) => {
                const r = await api.upload(`/dept/${dept}/upload`, file);
                await load();
                return `${r.rows} request${r.rows === 1 ? "" : "s"} saved to the ${info.system} database.`;
              }}
              onSample={async () => {
                const r = await api.post(`/dept/${dept}/sample`);
                await load();
                return `Sample file loaded (${r.rows} requests).`;
              }}
            />
          </Card>
        ) : (
          <Card title="Submission">
            <p className="text-ink-2 text-[14px]">
              Only {info.name} users can change these requests. The planning cell uses the current
              submission when it runs the optimiser.
            </p>
          </Card>
        )}

        <Card title="Current submission">
          {data.active ? (
            <dl className="grid grid-cols-2 gap-y-3 text-[14px]">
              <dt className="text-ink-3">File</dt>
              <dd className="truncate" title={data.active.filename}>{data.active.filename}</dd>
              <dt className="text-ink-3">Requests</dt>
              <dd className="tnum">{data.active.row_count}</dd>
              <dt className="text-ink-3">Block time</dt>
              <dd className="tnum">{totalSlots} slots</dd>
              <dt className="text-ink-3">Earliest start-by</dt>
              <dd className="tnum">{rows.length ? `slot ${rows[0].deadline}` : "—"}</dd>
              <dt className="text-ink-3">Submitted</dt>
              <dd>
                {fmtDateTime(data.active.uploaded_at)}
                <span className="block text-[12px] text-ink-3">by {data.active.uploaded_by}</span>
              </dd>
            </dl>
          ) : (
            <p className="text-ink-3 text-[14px]">Nothing submitted yet.</p>
          )}
          {canEdit && data.active && (
            <Button
              variant="danger"
              size="sm"
              className="mt-5"
              onClick={async () => {
                if (!confirm("Withdraw the current submission? The planner will no longer see these requests.")) return;
                await api.post(`/dept/${dept}/withdraw`);
                load();
              }}
            >
              Withdraw submission
            </Button>
          )}
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Requested blocks"
        description="Sorted by urgency — the slot by which each block must start."
        flush
      >
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="pl-5">Section</th>
                  <th>Work type</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">Start by</th>
                  <th className="pr-5">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="pl-5">
                      <Loc track={`R${r.track_id}`} section={`S${r.section_id}`} />
                    </td>
                    <td className="capitalize">{r.maintenance_type}</td>
                    <td className="text-right">{r.block_duration} slots</td>
                    <td className="text-right">slot {r.deadline}</td>
                    <td className="pr-5">
                      <Urgency deadline={r.deadline} duration={r.block_duration} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No requests">
            {canEdit ? "Upload a CSV or use the sample data to get started." : "This department has not submitted requests."}
          </Empty>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 mt-5 items-start">
        <Card title="Granted in approved plans" description="Blocks the planning cell has confirmed for your department." flush>
          {granted.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="pl-5">Date</th>
                  <th>Section</th>
                  <th className="text-right pr-5">Window</th>
                </tr>
              </thead>
              <tbody>
                {granted.map((g, i) => (
                  <tr key={i}>
                    <td className="pl-5">
                      <Link href={`/plans/${g.plan.id}`} className="hover:text-accent">
                        {fmtDate(g.plan.plan_date, { day: "numeric", month: "short", weekday: "short" })}
                      </Link>
                    </td>
                    <td>
                      <Loc track={g.track} section={g.section} />
                    </td>
                    <td className="text-right pr-5 tnum">
                      slot {g.start_time}–{g.end_time}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title="No approved blocks yet" />
          )}
        </Card>

        <Card title="Upload history" flush>
          {data.history.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="pl-5">File</th>
                  <th className="text-right">Rows</th>
                  <th>Submitted</th>
                  <th className="pr-5" />
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td className="pl-5 max-w-[180px] truncate" title={h.filename}>{h.filename}</td>
                    <td className="text-right">{h.row_count}</td>
                    <td className="text-ink-2">{fmtDateTime(h.uploaded_at)}</td>
                    <td className="pr-5 text-right">{h.is_active ? <StatusPill status="received" /> : <span className="text-[12px] text-ink-3">Replaced</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title="No uploads yet" />
          )}
        </Card>
      </div>
    </>
  );
}

/** Urgency from the start-by slot relative to the 120-slot planning window. */
function Urgency({ deadline }) {
  const level = deadline <= 40 ? "High" : deadline <= 80 ? "Medium" : "Low";
  const cls = { High: "text-bad", Medium: "text-warn", Low: "text-ink-3" }[level];
  return <span className={`text-[13px] font-medium ${cls}`}>{level}</span>;
}
