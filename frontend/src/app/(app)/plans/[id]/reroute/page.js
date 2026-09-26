"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, ArrowRightLeft } from "lucide-react";
import { Button, Card, Empty, Notice, PageHeader, Spinner, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ENGINE } from "@/lib/format";

export default function ReroutePage() {
  const { id } = useParams();
  const res = useApi(`/alternate_data?plan_id=${id}`);
  const [regen, setRegen] = useState({ busy: false, error: null });
  const data = res.data;
  const error = regen.error || res.error;
  const loading = regen.busy || (!res.data && !res.error);

  const regenerate = async () => {
    setRegen({ busy: true, error: null });
    try {
      await api.get(`/alternate_data?plan_id=${id}&refresh=1`);
      await res.reload();
      setRegen({ busy: false, error: null });
    } catch (e) {
      setRegen({ busy: false, error: e.message });
    }
  };

  const back = (
    <Link href={`/plans/${id}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-accent mb-5 transition-colors">
      <ArrowLeft className="size-3.5" aria-hidden /> Plan #{id}
    </Link>
  );

  const header = (
    <PageHeader
      title="AI Rerouting"
      eyebrow="Gemini-powered conflict analysis"
      description="Checks the timetable against approved block windows, lists trains that clash with a block and proposes a diversion or time shift."
      actions={
        <Button icon={RefreshCw} loading={loading && !!data} disabled={loading} onClick={regenerate}>
          Regenerate
        </Button>
      }
    />
  );

  if (loading && !data) {
    return (
      <>
        {back}
        {header}
        <Card>
          <Spinner label="Asking Gemini to check the plan — this can take 10–30 seconds…" />
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        {back}
        {header}
        <Notice tone="bad">
          {error}
          {/api key|GEMINI|GOOGLE/i.test(error) && (
            <span className="block mt-1">Set GEMINI_API_KEY in backend/.env and restart the backend.</span>
          )}
        </Notice>
      </>
    );
  }

  const conflicts = data.data.conflicts || [];
  const reroutes = data.data.reroutes || [];
  const trainsById = Object.fromEntries(data.trains.map((t) => [t.train_id, t]));

  return (
    <>
      {back}
      {header}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Stat
          label="Conflicts found"
          value={conflicts.length}
          tone={conflicts.length ? "bad" : "ok"}
          hint={conflicts.length ? `${conflicts.length} train${conflicts.length > 1 ? "s" : ""} affected` : "All clear"}
        />
        <Stat label="Proposals ready" value={`${reroutes.length}/${data.trains.length}`} hint="Coverage ratio" />
        <Stat label="Blocks in plan" value={data.blocks.length} hint="Active maintenance windows" />
      </div>

      <Card title="Track occupancy" description="Maintenance blocks and train paths per track, before and after the proposals." flush>
        <OccupancyChart blocks={data.blocks} trains={data.trains} reroutes={reroutes} conflicts={conflicts} />
        <div className="h-4" />
      </Card>

      <Card className="mt-5" title="Conflicts" flush>
        {conflicts.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-5">Train</th>
                <th>Traction</th>
                <th>Track</th>
                <th className="text-right pr-5">Clash window</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c, i) => (
                <tr key={i}>
                  <td className="pl-5">
                    <span className="font-semibold">#{c.trainId}</span>
                  </td>
                  <td>
                    <span className="badge-neutral">{ENGINE[trainsById[c.trainId]?.engine_type] || "—"}</span>
                  </td>
                  <td className="font-mono text-[13px] tracking-wide">{c.track}</td>
                  <td className="text-right pr-5">
                    <span className="badge-critical">
                      slot {c.conflictStart}–{c.conflictEnd}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="No conflicts">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-ok" /> Gemini found no train running on a track during its block.</span>
          </Empty>
        )}
      </Card>

      <div className="flex items-center gap-2 mt-9 mb-4">
        <ArrowRightLeft className="size-4 text-accent" aria-hidden />
        <h2 className="font-semibold text-[16px] tracking-[-0.01em]">Proposed changes</h2>
        {reroutes.length > 0 && (
          <span className="badge-ok ml-2">{reroutes.length} plan{reroutes.length > 1 ? "s" : ""}</span>
        )}
      </div>
      {reroutes.length ? (
        <div className="space-y-4">
          {reroutes.map((r) => (
            <Card key={r.trainId}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-semibold text-[15px]">{r.name || `Train #${r.trainId}`}</span>
                  <span className="text-ink-3 text-[13px] ml-2">
                    <span className="badge-neutral ml-1">{ENGINE[r.engine] || r.engine}</span>
                    <span className="ml-2">Category {r.category}</span>
                  </span>
                </div>
                <span className="text-[13px] font-mono text-ok bg-ok-soft rounded px-2 py-0.5 font-medium">{r.impact}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <div className="rounded-md bg-bad-soft/50 border border-bad/10 px-4 py-3">
                  <div className="text-[11px] text-ink-3 mb-1.5 uppercase tracking-wider font-semibold">Current path</div>
                  <div className="text-[14px]">{r.originalDesc}</div>
                  <div className="text-[13px] text-bad mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {r.originalConflict}
                  </div>
                </div>
                <div className="rounded-md bg-ok-soft/50 border border-ok/10 px-4 py-3">
                  <div className="text-[11px] text-ink-3 mb-1.5 uppercase tracking-wider font-semibold">Proposed</div>
                  <div className="text-[14px]">{r.newDesc}</div>
                  <div className="text-[13px] text-ok mt-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    {r.newDetail}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty title="No changes proposed" />
        </Card>
      )}

      <p className="text-[11px] text-ink-3 mt-8 uppercase tracking-wider">
        Proposals are generated by an LLM and must be checked by the Control Office before use.
      </p>
    </>
  );
}

function trackSpans(schedule) {
  const spans = {};
  Object.entries(schedule || {}).forEach(([t, v]) => {
    const time = Number(t);
    const tr = v.split("_")[0];
    if (!spans[tr]) spans[tr] = [time, time + 1];
    else {
      spans[tr][0] = Math.min(spans[tr][0], time);
      spans[tr][1] = Math.max(spans[tr][1], time + 1);
    }
  });
  return spans;
}

function OccupancyChart({ blocks, trains, reroutes, conflicts }) {
  const rerouteBy = Object.fromEntries(reroutes.map((r) => [r.trainId, r]));
  const tracks = new Set([
    ...blocks.map((b) => b.track),
    ...conflicts.map((c) => c.track),
    ...reroutes.flatMap((r) => Object.keys(r.altTrackTimes || {})),
  ]);
  const order = [...tracks].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const maxEnd = Math.max(
    120,
    ...blocks.map((b) => b.end_time),
    ...reroutes.flatMap((r) => Object.values(r.altTrackTimes || {}).map((v) => v[1] || 0))
  );
  const axisMax = Math.ceil(maxEnd / 20) * 20;
  const pct = (t) => `${(t / axisMax) * 100}%`;
  const ticks = [];
  for (let t = 0; t <= axisMax; t += 20) ticks.push(t);

  if (!order.length) return <Empty title="Nothing to show" />;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[100px_1fr] text-[11px] text-ink-3 uppercase tracking-wider font-semibold">
          <div className="px-5 pb-2">Track</div>
          <div className="relative h-6 mr-6">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 tnum normal-case tracking-normal font-medium" style={{ left: pct(t) }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="border-t border-line">
          {order.map((track) => {
            const rowTrains = trains
              .map((t) => ({ t, span: trackSpans(t.schedule)[track] }))
              .filter((x) => x.span);
            const rowAlt = reroutes
              .map((r) => ({ r, span: r.altTrackTimes?.[track] }))
              .filter((x) => x.span && x.span.length === 2);
            const lanes = Math.max(1, rowTrains.length + rowAlt.length);
            const height = 20 + lanes * 14;
            return (
              <div key={track} className="grid grid-cols-[100px_1fr] border-b border-line last:border-b-0 hover:bg-sunken/40 transition-colors">
                <div className="px-5 py-2 font-mono text-[13px] font-semibold tracking-wide">{track}</div>
                <div className="relative mr-6" style={{ height }}>
                  {ticks.map((t) => (
                    <span key={t} className="absolute inset-y-0 w-px bg-line/50" style={{ left: pct(t) }} />
                  ))}
                  {blocks
                    .filter((b) => b.track === track)
                    .map((b, i) => (
                      <span
                        key={`b${i}`}
                        className="absolute inset-y-1 rounded border border-accent/20"
                        style={{
                          left: pct(b.start_time),
                          width: pct(b.end_time - b.start_time),
                          background:
                            "repeating-linear-gradient(135deg, rgba(158,27,50,.06) 0 4px, rgba(158,27,50,.02) 4px 8px)",
                        }}
                        title={`Block ${b.track} ${b.section} · slot ${b.start_time}–${b.end_time}`}
                      />
                    ))}
                  {rowTrains.map(({ t, span }, i) => {
                    const hasAlt = !!rerouteBy[t.train_id];
                    return (
                      <span
                        key={`t${t.train_id}`}
                        className={`absolute h-2 rounded-full ${hasAlt ? "bg-bad/60" : "bg-ink-3/40"}`}
                        style={{ left: pct(span[0]), width: `max(6px, ${pct(span[1] - span[0])})`, top: 10 + i * 14 }}
                        title={`Train #${t.train_id} · slot ${span[0]}–${span[1]}`}
                      />
                    );
                  })}
                  {rowAlt.map(({ r, span }, i) => (
                    <span
                      key={`a${r.trainId}`}
                      className="absolute h-2 rounded-full bg-ok"
                      style={{
                        left: pct(span[0]),
                        width: `max(6px, ${pct(span[1] - span[0])})`,
                        top: 10 + (rowTrains.length + i) * 14,
                      }}
                      title={`Proposed: train #${r.trainId} · slot ${span[0]}–${span[1]}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-6 px-5 pt-4 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-2">
            <span
              className="w-5 h-3.5 rounded border border-accent/20"
              style={{ background: "repeating-linear-gradient(135deg, rgba(158,27,50,.08) 0 3px, transparent 3px 6px)" }}
            />
            <span className="font-medium">Block</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-5 h-2 rounded-full bg-ink-3/40" />
            <span className="font-medium">Train path</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-5 h-2 rounded-full bg-bad/60" />
            <span className="font-medium">Conflicting train</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-5 h-2 rounded-full bg-ok" />
            <span className="font-medium">Proposed path</span>
          </span>
        </div>
      </div>
    </div>
  );
}
