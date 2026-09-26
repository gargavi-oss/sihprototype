export default function MetricsRow({ metrics }) {
  const defaultMetrics = [
    {
      label: "Total Delay Reduction",
      value: "−48.5%",
      sub: "(−124 mins)",
      color: "text-gov-success",
      subColor: "text-gov-success/70",
    },
    {
      label: "Trains Rerouted",
      value: "3 / 9",
      sub: "Express & Freight",
      color: "text-gov-text",
      subColor: "text-gov-text-muted",
    },
    {
      label: "Blocks Optimized",
      value: "4",
      sub: "Conflict-Free",
      color: "text-gov-navy",
      subColor: "text-gov-text-muted",
    },
    {
      label: "Network Throughput",
      value: "97.8%",
      sub: "(+8.4%)",
      color: "text-gov-purple",
      subColor: "text-gov-success/70",
    },
  ];

  const items = metrics || defaultMetrics;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {items.map((m, i) => (
        <div
          key={i}
          className="bg-white border border-gov-border rounded-lg p-4 shadow-sm"
        >
          <div className="text-[11px] font-semibold text-gov-text-muted uppercase tracking-wide">
            {m.label}
          </div>
          <div className={`text-2xl font-bold mt-1 flex items-baseline gap-2 ${m.color}`}>
            {m.value}
            <span className={`text-xs font-normal ${m.subColor}`}>{m.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
