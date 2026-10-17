import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { actorFromToken } from "@/server/services/auth";
import { logError } from "@/server/services/audit";
import { clockIn, clockOut } from "@/server/services/clock";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("in"), key: z.uuid(), projectId: z.uuid(), jobRoleId: z.uuid() }),
  z.object({ action: z.literal("out"), key: z.uuid() }),
]);

/**
 * Clock endpoint used by the clock screen. Responds 200 only after the entry is committed (Q01).
 * The idempotency key makes retries safe after an uncertain response (F07, T06).
 */
export async function POST(req: Request) {
  const actor = await actorFromToken((await cookies()).get("sid")?.value);
  if (!actor) return NextResponse.json({ error: "Your session has ended. Log in again; your open shift is kept." }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const result = parsed.data.action === "in" ? await clockIn(actor, parsed.data) : await clockOut(actor, parsed.data);
    return NextResponse.json({ ok: true, replayed: result.replayed, entryId: result.entry.id, status: result.entry.status });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    await logError(db, (e as Error)?.message ?? "clock error", { route: "clock" });
    return NextResponse.json({ error: "Not saved. Please retry." }, { status: 500 });
  }
}
