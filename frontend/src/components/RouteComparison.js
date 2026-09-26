export default function RouteComparison({ reroutes = [] }) {
  const engineLabel = (e) =>
    e === "D" ? "DSL" : e === "H" ? "HYB" : "ELC";
  const engineFull = (e) =>
    e === "D" ? "Diesel" : e === "H" ? "Hybrid" : "Electric";
  const engineStyle = (e) => {
    if (e === "D") return "bg-gov-amber-light border-gov-amber/30 text-gov-amber";
    if (e === "H") return "bg-purple-50 border-gov-purple/30 text-gov-purple";
    return "bg-sky-50 border-gov-sky/30 text-gov-sky";
  };

  return (
    <div className="bg-white border border-gov-border rounded-lg shadow-sm mb-6">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gov-border-light flex items-center gap-2">
        <span className="material-symbols-outlined text-gov-navy text-lg">
          swap_horiz
        </span>
        <h2 className="text-sm font-semibold text-gov-text">
          Critical Rerouting Schedule Diff
        </h2>
      </div>

      {/* Cards */}
      <div className="p-5 space-y-4">
        {reroutes.map((reroute) => (
          <div
            key={reroute.trainId}
            className="border border-gov-border-light rounded-lg p-4"
          >
            {/* Card header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-md flex items-center justify-center text-[11px] font-bold border ${engineStyle(reroute.engine)}`}
                >
                  {engineLabel(reroute.engine)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gov-text flex items-center gap-2">
                    {reroute.name}
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gov-success-light border border-gov-success/30 text-gov-success">
                      Conflict Cleared
                    </span>
                  </h3>
                  <p className="text-xs text-gov-text-muted">
                    Engine: {engineFull(reroute.engine)} · Category{" "}
                    {reroute.category}
                  </p>
                </div>
              </div>
              <div className="text-xs font-semibold font-mono text-gov-success">
                {reroute.impact}
              </div>
            </div>

            {/* Route diff grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-md bg-gov-bg border border-gov-border-light">
                <div className="text-[10px] font-bold uppercase text-gov-error mb-1">
                  Original Route
                </div>
                <div className="text-sm text-gov-text mb-1">
                  {reroute.originalDesc}
                </div>
                <div className="text-xs text-gov-error/70">
                  {reroute.originalConflict}
                </div>
              </div>
              <div className="p-3 rounded-md bg-gov-navy-light/50 border border-gov-navy/20">
                <div className="text-[10px] font-bold uppercase text-gov-navy mb-1">
                  AI-Optimized Route
                </div>
                <div className="text-sm text-gov-text mb-1">
                  {reroute.newDesc}
                </div>
                <div className="text-xs text-gov-success">
                  {reroute.newDetail}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
