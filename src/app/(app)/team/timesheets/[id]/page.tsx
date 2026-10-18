import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { companyLookups, timesheetById } from "@/server/services/views";
import { AppError } from "@/server/errors";
import { fmtDateTime, toLocalInput, weekDays, weekLabel } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { BreakdownTable, EntriesList, HistoryPanel, WeekStats } from "@/components/timesheet-parts";
import { PageHeader, StatusBadge } from "@/components/ui";
import type { EntryRow } from "@/server/services/views";
import { addEntryAction, adminSubmitAction, approveAction, correctAction, reopenAction, returnAction, voidAction } from "../../actions";

export const dynamic = "force-dynamic";

type Lookups = Awaited<ReturnType<typeof companyLookups>>;

function AllocationFields({ lookups, projectId, jobRoleId }: { lookups: Lookups; projectId?: string; jobRoleId?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <label className="label">Project</label>
        <select name="projectId" className="input" defaultValue={projectId} required>
          <option value="">Choose…</option>
          {lookups.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
              {p.isActive ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Role</label>
        <select name="jobRoleId" className="input" defaultValue={jobRoleId} required>
          <option value="">Choose…</option>
          {lookups.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.isActive ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function WorkFields({ breakMinutes = 0, note }: { breakMinutes?: number; note?: string | null }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
      <div>
        <label className="label">Unpaid break (min)</label>
        <input name="breakMinutes" type="number" min={0} max={600} step={1} className="input" defaultValue={breakMinutes} />
      </div>
      <div>
        <label className="label">Work done (comment)</label>
        <input name="note" className="input" defaultValue={note ?? ""} placeholder="e.g. Kerb laying, Block C" />
      </div>
    </div>
  );
}

function EntryActions({ e, lookups }: { e: EntryRow; lookups: Lookups }) {
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer text-xs font-semibold text-blue-700 select-none">{e.status === "open" ? "Close / correct" : "Correct"}</summary>
      <div className="mt-2 w-full min-w-72 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <ActionForm action={correctAction} className="space-y-2">
          <input type="hidden" name="entryId" value={e.id} />
          <AllocationFields lookups={lookups} projectId={e.projectId} jobRoleId={e.jobRoleId} />
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">Start (Dublin time)</label>
              <input type="datetime-local" name="startAt" className="input" defaultValue={toLocalInput(e.startAt)} required />
            </div>
            <div>
              <label className="label">End (Dublin time)</label>
              <input type="datetime-local" name="endAt" className="input" defaultValue={toLocalInput(e.endAt)} required={e.status === "closed"} />
            </div>
          </div>
          <WorkFields breakMinutes={e.breakMinutes} note={e.note} />
          <input name="reason" className="input" placeholder="Reason (required)" required />
          <SubmitButton className="btn-primary btn-sm">Save correction</SubmitButton>
        </ActionForm>
        <ActionForm action={voidAction} className="flex flex-wrap gap-2 border-t border-slate-200 pt-3" confirm="Remove this entry from the timesheet? It stays in the history.">
          <input type="hidden" name="entryId" value={e.id} />
          <input name="reason" className="input flex-1" placeholder="Reason for removing (e.g. duplicate)" required />
          <SubmitButton className="btn-danger btn-sm">Remove entry</SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}

/** Persistent outcome of the last workflow step; forms unmount once the status changes. */
function StatusBanner({ data }: { data: Awaited<ReturnType<typeof timesheetById>> }) {
  const ts = data.timesheet!;
  const latest = data.versions[0];
  if (ts.status === "approved" && latest?.v.approvedAt) {
    return (
      <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
        Approved version {latest.v.versionNo}. It is now locked. Approved by {latest.approvedByName} on {fmtDateTime(latest.v.approvedAt)}.
      </p>
    );
  }
  if (ts.status === "returned") return <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Returned to the worker. Waiting for them to respond and resubmit.</p>;
  if (ts.status === "submitted" && latest?.v.cause === "reopened") {
    return <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Reopened as version {latest.v.versionNo}. It needs approval again before export. Reason: “{latest.v.causeReason}”</p>;
  }
  return null;
}

export default async function ReviewTimesheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const actor = await requireActor();
  let data;
  try {
    data = await timesheetById(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const ts = data.timesheet!;
  const lookups = await companyLookups(actor.companyId);
  const editable = data.canManage && ts.status !== "approved";
  const days = weekDays(ts.weekStart);

  return (
    <div className="space-y-4">
      <PageHeader
        title={data.worker.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {data.worker.workerCode} · {weekLabel(ts.weekStart)} <StatusBadge status={ts.status} /> <span className="text-xs">version {ts.currentVersion || "—"}</span>
          </span>
        }
        actions={<Link href="/team" className="btn-secondary">Back to queue</Link>}
      />
      {!data.canManage && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Read-only support access.</p>}
      <StatusBanner data={data} />

      <WeekStats data={data} />
      <BreakdownTable entries={data.entries} />

      <section className="card">
        <h2 className="h2 mb-3">Entries</h2>
        <EntriesList entries={data.entries} longShiftHours={data.settings.longShiftHours} renderActions={editable ? (e) => <EntryActions e={e} lookups={lookups} /> : undefined} />
        {editable && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-blue-700">+ Add a missing entry</summary>
            <ActionForm action={addEntryAction} className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" resetOnSuccess>
              <input type="hidden" name="workerId" value={ts.workerId} />
              <AllocationFields lookups={lookups} />
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="label">Start (Dublin time)</label>
                  <input type="datetime-local" name="startAt" className="input" min={`${days[0]}T00:00`} max={`${days[6]}T23:59`} defaultValue={`${days[0]}T07:00`} required />
                </div>
                <div>
                  <label className="label">End (Dublin time)</label>
                  <input type="datetime-local" name="endAt" className="input" defaultValue={`${days[0]}T15:00`} required />
                </div>
              </div>
              <WorkFields />
              <input name="reason" className="input" placeholder="Reason (required), e.g. phone had no signal" required />
              <SubmitButton className="btn-primary btn-sm">Add entry</SubmitButton>
            </ActionForm>
          </details>
        )}
      </section>

      {data.canManage && ts.status === "submitted" && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card space-y-3">
            <h2 className="h2">Approve version {ts.currentVersion}</h2>
            {data.blockers.length > 0 ? (
              <ul className="space-y-1 text-sm text-red-800">
                {data.blockers.map((b) => (
                  <li key={b.code}>⚠ {b.message}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Check hours, projects, roles and rates. Approval locks this version.</p>
            )}
            <ActionForm action={approveAction} confirm={`Approve version ${ts.currentVersion} for ${data.worker.name}?`}>
              <input type="hidden" name="timesheetId" value={ts.id} />
              <input type="hidden" name="versionNo" value={ts.currentVersion} />
              <SubmitButton className="btn w-full bg-emerald-600 text-white hover:bg-emerald-700">Approve</SubmitButton>
            </ActionForm>
          </div>
          <div className="card space-y-3">
            <h2 className="h2">Return for clarification</h2>
            <ActionForm action={returnAction} className="space-y-2">
              <input type="hidden" name="timesheetId" value={ts.id} />
              <input type="hidden" name="versionNo" value={ts.currentVersion} />
              <textarea name="comment" className="input min-h-20" placeholder="What does the worker need to clarify?" required />
              <SubmitButton className="btn-secondary w-full">Return to worker</SubmitButton>
            </ActionForm>
          </div>
        </section>
      )}

      {data.canManage && ts.status === "approved" && (
        <section className="card space-y-2">
          <h2 className="h2">Reopen approved timesheet</h2>
          <p className="muted">Creates a new version that must be approved again. A replacement export will show the new version number.</p>
          <ActionForm action={reopenAction} className="flex flex-col gap-2 sm:flex-row" confirm="Reopen this approved timesheet?">
            <input type="hidden" name="timesheetId" value={ts.id} />
            <input name="reason" className="input flex-1" placeholder="Reason (required)" required />
            <SubmitButton className="btn-secondary">Reopen</SubmitButton>
          </ActionForm>
        </section>
      )}

      {data.canManage && (ts.status === "draft" || ts.status === "returned") && data.weekEnded && ts.workerId !== actor.memberId && (
        <section className="card space-y-2">
          <h2 className="h2">Submit on worker&apos;s behalf</h2>
          <ActionForm action={adminSubmitAction} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="timesheetId" value={ts.id} />
            <input name="reason" className="input flex-1" placeholder="Reason (required)" defaultValue={data.worker.hasPin ? "" : "Hours recorded by supervisor"} required />
            <SubmitButton className="btn-secondary">Submit</SubmitButton>
          </ActionForm>
        </section>
      )}

      <HistoryPanel data={data} />
    </div>
  );
}
