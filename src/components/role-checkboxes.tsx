export function RoleCheckboxes({ d }: { d?: { isWorker: boolean; isManager: boolean; isAdmin: boolean; isIt: boolean } }) {
  const items = [
    ["isWorker", "Worker / operator", d?.isWorker ?? true],
    ["isManager", "Supervisor / manager", d?.isManager ?? false],
    ["isAdmin", "Business administrator", d?.isAdmin ?? false],
    ["isIt", "IT / technical support", d?.isIt ?? false],
  ] as const;
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="label">Access roles</legend>
      {items.map(([name, label, checked]) => (
        <label key={name} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <input type="checkbox" name={name} defaultChecked={checked} className="size-4" /> {label}
        </label>
      ))}
    </fieldset>
  );
}

/** Free-text box for a work role that isn't in the list yet. Saved with the form and added to the role list. */
export function NewRoleInput() {
  return (
    <div>
      <label className="label" htmlFor="newRoles">Role not in the list?</label>
      <textarea id="newRoles" name="newRoles" rows={2} className="input" placeholder="Type it here. Separate several roles with commas." />
      <p className="muted mt-1">New roles are added to the company role list. Admin sets their hourly rates on the Rates page.</p>
    </div>
  );
}
