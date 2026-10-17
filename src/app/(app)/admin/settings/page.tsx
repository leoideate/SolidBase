import { requireActor } from "@/server/auth/session";
import { settingsFor } from "@/server/services/views";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { settingsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await requireActor();
  const s = await settingsFor(actor.companyId);
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <section className="card max-w-xl">
        <ActionForm action={settingsAction} className="space-y-4">
          <div>
            <label className="label">Flag shifts longer than (hours)</label>
            <input name="longShiftHours" type="number" step="0.5" min={1} max={48} className="input" defaultValue={s.longShiftHours} required />
            <p className="mt-1 text-xs text-slate-500">Long or still-open shifts are flagged for the manager. Hours are never cut automatically.</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="managerExportEnabled" defaultChecked={s.managerExportEnabled} className="mt-0.5 size-4" />
            <span>
              Managers can download CSV exports
              <span className="block text-xs text-slate-500">Exports only ever include the manager&apos;s assigned workers.</span>
            </span>
          </label>
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm>
      </section>
      <section className="card max-w-xl text-sm text-slate-600">
        <h2 className="h2 mb-2">Fixed for this release</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Week: Monday to Sunday, Europe/Dublin time. Shifts crossing Monday 00:00 are split.</li>
          <li>Currency: EUR. Values are hours × agreed rate before deductions, rounded per entry to the cent.</li>
          <li>Unpaid breaks: workers clock out and back in.</li>
          <li>Online only: no offline clocking, GPS or photos.</li>
        </ul>
      </section>
    </div>
  );
}
