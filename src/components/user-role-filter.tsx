"use client";

import { useRouter } from "next/navigation";

export function UserRoleFilter({ role, options }: { role: string; options: { value: string; label: string }[] }) {
  const router = useRouter();

  return (
    <select
      aria-label="Filter users by role"
      name="role"
      value={role}
      className="input w-full sm:w-80"
      onChange={(event) => {
        const selectedRole = event.target.value;
        router.push(selectedRole ? `/admin/users?role=${encodeURIComponent(selectedRole)}` : "/admin/users");
      }}
    >
      <option value="">All roles</option>
      {options.map(({ value, label }) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
}