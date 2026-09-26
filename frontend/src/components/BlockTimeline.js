"use client";

import { DEPTS } from "@/lib/format";
import { DeptTag, Loc } from "@/components/ui";

/**
 * Horizontal block chart: one row per scheduled block, x = time slot.
 * Train passes through the same section are drawn as ticks
 * (grey = outside the block, red = inside the block window).
 */
export default function BlockTimeline({ blocks, trains = [], delays = {} }) {
  const maxEnd = Math.max(120, ...blocks.map((b) => b.end_time));
  const axisMax = Math.ceil(maxEnd / 20) * 20;
  const ticks = [];
  for (let t = 0; t <= axisMax; t += 20) ticks.push(t);
  const pct = (t) => `${(t / axisMax) * 100}%`;

  const passesFor = (b) => {
    const loc = `${b.track}_${b.section}`;
    const out = [];
    trains.forEach((tr) => {
      const d = Number(delays[tr.train_id] ?? delays[String(tr.train_id)] ?? 0);
      Object.entries(tr.schedule || {}).forEach(([t, v]) => {
        if (v === loc) {
          const slot = Number(t) + d;
          out.push({ id: tr.train_id, slot, hit: slot >= b.start_time && slot < b.end_time });
        }
      });
    });
    return out;
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        {/* Axis */}
        <div className="grid grid-cols-[168px_1fr] text-[12px] text-ink-3">
          <div className="px-5 pb-2">Section</div>
          <div className="relative h-6 mr-6">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 tnum" style={{ left: pct(t) }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="border-t border-line">
          {blocks.map((b, i) => {
            const d = DEPTS[b.dept_key];
            const passes = passesFor(b);
            return (
              <div key={i} className="grid grid-cols-[168px_1fr] border-b border-line last:border-b-0">
                <div className="px-5 py-3 flex items-center gap-2">
                  <Loc track={b.track} section={b.section} />
                  <DeptTag dept={b.dept_key} />
                </div>
                <div className="relative mr-6 h-[60px]">
                  {/* grid lines */}
                  {ticks.map((t) => (
                    <span key={t} className="absolute inset-y-0 w-px bg-line/70" style={{ left: pct(t) }} />
                  ))}
                  {/* planning window end (slot 120) */}
                  {axisMax > 120 && (
                    <span
                      className="absolute inset-y-0 right-0 bg-sunken/70"
                      style={{ left: pct(120) }}
                      title="Beyond the 120-slot planning window"
                    />
                  )}
                  {/* block */}
                  <div
                    className="absolute top-2.5 h-7 rounded-[4px] flex items-center px-2 text-[12px] font-medium text-white overflow-hidden whitespace-nowrap"
                    style={{
                      left: pct(b.start_time),
                      width: pct(b.end_time - b.start_time),
                      background: d?.color || "var(--color-ink-2)",
                    }}
                    title={`${b.track} ${b.section} · slot ${b.start_time}–${b.end_time}`}
                  >
                    <span className="tnum">
                      {b.start_time}–{b.end_time}
                    </span>
                  </div>
                  {/* start-by marker */}
                  {b.deadline != null && (
                    <span
                      className="absolute top-1 bottom-1 w-0 border-l-2 border-dashed border-ink/50"
                      style={{ left: pct(b.deadline) }}
                      title={`Must start by slot ${b.deadline}`}
                    />
                  )}
                  {/* train passes */}
                  {passes.map((p, j) => (
                    <span
                      key={j}
                      className={`absolute bottom-0.5 -translate-x-1/2 text-[10px] leading-none font-mono ${
                        p.hit ? "text-bad font-medium" : "text-ink-3"
                      }`}
                      style={{ left: pct(p.slot) }}
                      title={`Train #${p.id} at slot ${p.slot}${p.hit ? " — inside block" : ""}`}
                    >
                      <span className={`block mx-auto w-px h-1.5 mb-px ${p.hit ? "bg-bad" : "bg-ink-3"}`} />
                      {p.id}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pt-3 text-[12px] text-ink-3">
          {["tms", "smms", "tdms"].map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm" style={{ background: DEPTS[k].color }} />
              {DEPTS[k].name}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 border-l-2 border-dashed border-ink/50" /> Start-by slot
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono">
            <span className="text-ink-3">7</span> train passing
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono">
            <span className="text-bad">8</span> train inside block
          </span>
        </div>
      </div>
    </div>
  );
}
