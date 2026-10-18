import { and, eq, sql } from "drizzle-orm";
import { schema } from "../db";
import type { DbOrTx } from "../db";
import type { EngagementType } from "../db/schema";
import { AppError } from "../errors";

/**
 * Worker personal and engagement details from the client's "Adding Workers" sheet: name parts,
 * address, contact email and mobile, engagement type. Bank details are deliberately not stored.
 */
export type PersonInput = {
  firstName: string;
  middleName?: string;
  lastName: string;
  email?: string;
  mobile?: string;
  address?: string;
  engagementType?: string;
};

const opt = (v?: string) => v?.trim() || null;

export function displayNameOf(p: { firstName?: string | null; middleName?: string | null; lastName?: string | null }) {
  return [p.firstName, p.middleName, p.lastName].map((x) => x?.trim()).filter(Boolean).join(" ");
}

/** Validated column values for `users`, plus the member's engagement type. */
export function personValues(input: PersonInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new AppError("First name and last name are required.");
  const email = opt(input.email)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid email address.");
  const mobile = opt(input.mobile);
  if (mobile && !/^\+?[0-9 ()-]{7,20}$/.test(mobile)) throw new AppError("Enter a valid mobile number.");
  const engagementType = opt(input.engagementType);
  if (engagementType && !(schema.ENGAGEMENT_TYPES as readonly string[]).includes(engagementType)) throw new AppError("Unknown engagement type.");
  const middleName = opt(input.middleName);
  return {
    user: { displayName: displayNameOf({ firstName, middleName, lastName }), firstName, middleName, lastName, email, mobile, address: opt(input.address) },
    engagementType: engagementType as EngagementType | null,
  };
}

/** Next automatic worker ID (W001, W002, …) for the company. A clash on save is reported as "in use". */
export async function nextWorkerCode(tx: DbOrTx, companyId: string): Promise<string> {
  const [r] = await tx
    .select({ n: sql<number>`coalesce(max(substring(${schema.companyMembers.workerCode} from 2)::int), 0)` })
    .from(schema.companyMembers)
    .where(and(eq(schema.companyMembers.companyId, companyId), sql`${schema.companyMembers.workerCode} ~ '^W[0-9]+$'`));
  return `W${String(Number(r.n) + 1).padStart(3, "0")}`;
}

/** Read person fields from a submitted form. */
export function personFromForm(fd: FormData): PersonInput {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    firstName: s("firstName"),
    middleName: s("middleName"),
    lastName: s("lastName"),
    email: s("email"),
    mobile: s("mobile"),
    address: s("address"),
    engagementType: s("engagementType"),
  };
}
