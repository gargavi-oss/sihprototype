"use client";

import { useRef } from "react";

const FILE_CONFIG = [
  {
    key: "tdms",
    label: "TDMS (Power Blocks)",
    dept: "Traction Distribution",
    desc: "Overhead traction power window constraints",
    icon: "bolt",
    color: "text-gov-amber",
    bgColor: "bg-gov-amber-light",
  },
  {
    key: "smms",
    label: "SMMS (Traffic Blocks)",
    dept: "Station Management",
    desc: "Station master slot possession requests",
    icon: "traffic",
    color: "text-gov-error",
    bgColor: "bg-gov-error-light",
  },
  {
    key: "tds",
    label: "TDS (Safety Blocks)",
    dept: "Train Dispatching",
    desc: "Section dispatching interlock safety limits",
    icon: "alt_route",
    color: "text-gov-navy",
    bgColor: "bg-gov-navy-light",
  },
  {
    key: "schedule",
    label: "Timetable (Y Matrix)",
    dept: "Schedule Graph",
    desc: "Master passenger & freight timetable graph",
    icon: "schedule",
    color: "text-gov-purple",
    bgColor: "bg-purple-50",
  },
  {
    key: "delay",
    label: "Delay Info (d Vector)",
    dept: "Stochastic Data",
    desc: "Historical disruption stochastic delay vector",
    icon: "timer",
    color: "text-gov-success",
    bgColor: "bg-gov-success-light",
  },
];

export default function FileUploadCard({ files, onFileChange }) {
  const inputRefs = useRef({});

  const fileCount = Object.values(files).filter(Boolean).length;

  const handleDrop = (e, key) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-gov-navy", "bg-gov-navy-light");
    if (e.dataTransfer.files.length) {
      onFileChange(key, e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("border-gov-navy", "bg-gov-navy-light");
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove("border-gov-navy", "bg-gov-navy-light");
  };

  // Split into two groups: department inputs and schedule inputs
  const deptFiles = FILE_CONFIG.slice(0, 3);
  const scheduleFiles = FILE_CONFIG.slice(3);

  const renderFileRow = (config) => {
    const hasFile = !!files[config.key];
    return (
      <div
        key={config.key}
        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all duration-150 ${
          hasFile
            ? "border-gov-success bg-gov-success-light/50"
            : "border-gov-border-light hover:border-gov-navy hover:bg-gov-navy-light/50"
        }`}
        onClick={() => inputRefs.current[config.key]?.click()}
        onDrop={(e) => handleDrop(e, config.key)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center ${config.bgColor}`}
          >
            <span className={`material-symbols-outlined text-base ${config.color}`}>
              {config.icon}
            </span>
          </div>
          <div>
            <div className="text-sm font-medium text-gov-text">
              {config.label}
              <span className="ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-gov-bg-alt text-gov-text-muted">
                {config.dept}
              </span>
            </div>
            <div className="text-xs text-gov-text-muted">{config.desc}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs whitespace-nowrap">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hasFile ? "bg-gov-success" : "bg-gov-text-muted"
            }`}
          />
          <span
            className={
              hasFile
                ? "text-gov-success font-medium max-w-[120px] truncate"
                : "text-gov-text-muted"
            }
          >
            {hasFile ? files[config.key].name : "No file selected"}
          </span>
        </div>

        <input
          ref={(el) => (inputRefs.current[config.key] = el)}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files.length) {
              onFileChange(config.key, e.target.files[0]);
            }
          }}
        />
      </div>
    );
  };

  return (
    <div className="bg-white border border-gov-border rounded-lg shadow-sm">
      {/* Card Header */}
      <div className="px-5 py-4 border-b border-gov-border-light flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-gov-navy-light flex items-center justify-center">
            <span className="material-symbols-outlined text-gov-navy text-base">
              upload_file
            </span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gov-text">
              Department Inputs
            </h2>
            <p className="text-xs text-gov-text-muted">
              Upload subsystem constraint & schedule files
            </p>
          </div>
        </div>
        <div className="text-xs text-gov-text-muted">
          <span
            className={`font-bold text-base ${
              fileCount >= 5 ? "text-gov-success" : "text-gov-navy"
            }`}
          >
            {fileCount}
          </span>{" "}
          / 5 Required
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 space-y-2">
        {deptFiles.map(renderFileRow)}

        {/* Section divider */}
        <div className="flex items-center gap-3 py-3">
          <div className="flex-1 border-t border-gov-border-light" />
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gov-text-muted uppercase tracking-wide">
            <span className="material-symbols-outlined text-sm">timeline</span>
            Train Schedule & Delays
          </div>
          <div className="flex-1 border-t border-gov-border-light" />
        </div>

        {scheduleFiles.map(renderFileRow)}
      </div>
    </div>
  );
}
