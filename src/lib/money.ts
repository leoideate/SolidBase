import Decimal from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Rounding policy (docs/ROUNDING.md):
 * - Durations are stored as exact seconds.
 * - Entry value = (seconds / 3600) × hourly rate, rounded half-up to the cent.
 * - Totals are sums of rounded entry values, so screens and CSV always agree.
 * - Hours are displayed to 2 decimal places.
 */
export function entryValue(seconds: number, hourlyRate: string | number): string {
  return new Decimal(seconds).div(3600).mul(hourlyRate).toDecimalPlaces(2).toFixed(2);
}

/**
 * Value of one entry at its rate: hourly rates use the paid seconds; a day rate is the agreed
 * amount for the day, whatever the hours (two day-rate entries on one day block approval).
 */
export function rateValue(unit: "hour" | "day", seconds: number, rate: string | number): string {
  return unit === "day" ? new Decimal(rate).toDecimalPlaces(2).toFixed(2) : entryValue(seconds, rate);
}

/** "€28.00/h" or "€200.00/day". */
export function fmtRate(rate: string | number | null | undefined, unit: "hour" | "day" = "hour"): string {
  if (rate == null) return "—";
  return `${fmtMoney(rate)}/${unit === "day" ? "day" : "h"}`;
}

export function sumMoney(values: (string | number | null | undefined)[]): string {
  return values.reduce<Decimal>((acc, v) => (v == null ? acc : acc.plus(v)), new Decimal(0)).toFixed(2);
}

export function hours(seconds: number): string {
  return new Decimal(seconds).div(3600).toDecimalPlaces(2).toFixed(2);
}

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "—";
  return eur.format(Number(v));
}

export function isMoney(s: string): boolean {
  return /^\d{1,8}(\.\d{1,2})?$/.test(s);
}

/** IBAN without spaces, upper case. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

const IBAN_LENGTH: Record<string, number> = { IE: 22, GB: 22, DE: 22, FR: 27, ES: 24, IT: 27, NL: 18, BE: 16, PL: 28, LT: 20, LV: 21, RO: 24, PT: 25 };

/** ISO 13616 check: country code, length (for common countries) and the mod-97 checksum. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const len = IBAN_LENGTH[iban.slice(0, 2)];
  if (len && iban.length !== len) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

/** "IE29 AIBK 9311 5212 3456 78" */
export function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, "$1 ").trim();
}

/** Stored hint: country code plus last 4 characters, e.g. "IE5678". */
export function ibanHint(raw: string): string {
  const iban = normalizeIban(raw);
  return iban.slice(0, 2) + iban.slice(-4);
}

/** Masked form for display from the stored hint: "IE•• •••• •••• 5678". */
export function maskIban(hint: string | null | undefined): string {
  if (!hint) return "—";
  return `${hint.slice(0, 2)}•• •••• •••• ${hint.slice(2)}`;
}
