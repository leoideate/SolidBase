"use client";

import { useState, useTransition } from "react";
import type { ImportKind } from "@/server/services/imports";
import { importCsvAction } from "./actions";
import type { ImportResult } from "./actions";

const ROW_STYLE = { ok: "", skip: "text-slate-500", error: "bg-red-50 text-red-800" } as const;
const ROW_LABEL = { ok: "Ready", skip: "Skipped", error: "Error" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Choose a CSV, check it (nothing saved), then import it once every row is valid. */
export function ImportPanel({ kind, title, help, template }: { kind: ImportKind; title: string; help: React.ReactNode; template: string }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, start] = useTransition();
  const report = result?.report;

  const send = (commit: boolean) =>
    start(async () => {
      if (!csv) return;
      const r = await importCsvAction(kind, csv, commit);
      setResult(r);
      setChecked(!commit && !!r.report);
      if (r.report?.committed) setCsv(null);
    });

  const canImport = checked && !!report && !report.committed && report.errors === 0 && report.ok > 0;
  const rows = report ? [...report.rows].sort((a, b) => Number(b.status === "error") - Number(a.status === "error") || a.line - b.line) : [];

  let summary = "";
  if (report?.committed) summary = `Imported ${plural(report.ok, "row")}${report.skipped ? `, skipped ${report.skipped}` : ""}.`;
  else if (report?.errors) summary = `${plural(report.errors, "row has", "rows have")} errors. Fix them in the file and check it again. Nothing was saved.`;
  else if (report) summary = `All rows are valid: ${report.ok} to import${report.skipped ? `, ${report.skipped} skipped` : ""}. Nothing is saved until you press Import.`;

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="h2">{title}</h2>
        <div className="muted mt-1">{help}</div>
        <a className="mt-1 inline-block text-sm text-brand-700 underline" href={template} download>
          Download the template
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-secondary cursor-pointer">
          Choose CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            data-testid={`${kind}-file`}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              setResult(null);
              setChecked(false);
              if (!f) return;
              setFileName(f.name);
              setCsv(await f.text());
            }}
          />
        </label>
        {fileName && csv && <span className="text-sm">{fileName}</span>}
        <button type="button" className="btn-secondary" disabled={!csv || pending} onClick={() => send(false)}>
          {pending && !checked ? "Checking…" : "Check file"}
        </button>
        <button type="button" className="btn-primary" disabled={!canImport || pending} onClick={() => send(true)}>
          {pending && checked ? "Importing…" : canImport ? `Import ${plural(report.ok, "row")}` : "Import"}
        </button>
      </div>

      {result?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      )}
      {report && (
        <>
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${report.errors ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
            {summary}
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">Line</th>
                  <th>Row</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={ROW_STYLE[r.status]}>
                    <td className="num">{r.line}</td>
                    <td className="whitespace-nowrap">{r.label}</td>
                    <td>{report.committed && r.status === "ok" ? "Imported" : ROW_LABEL[r.status]}</td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
