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
