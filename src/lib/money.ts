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
