import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Actor } from "../actor";
import { requireAdmin } from "../authz";
import { decryptField, encryptField } from "../crypto";
import { AppError, NotFound } from "../errors";
import { formatIban, ibanHint, isValidIban, normalizeIban } from "@/lib/money";
import { audit } from "./audit";

/**
 * Worker bank details, kept for the company's records. Admin only: supervisors, CostMaster and IT
 * never see them, and they are not in any CSV. The IBAN is encrypted at rest; every change and
 * every reveal of the full IBAN is audited (without the IBAN itself).
 */

async function member(actor: Actor, memberId: string) {
  const [m] = await db
    .select()
    .from(schema.companyMembers)
    .where(and(eq(schema.companyMembers.id, memberId), eq(schema.companyMembers.companyId, actor.companyId)));
  if (!m) throw new NotFound("User not found.");
  return m;
}

export async function setBankDetails(actor: Actor, memberId: string, input: { bankName: string; iban: string }) {
  requireAdmin(actor);
  const m = await member(actor, memberId);
  const bankName = input.bankName.trim();
  const iban = normalizeIban(input.iban);
  if (!bankName) throw new AppError("Bank name is required.");
  if (!isValidIban(iban)) throw new AppError("That IBAN isn't valid. Check the country code, length and digits.");
  const encrypted = encryptField(iban, m.id);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.companyMembers)
      .set({ bankName, ibanEncrypted: encrypted, ibanLast4: ibanHint(iban), bankUpdatedAt: new Date(), bankUpdatedBy: actor.memberId })
      .where(eq(schema.companyMembers.id, m.id));
    await audit(tx, actor, m.ibanEncrypted ? "worker.bank_details_changed" : "worker.bank_details_added", "member", m.id, {
      bankName,
      iban: `…${iban.slice(-4)}`,
      previous: m.ibanLast4 ? `…${m.ibanLast4.slice(2)}` : null,
    });
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
