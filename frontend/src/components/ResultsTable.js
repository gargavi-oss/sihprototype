"use client";

export default function ResultsTable({ results, onSimulate, onAlternate, simulating }) {
  return (
    <div className="bg-white border border-gov-border rounded-lg shadow-sm animate-in fade-in duration-300">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gov-border-light flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-gov-success-light flex items-center justify-center">
            <span className="material-symbols-outlined text-gov-success text-base">
              table_chart
            </span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gov-text">
              Optimal Schedule (X Matrix)
            </h2>
            <p className="text-xs text-gov-text-muted">
              Decoupled maintenance slots with zero conflict
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-gov-success bg-gov-success-light px-3 py-1 rounded">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          Solved: {results.length} Maintenance Windows
        </div>
      </div>

      {/* Table */}
      <div className="max-h-60 overflow-y-auto">
        <table>
          <thead>
            <tr>
              <th>Track</th>
              <th>Section</th>
              <th>Start Time (s)</th>
              <th>End Time (s)</th>
              <th>Duration (s)</th>
            </tr>
          </thead>
          <tbody>
            {results.length > 0 ? (
              results.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gov-amber" />
                      {r.track}
                    </span>
                  </td>
                  <td>{r.section}</td>
                  <td className="text-gov-navy font-medium">{r.start_time}s</td>
                  <td className="text-gov-navy font-medium">{r.end_time}s</td>
                  <td>{r.duration}s</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="text-center text-gov-text-muted py-8">
                  No maintenance blocks scheduled.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Action bar */}
      <div className="px-5 py-4 border-t border-gov-border-light flex flex-wrap gap-3">
        <button
          onClick={onSimulate}
          disabled={simulating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gov-success text-white text-sm font-medium rounded-md hover:bg-gov-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span
            className={`material-symbols-outlined text-base ${
              simulating ? "animate-spin-slow" : ""
            }`}
          >
            {simulating ? "sync" : "directions_subway"}
          </span>
          {simulating ? "Launching SUMO..." : "Launch SUMO Simulation"}
        </button>
        <button
          onClick={onAlternate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gov-navy text-sm font-medium rounded-md border border-gov-navy hover:bg-gov-navy-light transition-colors"
        >
          <span className="material-symbols-outlined text-base">compare_arrows</span>
          View Alternate Schedule →
        </button>
      </div>
    </div>
  );
}
