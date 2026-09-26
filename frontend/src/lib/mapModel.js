// Shared model for the live map (2D + 3D).
// Coordinates are SUMO network metres (x right, y up).

export const PLATFORM_TRACKS = new Set(["R11", "R12", "R13", "R14", "R15", "R16", "R17", "R18"]);

export const TRACTION = {
  train_diesel: { key: "D", label: "Diesel" },
  train_electrified: { key: "E", label: "Electric" },
  train_hybrid: { key: "H", label: "Hybrid" },
};

const lerp = (a, b, f) => a + (b - a) * f;

/** Point + heading at fraction f (0..1) along a polyline. */
export function pointAlong(shape, f) {
  if (!shape || shape.length === 0) return null;
  if (shape.length === 1) return { x: shape[0][0], y: shape[0][1], dx: 1, dy: 0 };
  let total = 0;
  const segs = [];
  for (let i = 0; i < shape.length - 1; i++) {
    const [x1, y1] = shape[i];
    const [x2, y2] = shape[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    segs.push({ x1, y1, x2, y2, len });
    total += len;
  }
  let d = Math.max(0, Math.min(1, f)) * total;
  for (const s of segs) {
    if (d <= s.len || s === segs[segs.length - 1]) {
      const g = s.len ? d / s.len : 0;
      return { x: lerp(s.x1, s.x2, g), y: lerp(s.y1, s.y2, g), dx: (s.x2 - s.x1) / (s.len || 1), dy: (s.y2 - s.y1) / (s.len || 1) };
    }
    d -= s.len;
  }
  return null;
}

export const trainNum = (vehId) => parseInt(String(vehId).split("_")[1], 10);

/**
 * Builds block list with the window used for playback.
 * With a SUMO trajectory we use the windows SUMO actually applied
 * (it postpones a block while a train is still on the section).
 */
export function buildBlocks(plan, traj) {
  const planBlocks = plan?.analysis?.blocks || [];
  const byLoc = Object.fromEntries(planBlocks.map((b) => [`${b.track}_${b.section}`, b]));
  if (traj) {
    return traj.blocks.map((b) => {
      const pb = byLoc[b.block] || {};
      const start = b.actual_start ?? b.planned_start;
      const end = b.actual_end ?? b.planned_end;
      return {
        id: b.id,
        loc: b.block,
        dept: pb.dept_key,
        type: b.type,
        start,
        end,
        plannedStart: pb.start_time ?? b.planned_start,
        plannedEnd: pb.end_time ?? b.planned_end,
        shifted: b.actual_start != null && b.actual_start !== (pb.start_time ?? b.planned_start),
        neverStarted: b.actual_start == null,
      };
    });
  }
  return planBlocks.map((b, i) => ({
    id: i,
    loc: `${b.track}_${b.section}`,
    dept: b.dept_key,
    type: b.type,
    start: b.start_time,
    end: b.end_time,
    plannedStart: b.start_time,
    plannedEnd: b.end_time,
    shifted: false,
    neverStarted: false,
  }));
}

export function blockState(b, t) {
  if (b.neverStarted) return "pending";
  if (t < b.start) return "upcoming";
  if (t < b.end) return "active";
  return "done";
}

/** Train positions from the SUMO trajectory at (fractional) time t. */
export function simTrainsAt(traj, t, trainsMeta) {
  if (!traj) return [];
  const frames = traj.frames;
  const i = Math.max(0, Math.min(frames.length - 1, Math.floor(t)));
  const a = frames[i];
  const b = frames[Math.min(frames.length - 1, i + 1)];
  const f = t - Math.floor(t);
  const next = Object.fromEntries((b?.trains || []).map((tr) => [tr.id, tr]));
  return a.trains.map((tr) => {
    const nb = next[tr.id];
    const x = nb ? lerp(tr.x, nb.x, f) : tr.x;
    const y = nb ? lerp(tr.y, nb.y, f) : tr.y;
    const rad = (tr.angle * Math.PI) / 180; // SUMO: 0 = north, clockwise
    const num = trainNum(tr.id);
    const meta = trainsMeta?.[num - 1];
    const track = tr.edge.split("_")[0];
    const stopped = tr.speed < 1;
    return {
      key: tr.id,
      num,
      trainId: meta?.train_id ?? num,
      x,
      y,
      dx: Math.sin(rad),
      dy: Math.cos(rad),
      edge: tr.edge,
      speed: tr.speed,
      traction: TRACTION[tr.type]?.key || "?",
      status: stopped ? (PLATFORM_TRACKS.has(track) ? "station" : "held") : "running",
    };
  });
}

/** Timetable (planned) positions at slot t, shifted by forecast delay. */
export function plannedTrainsAt(trains, delays, sections, t) {
  const out = [];
  (trains || []).forEach((tr) => {
    const d = Number(delays?.[tr.train_id] ?? delays?.[String(tr.train_id)] ?? 0);
    const slot = Math.floor(t) - d;
    const loc = tr.schedule?.[slot] ?? tr.schedule?.[String(slot)];
    if (!loc || !sections[loc]) return;
    const p = pointAlong(sections[loc].shape, t - Math.floor(t));
    if (!p) return;
    out.push({
      key: `plan_${tr.train_id}`,
      num: tr.train_id,
      trainId: tr.train_id,
      x: p.x,
      y: p.y,
      dx: p.dx,
      dy: p.dy,
      edge: loc,
      speed: null,
      traction: tr.engine_type,
      status: "planned",
    });
  });
  return out;
}

/** Recent positions for a trail behind each simulated train. */
export function simTrails(traj, t, length = 25) {
  if (!traj) return {};
  const trails = {};
  const end = Math.min(traj.frames.length - 1, Math.floor(t));
  for (let i = Math.max(0, end - length); i <= end; i++) {
    traj.frames[i].trains.forEach((tr) => {
      (trails[tr.id] ||= []).push([tr.x, tr.y]);
    });
  }
  return trails;
}

export const STATUS_LABEL = {
  running: "Running",
  held: "Held at signal",
  station: "At station",
  planned: "Timetable",
};
