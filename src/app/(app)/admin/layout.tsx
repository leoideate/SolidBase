import { AdminNav } from "@/components/admin-nav";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!actor.isAdmin) redirect("/");
  return (
    <div className="space-y-7">
      <AdminNav />
      {children}
    </div>
  );
}
