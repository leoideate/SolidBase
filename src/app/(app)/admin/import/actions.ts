"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActor } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { logError } from "@/server/services/audit";
import { importHours, importWorkers } from "@/server/services/imports";
import type { ImportKind, ImportReport } from "@/server/services/imports";

export type ImportResult = { report?: ImportReport; error?: string };

/** Check (commit = false) or import (commit = true) an uploaded CSV. The import refuses any file with errors. */
export async function importCsvAction(kind: ImportKind, csv: string, commit: boolean): Promise<ImportResult> {
  const actor = await requireActor();
  try {
    const report = kind === "workers" ? await importWorkers(actor, csv, commit) : await importHours(actor, csv, commit);
    if (report.committed) revalidatePath("/", "layout");
    return { report };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    await logError(db, (e as Error)?.message ?? "Unknown error", { stack: (e as Error)?.stack?.slice(0, 2000) });
    return { error: "Something went wrong and nothing was saved. Please try again." };
  }
}
