import { ImportPanel } from "./import-panel";

export const dynamic = "force-dynamic";

/** Bulk upload of the company's existing workers and previous weeks' hours. */
export default function ImportPage() {
  return (
    <div data-page="admin-import" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Import from CSV</h1>
        <p className="muted mt-1 text-[#66545d]">Upload workers first, then their hours. Check a file to see every problem before anything is saved. An import saves all of its rows or none of them.</p>
      </div>
      <ImportPanel
        kind="workers"
        title="1. Workers"
        template="/templates/workers_template.csv"
        help={
          <>
            One row per worker. Only <code>first_name</code> and <code>last_name</code> are required. <code>engagement_type</code> is PAYE (or Employee), Sub-Contractor or Contractor. Separate several role or project codes with <code>;</code>; roles can also be allocated later. Leave{" "}
            <code>worker_id</code> empty to number workers automatically (W001…). A worker ID that already exists is skipped. Imported workers have no PIN: give app access from Users → Set PIN.
          </>
        }
      />
      <ImportPanel
        kind="hours"
        title="2. Working hours"
        template="/templates/hours_template.csv"
        help={
          <>
            One row per shift: worker ID, date (YYYY-MM-DD or DD/MM/YYYY), project ID, role code, start and end (HH:MM, Dublin time), unpaid break minutes and work done. An end at or before the start
            means the shift ended the next day. Weeks stay open so supervisors can review, submit and approve them as usual.
          </>
        }
      />
    </div>
  );
}
