import type { DbOrTx } from "../db";
import { schema } from "../db";
import type { Actor } from "../actor";

/** Append-only audit trail (A04, A05). */
export async function audit(
  tx: DbOrTx,
  actor: Pick<Actor, "companyId" | "memberId"> | null,
  action: string,
  targetType: string,
  targetId: string | null,
  details?: Record<string, unknown>,
) {
  await tx.insert(schema.auditLog).values({
    companyId: actor?.companyId ?? null,
    actorId: actor?.memberId ?? null,
    action,
    targetType,
    targetId,
    details: details ?? null,
  });
}

export async function logError(tx: DbOrTx, message: string, context?: Record<string, unknown>) {
  try {
    await tx.insert(schema.errorLog).values({ message, context: context ?? null });
  } catch {
    // never let error logging break a request
  }
}
