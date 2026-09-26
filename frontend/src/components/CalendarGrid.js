"use client";

import React, { useState, useMemo } from "react";

// ========================================
// DEMO DATA (mirrors actual demo_data CSVs)
// ========================================
const TIME_START = 0;
const TIME_END = 80;
const TIME_STEP = 5;

// Train color palette — using institutional colors
const TRAIN_COLORS = {
  1: "#003580", 2: "#0284C7", 3: "#7C3AED", 4: "#D97706",
  5: "#15803D", 6: "#DC2626", 7: "#B45309", 8: "#0369A1", 9: "#6D28D9",
};

export default function CalendarGrid({
  tracks = [],
  maintenanceBlocks = [],
  trains = [],
  conflicts = [],
  reroutes = []
}) {
  const [showOriginal, setShowOriginal] = useState(true);
  const [showRerouted, setShowRerouted] = useState(true);
  const [showConflicts, setShowConflicts] = useState(true);

  const numRows = (TIME_END - TIME_START) / TIME_STEP;

  const rows = useMemo(() => {
    const result = [];
    for (let row = 0; row < numRows; row++) {
      const tStart = TIME_START + row * TIME_STEP;
      const tEnd = tStart + TIME_STEP;
      result.push({ tStart, tEnd, label: `t${tStart} – t${tEnd}` });
    }
    return result;
  }, [numRows]);

  const getCellContent = (track, tStart, tEnd) => {
    const elements = [];

    // Maintenance blocks
    maintenanceBlocks.forEach((block, bi) => {
      if (block.track === track.id) {
        const blockEnd = block.startTime + block.duration;
        if (block.startTime < tEnd && blockEnd > tStart) {
          const overlapStart = Math.max(block.startTime, tStart);
          const overlapEnd = Math.min(blockEnd, tEnd);
          const topPct = ((overlapStart - tStart) / TIME_STEP) * 100;
          const heightPct = ((overlapEnd - overlapStart) / TIME_STEP) * 100;
          elements.push(
            <div
              key={`m-${bi}`}
              className="absolute left-0.5 right-0.5 rounded text-[9px] font-semibold flex items-center justify-center gap-0.5 text-gov-amber border border-gov-amber/50 overflow-hidden whitespace-nowrap px-1"
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                background: "repeating-linear-gradient(45deg, rgba(217,119,6,0.1), rgba(217,119,6,0.1) 3px, rgba(217,119,6,0.25) 3px, rgba(217,119,6,0.25) 6px)",
              }}
              title={`${block.dept}: ${block.track} ${block.section} (t${block.startTime}–t${blockEnd})`}
            >
              <span className="material-symbols-outlined text-[10px]">build</span>
              {block.section}
            </div>
          );
        }
      }
    });

    // Original train routes
    if (showOriginal) {
      trains.forEach((train) => {
        const times = train.trackTimes[track.id];
        if (times) {
          const [trainStart, trainEnd] = times;
          if (trainStart < tEnd && trainEnd > tStart) {
            const overlapStart = Math.max(trainStart, tStart);
            const topPct = ((overlapStart - tStart) / TIME_STEP) * 100 + 5;
            const color = TRAIN_COLORS[train.id] || "#003580";

            elements.push(
              <div
                key={`t-${train.id}`}
                className="absolute left-1 right-1 h-2 rounded-full z-10"
                style={{
                  top: `${topPct}%`,
                  background: `${color}88`,
                  border: `1px solid ${color}BB`,
                }}
                title={`${train.name} (${train.engine}) t${trainStart}–t${trainEnd}`}
              />
            );
          }
        }
      });
    }

    // Rerouted bars
    if (showRerouted) {
      reroutes.forEach((reroute) => {
        const altTimes = reroute.altTrackTimes[track.id];
        if (altTimes) {
          const [altStart, altEnd] = altTimes;
          if (altStart < tEnd && altEnd > tStart) {
            const overlapStart = Math.max(altStart, tStart);
            const topPct = ((overlapStart - tStart) / TIME_STEP) * 100 + 55;

            elements.push(
              <div
                key={`r-${reroute.trainId}`}
                className="absolute left-1 right-1 h-2 rounded-full z-10 bg-gov-success/50 border border-gov-success/70"
                style={{ top: `${topPct}%` }}
                title={`✅ Rerouted Train #${reroute.trainId} t${altStart}–t${altEnd}`}
              />
            );
          }
        }
      });
    }

    // Conflict markers
    if (showConflicts) {
      conflicts.forEach((conflict) => {
        const train = trains.find((t) => t.id === conflict.trainId);
        if (train && conflict.track === track.id) {
          if (conflict.conflictStart < tEnd && conflict.conflictEnd > tStart) {
            elements.push(
              <div
                key={`c-${conflict.trainId}`}
                className="absolute inset-0 border-2 border-gov-error/50 rounded bg-gov-error/5 z-0 animate-pulse"
                title={`⚠ Conflict: Train #${conflict.trainId} × Maintenance`}
              />
            );
          }
        }
      });
    }

    return elements;
  };

  return (
    <div className="bg-white border border-gov-border rounded-lg shadow-sm mb-6">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gov-border-light flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-gov-amber text-lg">
            calendar_month
          </span>
          <h2 className="text-sm font-semibold text-gov-text">
            Track Timeline Matrix (t0 → t80)
          </h2>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-gov-text-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded-sm border border-gov-amber/50"
              style={{ background: "repeating-linear-gradient(45deg, rgba(217,119,6,0.15), rgba(217,119,6,0.15) 2px, rgba(217,119,6,0.35) 2px, rgba(217,119,6,0.35) 4px)" }}
            />
            Maintenance
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded-full bg-gov-navy/50 border border-gov-navy/60" />
            Original
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded-full bg-gov-success/50 border border-gov-success/60" />
            Rerouted
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded-sm border-2 border-gov-error/50 bg-gov-error/5" />
            Conflict
          </div>
        </div>

        {/* Toggle buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
              showOriginal
                ? "border-gov-navy bg-gov-navy-light text-gov-navy"
                : "border-gov-border text-gov-text-muted hover:bg-gov-bg"
            }`}
          >
            Original Routes
          </button>
          <button
            onClick={() => setShowRerouted(!showRerouted)}
            className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
              showRerouted
                ? "border-gov-success bg-gov-success-light text-gov-success"
                : "border-gov-border text-gov-text-muted hover:bg-gov-bg"
            }`}
          >
            Alternate Routes
          </button>
          <button
            onClick={() => setShowConflicts(!showConflicts)}
            className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
              showConflicts
                ? "border-gov-error bg-gov-error-light text-gov-error"
                : "border-gov-border text-gov-text-muted hover:bg-gov-bg"
            }`}
          >
            Conflicts
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div
          className="min-w-[900px]"
          style={{
            display: "grid",
            gridTemplateColumns: `80px repeat(${tracks.length}, 1fr)`,
          }}
        >
          {/* Header row */}
          <div className="p-2 text-center text-[10px] font-bold uppercase tracking-wide text-gov-text-muted bg-gov-bg-alt border-b-2 border-r border-gov-border">
            Time
          </div>
          {tracks.map((t) => (
            <div
              key={t.id}
              className="p-2 text-center border-b-2 border-r border-gov-border bg-gov-bg-alt"
            >
              <div className="text-xs font-bold text-gov-text">{t.name}</div>
              <div className="text-[10px] text-gov-text-muted font-mono">{t.sub}</div>
            </div>
          ))}

          {/* Data rows */}
          {rows.map((row, ri) => (
            <React.Fragment key={`row-${ri}`}>
              <div
                className="p-2 text-right text-[10px] font-mono font-medium text-gov-text-muted border-b border-r border-gov-border-light bg-gov-bg/50 flex items-center justify-end whitespace-nowrap"
              >
                {row.label}
              </div>
              {tracks.map((track, ci) => (
                <div
                  key={`cell-${ri}-${ci}`}
                  className="relative border-b border-r border-gov-border-light min-h-[2rem] hover:bg-gov-navy-light/30 transition-colors"
                  style={{ padding: "2px" }}
                >
                  {getCellContent(track, row.tStart, row.tEnd)}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
