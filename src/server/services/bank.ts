import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { DbOrTx } from "../db";
import type { Actor } from "../actor";
import { assertCanManageWorker, requireAdmin } from "../authz";
import { decryptField, encryptField } from "../crypto";
import { AppError, Forbidden, NotFound } from "../errors";
import { formatIban, ibanHint, isValidIban, normalizeIban } from "@/lib/money";
import { audit } from "./audit";

/**
 * Worker bank details, kept for the company's records. The IBAN is encrypted at rest and never in
 * any CSV; every change and every reveal of the full IBAN is audited (without the IBAN itself).
 *
 * - Admin: add, change, remove, and see the full IBAN.
 * - Supervisor: may record the *first* IBAN for a worker in their own crew (e.g. when adding them),
 *   but can't change or remove an existing one and only ever sees it masked. This limits payment
 *   diversion: changing where someone is paid always needs an administrator.
 */

async function member(actor: Actor, memberId: string) {
  const [m] = await db
    .select()
    .from(schema.companyMembers)
    .where(and(eq(schema.companyMembers.id, memberId), eq(schema.companyMembers.companyId, actor.companyId)));
  if (!m) throw new NotFound("User not found.");
  return m;
}

export type BankInput = { bankName: string; iban: string };

/** Validated bank values; throws a readable error. */
export function checkBank(input: BankInput) {
  const bankName = input.bankName.trim();
  const iban = normalizeIban(input.iban);
  if (!bankName) throw new AppError("Bank name is required.");
  if (!isValidIban(iban)) throw new AppError("That IBAN isn't valid. Check the country code, length and digits.");
  return { bankName, iban };
}

export async function setBankDetails(actor: Actor, memberId: string, input: BankInput) {
  const m = await member(actor, memberId);
  if (!actor.isAdmin) {
    if (!actor.isManager) throw new Forbidden("Administrator access required.");
    await assertCanManageWorker(db, actor, m.id);
    if (m.ibanEncrypted) throw new Forbidden("Only an administrator can change an IBAN that is already recorded.");
  }
  const checked = checkBank(input);
  await db.transaction((tx) => writeBank(tx, actor, m, checked));
}

/** Store validated bank details for a member row (inside the caller's transaction) and audit it. */
export async function writeBank(
  tx: DbOrTx,
  actor: Actor,
  m: { id: string; ibanEncrypted: string | null; ibanLast4: string | null },
  b: { bankName: string; iban: string },
) {
  await tx
    .update(schema.companyMembers)
    .set({ bankName: b.bankName, ibanEncrypted: encryptField(b.iban, m.id), ibanLast4: ibanHint(b.iban), bankUpdatedAt: new Date(), bankUpdatedBy: actor.memberId })
    .where(eq(schema.companyMembers.id, m.id));
  await audit(tx, actor, m.ibanEncrypted ? "worker.bank_details_changed" : "worker.bank_details_added", "member", m.id, {
    bankName: b.bankName,
    iban: `…${b.iban.slice(-4)}`,
    previous: m.ibanLast4 ? `…${m.ibanLast4.slice(2)}` : null,
    by: actor.isAdmin ? "admin" : "supervisor",
  });
}

export async function clearBankDetails(actor: Actor, memberId: string) {
  requireAdmin(actor);
  const m = await member(actor, memberId);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.companyMembers)
      .set({ bankName: null, ibanEncrypted: null, ibanLast4: null, bankUpdatedAt: new Date(), bankUpdatedBy: actor.memberId })
      .where(eq(schema.companyMembers.id, m.id));
    await audit(tx, actor, "worker.bank_details_removed", "member", m.id, { previous: m.ibanLast4 ? `…${m.ibanLast4.slice(2)}` : null });
  });
}

/** Full IBAN for an admin who asks to see it; the reveal is audited. */
export async function revealIban(actor: Actor, memberId: string): Promise<string> {
  requireAdmin(actor);
  const m = await member(actor, memberId);
  if (!m.ibanEncrypted) throw new AppError("No IBAN is recorded for this worker.");
  const iban = decryptField(m.ibanEncrypted, m.id);
  await audit(db, actor, "worker.bank_details_viewed", "member", m.id);
  return formatIban(iban);
}
