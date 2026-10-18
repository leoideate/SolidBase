import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db";
import { clearBankDetails, revealIban, setBankDetails } from "@/server/services/bank";
import { buildExport } from "@/server/services/exports";
import { seedDemo } from "../fixtures";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const m = () => s.members;
const IBAN = "IE29 AIBK 9311 5212 3456 78";

beforeEach(async () => {
  s = await seedDemo({ withSubmittedWeek: true });
});

describe("worker bank details", () => {
  it("stores the IBAN encrypted, shows it only to admin, and audits changes and views", async () => {
    await setBankDetails(m().admin, m().pat.memberId, { bankName: "AIB", iban: IBAN });
    const [row] = await db.select().from(schema.companyMembers).where(eq(schema.companyMembers.id, m().pat.memberId));
    expect(row.bankName).toBe("AIB");
    expect(row.ibanLast4).toBe("IE5678");
    expect(row.ibanEncrypted).toMatch(/^v1\./);
    expect(row.ibanEncrypted).not.toContain("AIBK");

    expect(await revealIban(m().admin, m().pat.memberId)).toBe(IBAN);
    // Supervisors, workers, CostMaster and IT can't read or change it.
    for (const who of [m().sean, m().pat, m().owner, m()["it.support"]]) {
      await expect(revealIban(who, m().pat.memberId)).rejects.toThrow(/Administrator/);
      await expect(setBankDetails(who, m().pat.memberId, { bankName: "X", iban: IBAN })).rejects.toThrow(/Administrator/);
    }

    // The ciphertext is bound to its worker: copied onto another row it doesn't decrypt.
    await db.update(schema.companyMembers).set({ ibanEncrypted: row.ibanEncrypted, ibanLast4: "IE5678" }).where(eq(schema.companyMembers.id, m().mary.memberId));
    await expect(revealIban(m().admin, m().mary.memberId)).rejects.toThrow(/decrypted/);

    const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.targetId, m().pat.memberId));
    const actions = log.map((l) => l.action);
    expect(actions).toContain("worker.bank_details_added");
    expect(actions).toContain("worker.bank_details_viewed");
    expect(JSON.stringify(log)).not.toContain("AIBK93115212345678");

    await clearBankDetails(m().admin, m().pat.memberId);
    await expect(revealIban(m().admin, m().pat.memberId)).rejects.toThrow(/No IBAN/);
  });

  it("rejects invalid IBANs and keeps bank details out of CSV exports", async () => {
    await expect(setBankDetails(m().admin, m().pat.memberId, { bankName: "AIB", iban: "IE29 AIBK 9311 5212 3456 79" })).rejects.toThrow(/isn't valid/);
    await expect(setBankDetails(m().admin, m().pat.memberId, { bankName: "", iban: IBAN })).rejects.toThrow(/Bank name/);
    await setBankDetails(m().admin, m().pat.memberId, { bankName: "AIB", iban: IBAN });
    const exp = await buildExport(m().admin, { scope: "team", fromWeek: s.lastWeek, toWeek: s.lastWeek });
    expect(exp.csv).not.toMatch(/IBAN|AIBK|5678/);
  });
});
