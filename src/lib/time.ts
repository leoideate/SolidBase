import { TZDate } from "@date-fns/tz";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";

/** Business display timezone (ARD p.6). All storage is UTC timestamptz. */
export const TZ = "Europe/Dublin";

/** Local calendar date (YYYY-MM-DD) in Dublin for an instant. */
export function localDate(at: Date): string {
  return format(new TZDate(at, TZ), "yyyy-MM-dd");
}

/** Monday (YYYY-MM-DD) of the Dublin week containing the instant. */
export function weekStartOf(at: Date): string {
  return format(startOfWeek(new TZDate(at, TZ), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/** The UTC instant of Monday 00:00 Dublin for a week start date. DST-aware. */
export function weekStartInstant(weekStart: string): Date {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, TZ).getTime());
}

/** The UTC instant at which the given week ends (next Monday 00:00 Dublin). */
export function weekEndInstant(weekStart: string): Date {
  return weekStartInstant(addWeekToDate(weekStart, 1));
}

export function addWeekToDate(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return format(addWeeks(new Date(y, m - 1, d), weeks), "yyyy-MM-dd");
}

export function weekDays(weekStart: string): string[] {
  const [y, m, d] = weekStart.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => format(addDays(new Date(y, m - 1, d), i), "yyyy-MM-dd"));
}

export function isWeekStart(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && dt.getDay() === 1;
}

/** Elapsed whole seconds between two instants; absolute time, so DST and midnight are handled. */
export function elapsedSeconds(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 1000);
}

/**
 * Split [start, end) at every Dublin week boundary. Each piece belongs to exactly one week, with no
 * time duplicated or lost.
 */
export function splitAtWeekBoundaries(start: Date, end: Date): { start: Date; end: Date; weekStart: string }[] {
  const pieces: { start: Date; end: Date; weekStart: string }[] = [];
  let cursor = start;
  while (cursor < end) {
    const ws = weekStartOf(cursor);
    const boundary = weekEndInstant(ws);
    const pieceEnd = boundary < end ? boundary : end;
    pieces.push({ start: cursor, end: pieceEnd, weekStart: ws });
    cursor = pieceEnd;
  }
  return pieces;
}

/** "Mon 13 Oct, 07:30" in Dublin time. */
export function fmtDateTime(at: Date | null | undefined): string {
  if (!at) return "—";
  return format(new TZDate(at, TZ), "EEE d MMM, HH:mm");
}

export function fmtTime(at: Date | null | undefined): string {
  if (!at) return "—";
  return format(new TZDate(at, TZ), "HH:mm");
}

export function fmtDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(`${d}T12:00:00Z`) : new TZDate(d, TZ);
  return format(dt, "EEE d MMM yyyy");
}

/** ISO 8601 with the Dublin offset, e.g. 2026-10-12T07:30:00+01:00 (CSV, ARD p.6). */
export function isoWithOffset(at: Date): string {
  return format(new TZDate(at, TZ), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export function weekLabel(weekStart: string): string {
  const days = weekDays(weekStart);
  return `${fmtShort(days[0])} – ${fmtShort(days[6])}`;
}

function fmtShort(d: string) {
  return format(new Date(`${d}T12:00:00Z`), "d MMM yyyy");
}

/** Parse "YYYY-MM-DDTHH:mm" entered as Dublin wall-clock time into a UTC instant. */
export function parseLocalDateTime(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, TZ).getTime());
}

/** Format an instant as a datetime-local input value in Dublin time. */
export function toLocalInput(at: Date | null | undefined): string {
  if (!at) return "";
  return format(new TZDate(at, TZ), "yyyy-MM-dd'T'HH:mm");
}
