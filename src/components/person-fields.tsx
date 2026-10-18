import { ENGAGEMENT_LABEL } from "@/lib/labels";

type Person = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  mobile?: string | null;
  address?: string | null;
  engagementType?: string | null;
};

/**
 * Worker details from the client's "Adding Workers" sheet. Records created before name parts
 * existed fall back to splitting the display name. Bank details are not collected.
 */
export function PersonFields({ p, workerCode, autoCode = true }: { p?: Person; workerCode?: string; autoCode?: boolean }) {
  const parts = p?.displayName?.trim().split(/\s+/) ?? [];
  const first = p?.firstName ?? (p?.lastName ? "" : parts[0] ?? "");
  const last = p?.lastName ?? (p?.firstName ? "" : parts.slice(1).join(" "));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="label">Worker ID</label>
        <input name="workerCode" className="input" defaultValue={workerCode} placeholder={autoCode ? "Automatic (W001, W002…)" : undefined} required={!autoCode} />
      </div>
      <div>
        <label className="label">Engagement type</label>
        <select name="engagementType" className="input" defaultValue={p?.engagementType ?? ""}>
          <option value="">Choose…</option>
          {Object.entries(ENGAGEMENT_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div className="hidden lg:block" />
      <div>
        <label className="label">First name</label>
        <input name="firstName" className="input" defaultValue={first} required />
      </div>
      <div>
        <label className="label">Middle name</label>
        <input name="middleName" className="input" defaultValue={p?.middleName ?? ""} />
      </div>
      <div>
        <label className="label">Last name</label>
        <input name="lastName" className="input" defaultValue={last} required />
      </div>
      <div>
        <label className="label">Email</label>
        <input type="email" name="email" className="input" defaultValue={p?.email ?? ""} autoCapitalize="none" />
      </div>
      <div>
        <label className="label">Mobile number</label>
        <input type="tel" name="mobile" className="input" defaultValue={p?.mobile ?? ""} placeholder="+353 …" />
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="label">Address</label>
        <input name="address" className="input" defaultValue={p?.address ?? ""} />
      </div>
    </div>
  );
}
