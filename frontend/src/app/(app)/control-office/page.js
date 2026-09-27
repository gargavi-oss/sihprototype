"use client";

import { useAuth } from "@/components/AuthProvider";
import UploadBox from "@/components/UploadBox";
import { Button, Card, Empty, Notice, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ENGINE, fmtDateTime } from "@/lib/format";

export default function ControlOfficePage() {
  const { user } = useAuth();
  const canEdit = user?.role === "coa";
  const { data, error, reload: load } = useApi("/coa/data");

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <Spinner />;

  const delays = Object.fromEntries(data.delay.rows.map((d) => [d.train_id, d.delay]));
  const trains = data.timetable.rows;

  const panel = (kind, title, desc, columns, template) => {
    const d = data[kind];
    return (
      <Card title={title} description={desc}>
        {canEdit ? (
          <UploadBox
            compact
            columns={columns}
            template={template}
            onUpload={async (file) => {
              const r = await api.upload(`/coa/upload/${kind}`, file);
              await load();
              return `${r.rows} ${kind === "timetable" ? "trains" : "delay entries"} saved to the Control Office database.`;
            }}
            onSample={async () => {
              const r = await api.post(`/coa/sample/${kind}`);
              await load();
              return `Sample file loaded (${r.rows} rows).`;
            }}
          />
        ) : null}
        <div className={canEdit ? "mt-5 pt-4 border-t border-line text-[13px]" : "text-[13px]"}>
          {d.active ? (
            <div className="flex items-center justify-between">
              <span className="text-ink-2">
                Current: <span className="text-ink">{d.active.filename}</span> · {d.active.row_count} rows ·{" "}
                {fmtDateTime(d.active.uploaded_at)} by {d.active.uploaded_by}
              </span>
              {canEdit && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (!confirm(`Withdraw the current ${kind} submission?`)) return;
                    await api.post(`/coa/withdraw/${kind}`);
                    load();
                  }}
                >
                  Withdraw
                </Button>
              )}
            </div>
          ) : (
            <span className="text-ink-3">Nothing uploaded yet.</span>
          )}
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="COA · Control Office Application"
        title="Timetable & delay forecast"
        description="Train paths through the section and expected delays. The optimiser uses these to find block windows that disturb the fewest trains."
      />

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        {panel(
          "timetable",
          "Working timetable",
          "Passenger and goods paths — one row per train, section occupied at each slot t0–t119.",
          "train_id, engine_type (D/E/H), category (1/2), t0 … t119",
          "timetable"
        )}
        {panel(
          "delay",
          "Delay forecast",
          "Expected delay per train, in slots. Shifts the train's path when checking block impact.",
          "train_id, delay",
          "delay"
        )}
      </div>

      <Card className="mt-5" title="Trains in the planning window" description={`${trains.length} trains`} flush>
        {trains.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="pl-5">Train</th>
                  <th>Traction</th>
                  <th>Category</th>
                  <th>Route (tracks)</th>
                  <th className="text-right">Path</th>
                  <th className="text-right pr-5">Forecast delay</th>
                </tr>
              </thead>
              <tbody>
                {trains.map((t) => (
                  <tr key={t.id}>
                    <td className="pl-5 font-medium tnum">#{t.train_id}</td>
                    <td>{ENGINE[t.engine_type]}</td>
                    <td>Category {t.category}</td>
                    <td className="font-mono text-[12px] text-ink-2 max-w-[360px] truncate" title={t.route}>
                      {t.route}
                    </td>
                    <td className="text-right text-ink-2">
                      slot {t.first_slot}–{t.last_slot}
                    </td>
                    <td className="text-right pr-5">
                      {delays[t.train_id] == null ? (
                        <span className="text-ink-3">—</span>
                      ) : delays[t.train_id] === 0 ? (
                        <span className="text-ink-3">On time</span>
                      ) : (
                        <span className="text-warn">+{delays[t.train_id]} slots</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No timetable yet">Upload the working timetable to see trains here.</Empty>
        )}
      </Card>
    </>
  );
}
