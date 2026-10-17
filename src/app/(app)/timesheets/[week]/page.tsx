import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { workerWeek } from "@/server/services/views";
import { addWeekToDate, isWeekStart, weekLabel, weekStartOf, fmtDate, localDate, fmtTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { BreakdownTable, EntriesList, HistoryPanel, WeekStats } from "@/components/timesheet-parts";
import { PageHeader, StatusBadge, WeekNav } from "@/components/ui";
import { commentAction, submitAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function WorkerWeekPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  if (!isWeekStart(week)) notFound();
  const actor = await requireActor();
  if (!actor.isWorker) redirect("/");
  const data = await workerWeek(actor, actor.memberId, week);
  const current = weekStartOf(new Date());
  const ts = data.timesheet;
  const canSubmit = ts && (ts.status === "draft" || ts.status === "returned") && data.weekEnded;
  const lastReturn = [...data.comments].reverse().find((c) => c.c.kind === "return");

  return (
    <div className="space-y-4">
      <PageHeader
        title="My week"
        subtitle={<span className="flex items-center gap-2">{weekLabel(week)} {ts && <StatusBadge status={ts.status} />}</span>}
        actions={<WeekNav base="/timesheets/" week={week} prev={addWeekToDate(week, -1)} next={week < current ? addWeekToDate(week, 1) : null} label={week === current ? "This week" : weekLabel(week)} />}
      />

      {ts?.status === "returned" && lastReturn && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">Returned by {lastReturn.author} for clarification</div>
          <p className="mt-1 whitespace-pre-wrap">{lastReturn.c.body}</p>
          <p className="mt-2 text-xs">Reply below or ask for a correction, then resubmit.</p>
        </div>
      )}

      {ts?.status === "submitted" && (
        <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
          Submitted (version {ts.currentVersion}). Your manager will review it.
        </p>
      )}
      {ts?.status === "approved" && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Approved (version {ts.approvedVersion}). These hours are locked.</p>
      )}

      <WeekStats data={data} />
      <BreakdownTable entries={data.entries} />

      <section className="card">
        <h2 className="h2 mb-3">Entries</h2>
        <EntriesList entries={data.entries} longShiftHours={data.settings.longShiftHours} />
      </section>

      {ts && (ts.status === "draft" || ts.status === "returned") && (
        <section className="card space-y-3">
          <h2 className="h2">{ts.status === "returned" ? "Resubmit timesheet" : "Submit timesheet"}</h2>
          {canSubmit ? (
            <ActionForm action={submitAction} className="space-y-3" confirm="Submit this week's timesheet? You will not be able to change entries yourself after submitting.">
              <input type="hidden" name="timesheetId" value={ts.id} />
              <textarea name="comment" className="input min-h-20" placeholder="Optional note for your manager" />
              <SubmitButton className="btn-brand w-full sm:w-auto">{ts.status === "returned" ? "Resubmit" : "Submit for approval"}</SubmitButton>
            </ActionForm>
          ) : (
            <p className="muted">You can submit once the week has ended (from Monday 00:00).</p>
          )}
        </section>
      )}

      {ts && ts.status !== "approved" && data.entries.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-1">Something wrong?</h2>
          <p className="muted mb-3">You can&apos;t edit entries yourself. Tell your manager what needs correcting.</p>
          <ActionForm action={commentAction} className="space-y-3" resetOnSuccess>
            <input type="hidden" name="timesheetId" value={ts.id} />
            <select name="entryId" className="input">
              <option value="">General message</option>
              {data.entries.map((e) => (
                <option key={e.id} value={e.id}>
                  Correction for {fmtDate(localDate(e.startAt))} {fmtTime(e.startAt)}–{e.endAt ? fmtTime(e.endAt) : "open"} · {e.projectCode} {e.roleName}
                </option>
              ))}
            </select>
            <textarea name="body" className="input min-h-20" required placeholder="e.g. I was on P002, not P001, on Tuesday" />
            <SubmitButton className="btn-secondary">Send to manager</SubmitButton>
          </ActionForm>
        </section>
      )}

      <HistoryPanel data={data} />
    </div>
  );
}
