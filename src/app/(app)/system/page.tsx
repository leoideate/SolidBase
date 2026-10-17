import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { requireActor } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { hasSupportAccess } from "@/server/authz";
import { fmtDateTime } from "@/lib/time";
import { PageHeader, Stat } from "@/components/ui";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

/** IT view (ARD section 2): system health, errors and configuration. No business data by default. */
export default async function SystemPage() {
  const actor = await requireActor();
  if (!actor.isIt && !actor.isAdmin) redirect("/");
  const started = Date.now();
  let dbOk = true;
  let dbInfo = { version: "", migrations: 0, size: "" };
  try {
    const [r] = await db.execute<{ version: string; migrations: number; size: string }>(sql`
      select split_part(version(), ' ', 2) as version,
        (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
        pg_size_pretty(pg_database_size(current_database())) as size`);
    dbInfo = r;
  } catch {
    dbOk = false;
  }
  const latency = Date.now() - started;
  const errors = await db.select().from(schema.errorLog).orderBy(desc(schema.errorLog.id)).limit(50);
  const support = await hasSupportAccess(db, actor);

  return (
    <div className="space-y-4">
      <PageHeader title="System" subtitle={`Version ${pkg.version} · ${process.env.NODE_ENV}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Database" value={dbOk ? "Healthy" : "Unavailable"} tone={dbOk ? "good" : "default"} sub={`${latency} ms round trip`} />
        <Stat label="PostgreSQL" value={dbInfo.version || "—"} sub={dbInfo.size} />
        <Stat label="Migrations applied" value={String(dbInfo.migrations)} />
        <Stat label="Recent errors" value={String(errors.length)} tone={errors.length ? "default" : "muted"} />
      </div>
      <section className="card">
        <h2 className="h2 mb-1">Business data access</h2>
        {support ? (
          <p className="text-sm">
            An administrator has granted you temporary read-only support access.{" "}
            <Link href="/team/overview?week=all" className="text-blue-700 underline">Open read-only team overview</Link>
          </p>
        ) : (
          <p className="muted">You have no access to worker or financial records. An administrator can grant temporary, read-only support access.</p>
        )}
      </section>
      <section className="card overflow-x-auto">
        <h2 className="h2 mb-2">Error log</h2>
        {errors.length === 0 ? (
          <p className="muted">No errors recorded.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th><th>Message</th></tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                  <td className="font-mono text-xs">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
