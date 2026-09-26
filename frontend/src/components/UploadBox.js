"use client";

import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Button, Notice, cx } from "@/components/ui";
import { templateUrl } from "@/lib/api";

/**
 * CSV drop zone. `onUpload(file)` must return a promise resolving to a
 * success message; errors are shown inline.
 */
export default function UploadBox({ columns, template, onUpload, onSample, compact }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const pick = (f) => {
    if (!f) return;
    setMsg(null);
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setMsg({ tone: "bad", text: "Only .csv files are accepted." });
      return;
    }
    setFile(f);
  };

  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      setMsg({ tone: "ok", text });
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (e) {
      setMsg({ tone: "bad", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={cx(
          "rounded-md border border-dashed px-4 text-center cursor-pointer transition-colors",
          compact ? "py-5" : "py-8",
          drag ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-sunken"
        )}
      >
        <FileUp className="size-5 mx-auto text-ink-3" strokeWidth={1.5} aria-hidden />
        {file ? (
          <div className="mt-2">
            <div className="font-medium">{file.name}</div>
            <div className="text-[12px] text-ink-3">{(file.size / 1024).toFixed(1)} KB · ready to submit</div>
          </div>
        ) : (
          <div className="mt-2 text-[14px]">
            Drop a CSV here or <span className="text-accent font-medium">browse</span>
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {columns && (
        <div className="mt-3 text-[12px] text-ink-3">
          Columns: <span className="font-mono text-ink-2">{columns}</span>
        </div>
      )}

      {msg && (
        <Notice tone={msg.tone} className="mt-3">
          {msg.text}
        </Notice>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={!file} loading={busy} onClick={() => run(() => onUpload(file))}>
          Submit file
        </Button>
        {onSample && (
          <Button variant="ghost" disabled={busy} onClick={() => run(onSample)}>
            Use sample data
          </Button>
        )}
        {template && (
          <a
            href={templateUrl(template)}
            className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"
          >
            <Download className="size-3.5" aria-hidden />
            Template
          </a>
        )}
      </div>
    </div>
  );
}
