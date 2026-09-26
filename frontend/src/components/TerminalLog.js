"use client";

import { useEffect, useRef } from "react";

export default function TerminalLog({ logs, status }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const statusConfig = {
    ready: { dot: "bg-gov-text-muted", text: "Ready", bg: "" },
    running: { dot: "bg-gov-navy", text: "Solving...", bg: "animate-pulse" },
    success: { dot: "bg-gov-success", text: "Complete", bg: "" },
    error: { dot: "bg-gov-error", text: "Error", bg: "" },
  };

  const s = statusConfig[status] || statusConfig.ready;

  const typeColors = {
    sys: "text-gov-navy",
    info: "text-gov-text-secondary",
    success: "text-gov-success",
    error: "text-gov-error",
    agent: "text-gov-purple",
  };

  return (
    <div className="bg-white border border-gov-border rounded-lg shadow-sm">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gov-border-light flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-gov-navy-light flex items-center justify-center">
            <span className="material-symbols-outlined text-gov-navy text-base">
              terminal
            </span>
          </div>
          <h2 className="text-sm font-semibold text-gov-text">
            System Status & Optimizer Logs
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-gov-text-muted border border-gov-border rounded-full px-3 py-1">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.bg}`} />
          {s.text}
        </div>
      </div>

      {/* Log area */}
      <div
        ref={scrollRef}
        className="px-5 py-3 font-mono text-xs leading-relaxed h-48 overflow-y-auto bg-gov-bg-alt/50"
      >
        {logs.map((log, i) => (
          <div
            key={i}
            className={`py-0.5 ${typeColors[log.type] || "text-gov-text-secondary"}`}
            dangerouslySetInnerHTML={
              log.html ? { __html: log.html } : undefined
            }
          >
            {!log.html ? log.text : null}
          </div>
        ))}
      </div>
    </div>
  );
}
