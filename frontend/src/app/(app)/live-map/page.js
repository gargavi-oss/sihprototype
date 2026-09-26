"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, DeptTag, Empty, Notice, PageHeader, Spinner, StatusPill, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { DEPTS, ENGINE, fmtDate } from "@/lib/format";
import {
  STATUS_LABEL, blockState, buildBlocks, plannedTrainsAt, simTrails, simTrainsAt,
} from "@/lib/mapModel";
import { useApi } from "@/lib/useApi";

const LeafletMap = dynamic(() => import("@/components/map/LeafletMap"), {
  ssr: false,
  loading: () => <Spinner label="Loading India map…" />,
});

const SPEEDS = [1, 2, 4, 8, 16];

export default function LiveMapPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LiveMap />
    </Suspense>
  );
}

function LiveMap() {
  const { user } = useAuth();
  const isPlanner = user?.role === "planner";
  const params = useSearchParams();
  const net = useApi("/network");
  const list = useApi("/plans?from=2000-01-01&to=2100-12-31");

  const plans = useMemo(() => [...(list.data?.plans || [])].sort((a, b) => b.id - a.id), [list.data]);
  const [chosen, setChosen] = useState(null);
  const planId =
    chosen ??
    (params.get("plan") ? Number(params.get("plan")) : null) ??
    (plans.find((p) => p.has_trajectory) || plans[0])?.id ??
    null;

  const planRes = useApi(planId ? `/plans/${planId}` : null);
  const planMeta = plans.find((p) => p.id === planId);
  const trajRes = useApi(planId && planMeta?.has_trajectory ? `/plans/${planId}/trajectory` : null);

  const plan = planRes.data?.plan;
  const traj = planMeta?.has_trajectory ? trajRes.data : null;
  const mode = traj ? "sim" : "timetable";
  const trajLoading = !!planMeta?.has_trajectory && !trajRes.data && !trajRes.error;

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [ghostsOn, setGhostsOn] = useState(false);
  const [selected, setSelected] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simErr, setSimErr] = useState(null);

  const maxT = traj ? traj.frames.length - 1 : 119;

  // Playback loop
  const last = useRef(null);
  useEffect(() => {
    if (!playing) return;
    let raf;
    const step = (now) => {
      if (last.current != null) {
        const dt = (now - last.current) / 1000;
        setT((v) => {
          const n = v + dt * speed;
          if (n >= maxT) {
            setPlaying(false);
            return maxT;
          }
          return n;
        });
      }
      last.current = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [playing, speed, maxT]);

  const blocks = useMemo(() => buildBlocks(plan, traj), [plan, traj]);
  const trains = useMemo(() => {
    if (!net.data || !plan) return [];
    return mode === "sim"
      ? simTrainsAt(traj, t, plan.trains)
      : plannedTrainsAt(plan.trains, plan.delays, net.data.sections, t);
  }, [mode, traj, t, plan, net.data]);
  const ghosts = useMemo(
    () => (mode === "sim" && ghostsOn && net.data && plan ? plannedTrainsAt(plan.trains, plan.delays, net.data.sections, t) : []),
    [mode, ghostsOn, net.data, plan, t]
  );
  const trails = useMemo(() => (mode === "sim" ? simTrails(traj, t) : {}), [mode, traj, t]);

  const runSim = async () => {
    setSimBusy(true);
    setSimErr(null);
    try {
      await api.post("/simulate", { plan_id: planId, headless: true });
      await list.reload();
      setT(0);
    } catch (e) {
      setSimErr(e.message);
    } finally {
      setSimBusy(false);
    }
  };

  if (net.error || list.error) return <Notice tone="bad">{net.error || list.error}</Notice>;
  if (!net.data || !list.data) return <Spinner />;
  if (!plans.length) {
    return (
      <>
        <PageHeader title="Live map" />
        <Card>
          <Empty title={isPlanner ? "No plans yet" : "No approved plans yet"}>
            {isPlanner ? "Run the optimiser first, then open the plan here." : "The map shows plans once the planning cell approves them."}
          </Empty>
        </Card>
      </>
    );
  }

  const tInt = Math.floor(t);
  const activeBlocks = blocks.filter((b) => blockState(b, t) === "active");
  const held = trains.filter((x) => x.status === "held").length;
  const running = trains.filter((x) => x.status === "running" || x.status === "planned").length;

  return (
    <>
      <PageHeader
        title="Live map"
        description={
          mode === "sim"
            ? "Train positions recorded from the SUMO simulation of this plan, with maintenance blocks as SUMO applied them."
            : "Timetable positions (with forecast delay) against the planned block windows. Run the simulation to see actual movements."
        }
        actions={
          <div className="flex items-center gap-2">
            <select
              value={planId ?? ""}
              onChange={(e) => {
                setChosen(Number(e.target.value));
                setT(0);
                setPlaying(false);
                setSelected(null);
              }}
              className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-sm max-w-[280px]"
              aria-label="Plan"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} · {fmtDate(p.plan_date, { day: "numeric", month: "short" })} · {p.title || "Block plan"}
                  {p.has_trajectory ? "" : " (not simulated)"}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {trajRes.error && <Notice tone="bad" className="mb-4">{trajRes.error}</Notice>}
      {mode === "timetable" && planMeta && !trajLoading && (
        <Notice tone="warn" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>This plan has not been simulated yet — showing timetable positions only.</span>
          {isPlanner && (
            <Button size="sm" variant="primary" loading={simBusy} onClick={runSim}>
              {simBusy ? "Running SUMO…" : "Run simulation"}
            </Button>
          )}
        </Notice>
      )}
      {simErr && <Notice tone="bad" className="mb-4">{simErr}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[1fr_320px] items-start">
        <div className="min-w-0 space-y-3">
          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            {!plan || trajLoading ? (
              <Spinner label={trajLoading ? "Loading simulation…" : "Loading…"} />
            ) : (
              <LeafletMap
                network={net.data}
                blocks={blocks}
                trains={trains}
                ghosts={ghosts}
                trails={trails}
                t={t}
                selected={selected}
                onSelect={setSelected}
              />
            )}
          </div>

          {/* Playback */}
          <div className="bg-surface border border-line rounded-lg px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <IconBtn label="Back 10" onClick={() => setT((v) => Math.max(0, v - 10))} icon={SkipBack} />
                <button
                  onClick={() => {
                    if (t >= maxT) setT(0);
                    setPlaying((p) => !p);
                  }}
                  className="size-9 grid place-items-center rounded-md bg-accent text-white hover:bg-accent-strong cursor-pointer"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <IconBtn label="Forward 10" onClick={() => setT((v) => Math.min(maxT, v + 10))} icon={SkipForward} />
                <IconBtn
                  label="Restart"
                  onClick={() => {
                    setT(0);
                    setPlaying(false);
                  }}
                  icon={RotateCcw}
                />
              </div>
              <div className="font-mono text-[13px] tnum w-[120px]">
                {mode === "sim" ? "t" : "slot"} {String(tInt).padStart(3, " ")}
                <span className="text-ink-3"> / {maxT}</span>
              </div>
              <input
                type="range"
                min={0}
                max={maxT}
                step={0.1}
                value={t}
                onChange={(e) => setT(Number(e.target.value))}
                className="flex-1 min-w-[160px] accent-[#0ea5e9]"
                aria-label="Time"
              />
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px]"
                aria-label="Playback speed"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}× speed
                  </option>
                ))}
              </select>
            </div>
            <BlockStrip blocks={blocks} maxT={maxT} t={t} onSeek={setT} />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-[12px] text-ink-3">
              {["tms", "smms", "tdms"].map((d) => (
                <span key={d} className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm" style={{ background: DEPTS[d].color }} /> {DEPTS[d].name}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-2 rounded-full bg-ink" /> Train
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-2 rounded-full bg-ink ring-2 ring-bad" /> Held at signal
              </span>
              {mode === "sim" && (
                <label className="inline-flex items-center gap-1.5 ml-auto cursor-pointer text-ink-2">
                  <input type="checkbox" checked={ghostsOn} onChange={(e) => setGhostsOn(e.target.checked)} className="accent-[#0ea5e9]" />
                  Show timetable positions
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Side panels */}
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Active blocks" value={activeBlocks.length} />
            <Mini label="Running" value={running} />
            <Mini label="Held" value={held} tone={held ? "bad" : undefined} />
          </div>

          <Card title="Blocks" description={mode === "sim" ? "Windows as applied in SUMO" : "Planned windows"} flush>
            <ul className="divide-y divide-line border-t border-line">
              {blocks.map((b) => {
                const st = blockState(b, t);
                return (
                  <li key={b.id}>
                    <button
                      onClick={() => {
                        setSelected(`block:${b.id}`);
                        if (!b.neverStarted) setT(b.start);
                      }}
                      className={cx(
                        "w-full text-left px-4 py-2.5 hover:bg-sunken/60 cursor-pointer",
                        selected === `block:${b.id}` && "bg-sunken"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <DeptTag dept={b.dept} />
                        <span className="font-mono text-[13px]">{b.loc.replace("_", " · ")}</span>
                        <span className="ml-auto">
                          <BlockBadge state={st} />
                        </span>
                      </div>
                      <div className="text-[12px] text-ink-3 mt-1 tnum">
                        {b.neverStarted ? (
                          <>Not started within the run</>
                        ) : (
                          <>
                            {b.start}–{b.end}
                            {st === "active" && <span className="text-ink-2"> · {Math.ceil(b.end - t)} left</span>}
                            {b.shifted && (
                              <span className="text-warn">
                                {" "}
                                · planned {b.plannedStart}–{b.plannedEnd}, held back by traffic
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Trains" description={`${trains.length} on the network`} flush>
            {trains.length ? (
              <ul className="divide-y divide-line border-t border-line max-h-[340px] overflow-y-auto">
                {[...trains]
                  .sort((a, b) => a.trainId - b.trainId)
                  .map((tr) => (
                    <li key={tr.key}>
                      <button
                        onClick={() => setSelected(`train:${tr.key}`)}
                        className={cx(
                          "w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-sunken/60 cursor-pointer",
                          selected === `train:${tr.key}` && "bg-sunken"
                        )}
                      >
                        <span className="font-medium tnum w-8">#{tr.trainId}</span>
                        <span className="text-[12px] text-ink-3 w-14">{ENGINE[tr.traction] || tr.traction}</span>
                        <span className="font-mono text-[12px]">{tr.edge.replace("_", " ")}</span>
                        <span
                          className={cx(
                            "ml-auto text-[12px]",
                            tr.status === "held" ? "text-bad font-medium" : tr.status === "station" ? "text-ink-2" : "text-ink-3"
                          )}
                        >
                          {STATUS_LABEL[tr.status]}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <Empty title="No trains on the network at this moment" />
            )}
          </Card>

          {plan && (
            <div className="flex items-center justify-between text-[13px] text-ink-2 px-1">
              <span className="inline-flex items-center gap-2">
                Plan #{plan.id} <StatusPill status={plan.status} />
              </span>
              <Link href={`/plans/${plan.id}`} className="hover:text-ink">
                Open plan →
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function IconBtn({ label, onClick, icon: I }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="size-9 grid place-items-center rounded-md hover:bg-sunken cursor-pointer">
      <I className="size-4" />
    </button>
  );
}

function Mini({ label, value, tone }) {
  return (
    <div className="bg-surface border border-line rounded-lg px-3 py-2.5">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className={cx("text-xl font-semibold tnum", tone === "bad" && "text-bad")}>{value}</div>
    </div>
  );
}

function BlockBadge({ state }) {
  const map = {
    active: ["Active", "bg-bad-soft text-bad"],
    upcoming: ["Upcoming", "bg-sunken text-ink-2"],
    done: ["Cleared", "bg-ok-soft text-ok"],
    pending: ["Deferred", "bg-warn-soft text-warn"],
  };
  const [l, c] = map[state];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c}`}>{l}</span>;
}

/** Thin timeline under the scrubber showing each block window. */
function BlockStrip({ blocks, maxT, t, onSeek }) {
  const pct = (v) => `${(Math.min(maxT, v) / maxT) * 100}%`;
  return (
    <div className="mt-3 relative" aria-hidden>
      <div className="space-y-1">
        {blocks.map((b) =>
          b.neverStarted ? null : (
            <div key={b.id} className="relative h-1.5 rounded-full bg-sunken">
              <button
                onClick={() => onSeek(b.start)}
                className="absolute inset-y-0 rounded-full cursor-pointer"
                style={{ left: pct(b.start), width: `calc(${pct(b.end)} - ${pct(b.start)})`, background: DEPTS[b.dept]?.color || "#52524c" }}
                title={`${b.loc} · ${b.start}–${b.end}`}
                tabIndex={-1}
              />
            </div>
          )
        )}
      </div>
      <div className="absolute -top-1 -bottom-1 w-px bg-ink" style={{ left: pct(t) }} />
    </div>
  );
}
