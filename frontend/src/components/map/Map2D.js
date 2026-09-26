"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { DEPTS } from "@/lib/format";
import { PLATFORM_TRACKS, blockState, pointAlong } from "@/lib/mapModel";

const PAD = 1800;

export default function Map2D({ network, blocks, trains, ghosts, trails, t, selected, onSelect }) {
  const wrap = useRef(null);
  const svg = useRef(null);
  const [width, setWidth] = useState(900);
  const [bx0, by0, bx1, by1] = network.bounds;
  const home = useMemo(
    () => ({ x: bx0 - PAD, y: -by1 - PAD, w: bx1 - bx0 + PAD * 2, h: by1 - by0 + PAD * 2 }),
    [bx0, by0, bx1, by1]
  );
  const [vb, setVb] = useState(home);
  const drag = useRef(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom around the cursor (needs a non-passive listener)
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const z = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setVb((v) => {
        const w = Math.min(home.w * 1.5, Math.max(2500, v.w * z));
        const h = (w / v.w) * v.h;
        return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [home]);

  const zoom = (z) =>
    setVb((v) => {
      const w = Math.min(home.w * 1.5, Math.max(2500, v.w * z));
      const h = (w / v.w) * v.h;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });

  // px → world units, so strokes and text stay the same on-screen size at any zoom
  const k = vb.w / Math.max(1, width);
  const P = (x, y) => `${x},${-y}`;
  const line = (shape) => shape.map(([x, y]) => P(x, y)).join(" ");
  const sections = network.sections;

  // Label positions: middle section of each line track
  const trackLabels = useMemo(() => {
    const out = [];
    network.tracks.forEach((tr) => {
      const mid = sections[`${tr.id}_S${Math.ceil(tr.sections / 2)}`];
      if (!mid) return;
      const p = pointAlong(mid.shape, 0.5);
      out.push({ id: tr.id, x: p.x, y: p.y, dx: p.dx, dy: p.dy });
    });
    return out;
  }, [network, sections]);

  const height = Math.round((vb.h / vb.w) * width);

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height: Math.max(360, Math.min(620, height)) }}>
      <svg
        ref={svg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        role="img"
        aria-label={`Network map at t = ${Math.floor(t)}`}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vb };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const s = drag.current.vb.w / r.width;
          setVb({ ...drag.current.vb, x: drag.current.vb.x - (e.clientX - drag.current.x) * s, y: drag.current.vb.y - (e.clientY - drag.current.y) * s });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {/* Ballast + rail */}
        {Object.entries(sections).map(([id, s]) => (
          <polyline key={`b-${id}`} points={line(s.shape)} fill="none" stroke="#e2e2dc" strokeWidth={9 * k} strokeLinecap="round" />
        ))}
        {Object.entries(sections).map(([id, s]) => (
          <polyline
            key={`r-${id}`}
            points={line(s.shape)}
            fill="none"
            stroke={PLATFORM_TRACKS.has(id.split("_")[0]) ? "#8a8a82" : "#6b6b64"}
            strokeWidth={2 * k}
          />
        ))}
        {/* Section boundaries */}
        {Object.entries(sections).map(([id, s]) => {
          const [x, y] = s.shape[0];
          return <circle key={`c-${id}`} cx={x} cy={-y} r={1.6 * k} fill="#9a9a92" />;
        })}

        {/* Blocks */}
        {blocks.map((b) => {
          const s = sections[b.loc];
          if (!s) return null;
          const st = blockState(b, t);
          const color = DEPTS[b.dept]?.color || "#52524c";
          const mid = pointAlong(s.shape, 0.5);
          const isSel = selected === `block:${b.id}`;
          return (
            <g key={`blk-${b.id}`} onClick={() => onSelect?.(`block:${b.id}`)} className="cursor-pointer">
              <title>{`${b.loc.replace("_", " ")} · ${DEPTS[b.dept]?.system || ""} ${b.type} block · ${b.start}–${b.end}`}</title>
              <polyline
                points={line(s.shape)}
                fill="none"
                stroke={st === "done" ? "#b9b9b2" : color}
                strokeWidth={(st === "active" ? 11 : 8) * k}
                strokeOpacity={st === "active" ? 0.95 : st === "done" ? 0.5 : 0.35}
                strokeDasharray={st === "upcoming" || st === "pending" ? `${6 * k} ${4 * k}` : undefined}
                strokeLinecap="butt"
              />
              {st === "active" && (
                <g transform={`translate(${mid.x},${-mid.y})`}>
                  <rect x={-7 * k} y={-21 * k} width={14 * k} height={12 * k} rx={2 * k} fill={color} />
                  <path d={`M${-3.5 * k},${-15 * k} L${3.5 * k},${-15 * k}`} stroke="#fff" strokeWidth={1.6 * k} />
                </g>
              )}
              {isSel && (
                <polyline points={line(s.shape)} fill="none" stroke="#1b1b19" strokeWidth={14 * k} strokeOpacity={0.15} />
              )}
            </g>
          );
        })}

        {/* Stations & junctions */}
        {network.stations.map((s) =>
          s.pos ? (
            <g key={s.id}>
              <rect x={s.pos[0] - 5 * k} y={-s.pos[1] - 5 * k} width={10 * k} height={10 * k} fill="#fff" stroke="#1b1b19" strokeWidth={1.5 * k} />
              <text x={s.pos[0]} y={-s.pos[1] + 20 * k} fontSize={12 * k} textAnchor="middle" fill="#1b1b19" fontWeight={500}>
                {s.name}
              </text>
            </g>
          ) : null
        )}
        {network.junctions.map((j) =>
          j.pos ? (
            <g key={j.id}>
              <rect
                x={j.pos[0] - 4 * k}
                y={-j.pos[1] - 4 * k}
                width={8 * k}
                height={8 * k}
                fill="#1b1b19"
                transform={`rotate(45 ${j.pos[0]} ${-j.pos[1]})`}
              />
              <text x={j.pos[0]} y={-j.pos[1] + 18 * k} fontSize={10.5 * k} textAnchor="middle" fill="#7d7d76">
                {j.id.replace("_", " ")}
              </text>
            </g>
          ) : null
        )}
        {trackLabels.map((l) => (
          <text
            key={l.id}
            x={l.x - l.dy * 14 * k}
            y={-(l.y + l.dx * 14 * k) + 4 * k}
            fontSize={10.5 * k}
            textAnchor="middle"
            fill="#7d7d76"
            fontFamily="var(--font-mono)"
          >
            {l.id}
          </text>
        ))}

        {/* Trails */}
        {Object.entries(trails || {}).map(([id, pts]) =>
          pts.length > 1 ? (
            <polyline key={`tr-${id}`} points={pts.map(([x, y]) => P(x, y)).join(" ")} fill="none" stroke="#1b1b19" strokeOpacity={0.18} strokeWidth={4 * k} strokeLinecap="round" strokeLinejoin="round" />
          ) : null
        )}

        {/* Timetable ghosts */}
        {(ghosts || []).map((g) => (
          <TrainGlyph key={g.key} tr={g} k={k} ghost />
        ))}

        {/* Trains */}
        {trains.map((tr) => (
          <g key={tr.key} onClick={() => onSelect?.(`train:${tr.key}`)} className="cursor-pointer">
            <TrainGlyph tr={tr} k={k} selected={selected === `train:${tr.key}`} />
          </g>
        ))}
      </svg>

      <div className="absolute right-3 top-3 flex flex-col rounded-md border border-line bg-surface overflow-hidden">
        <button onClick={() => zoom(1 / 1.4)} className="size-8 grid place-items-center hover:bg-sunken cursor-pointer" aria-label="Zoom in">
          <Plus className="size-4" />
        </button>
        <button onClick={() => zoom(1.4)} className="size-8 grid place-items-center hover:bg-sunken border-t border-line cursor-pointer" aria-label="Zoom out">
          <Minus className="size-4" />
        </button>
        <button onClick={() => setVb(home)} className="size-8 grid place-items-center hover:bg-sunken border-t border-line cursor-pointer" aria-label="Reset view">
          <Maximize2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function TrainGlyph({ tr, k, ghost, selected }) {
  const ang = (Math.atan2(-tr.dy, tr.dx) * 180) / Math.PI; // SVG y is flipped
  const L = 22 * k;
  const W = 9 * k;
  const held = tr.status === "held";
  return (
    <g>
      <title>{`Train #${tr.trainId} · ${tr.edge}${tr.speed != null ? ` · ${tr.speed.toFixed(1)} m/s` : ""}`}</title>
      <g transform={`translate(${tr.x},${-tr.y}) rotate(${ang})`}>
        {selected && <rect x={-L / 2 - 4 * k} y={-W / 2 - 4 * k} width={L + 8 * k} height={W + 8 * k} rx={6 * k} fill="none" stroke="#0ea5e9" strokeWidth={2 * k} />}
        <rect
          x={-L / 2}
          y={-W / 2}
          width={L}
          height={W}
          rx={W / 2}
          fill={ghost ? "none" : "#1b1b19"}
          stroke={ghost ? "#1b1b19" : held ? "#b42318" : "#fff"}
          strokeOpacity={ghost ? 0.45 : 1}
          strokeWidth={(ghost ? 1.2 : held ? 2.4 : 1.2) * k}
          strokeDasharray={ghost ? `${3 * k} ${2 * k}` : undefined}
        />
        {!ghost && <rect x={L / 2 - 6 * k} y={-W / 2 + 2 * k} width={4 * k} height={W - 4 * k} rx={1 * k} fill="#f6e8eb" />}
      </g>
      {!ghost && (
        <g transform={`translate(${tr.x},${-tr.y - 17 * k})`}>
          <rect x={-11 * k} y={-8 * k} width={22 * k} height={14 * k} rx={3 * k} fill={held ? "#b42318" : "#fff"} stroke={held ? "#b42318" : "#cfcfc8"} strokeWidth={1 * k} />
          <text y={2.8 * k} fontSize={10 * k} textAnchor="middle" fill={held ? "#fff" : "#1b1b19"} fontFamily="var(--font-mono)" fontWeight={500}>
            {tr.trainId}
          </text>
        </g>
      )}
    </g>
  );
}
