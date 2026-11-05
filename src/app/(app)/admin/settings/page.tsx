import { requireActor } from "@/server/auth/session";
import { settingsFor } from "@/server/services/views";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { settingsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await requireActor();
  const s = await settingsFor(actor.companyId);
  return (
    <div data-page="admin-settings" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Settings</h1>
      </div>
      <section className="max-w-xl rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
        <ActionForm action={settingsAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="long-shift-hours">Flag shifts longer than (hours)</label>
            <input id="long-shift-hours" name="longShiftHours" type="number" step="0.5" min={1} max={48} className="input" defaultValue={s.longShiftHours} required />
            <p className="mt-1 text-xs text-[#66545d]">Long or still-open shifts are flagged for the manager. Hours are never cut automatically.</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="managerExportEnabled" defaultChecked={s.managerExportEnabled} className="mt-0.5 size-4 shrink-0 accent-[#a4834e]" />
            <span>
              Managers can download CSV exports
              <span className="block text-xs text-[#66545d]">Exports only ever include the manager&apos;s assigned workers.</span>
            </span>
          </label>
          <SubmitButton className="btn-brand bg-[#b38323]! text-white hover:bg-[#9a701c]! focus-visible:outline-[#92754e]">Save settings</SubmitButton>
        </ActionForm>
      </section>
      <section className="max-w-xl rounded-[18px] border border-[#ded5c9] bg-white p-4 text-sm text-[#66545d] sm:p-5">
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
