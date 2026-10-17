import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { actorFromToken } from "@/server/services/auth";
import { buildExport } from "@/server/services/exports";

/** CSV download of approved entries. Scope and permissions are enforced in buildExport (T03, T08). */
export async function GET(req: Request) {
  const actor = await actorFromToken((await cookies()).get("sid")?.value);
  if (!actor) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const u = new URL(req.url);
  const scope = u.searchParams.get("scope") === "costmaster" ? "costmaster" : "team";
  try {
    const out = await buildExport(actor, {
      scope,
      fromWeek: u.searchParams.get("from") ?? "",
      toWeek: u.searchParams.get("to") ?? "",
      workerId: u.searchParams.get("worker") || undefined,
      projectId: u.searchParams.get("project") || undefined,
    });
    return new NextResponse(out.csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${out.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "forbidden" ? 403 : 400 });
    throw e;
  }
}
