# Durations, rounding and time zones

The ARD (p.6) requires this policy to be documented before implementation. It is the policy now implemented in `src/lib/money.ts` and `src/lib/time.ts`.

## Time
- Every timestamp is stored in UTC (`timestamptz`) and taken from the **database server clock** at the moment of clock-in or clock-out. The phone's clock is never used (F05).
- All display and all week boundaries use **Europe/Dublin**.
- The week runs **Monday 00:00 to Sunday 24:00, Dublin time**.
- Duration is the elapsed time between two instants. This means:
  - shifts across midnight are counted correctly;
  - on the DST change days, a 00:00–06:00 shift is 5 h on 29 Mar 2026 and 7 h on 25 Oct 2026.
- A shift still open across Monday 00:00 is **split at clock-out** into two linked entries, one in each week. No time is added or lost.
- A manager's correction can't make an entry span two weeks. The manager enters two entries instead.
- CSV timestamps are ISO 8601 with offset (`2026-07-01T07:30:00+01:00`, or `Z` in winter).

## Rounding
- The exact duration is stored in whole seconds and never changes as a result of rounding.
- **Entry value = (paid seconds ÷ 3600) × hourly rate**, rounded **half-up to the cent**, per entry (or the day amount for a day rate).
- **Totals are sums of the rounded entry values.** Dashboards, CostMaster and CSV all use the same values, so their totals always reconcile (T07).
- Hours are shown to **2 decimals**. The CSV also includes `Duration seconds` so you can reconcile exactly.
- No time is rounded to 15-minute steps, and breaks are never deducted automatically (F09). A worker clocking themselves clocks out and back in for an unpaid break. A supervisor entering hours records the **unpaid break minutes**, and the stored duration is the paid time: elapsed seconds minus the break.
- **Day rates:** an entry priced at a day rate is worth the agreed day amount, whatever its hours. Hours are still recorded and shown.
- Worked example (ARD p.6): 20 h × €28 + 15 h × €30 + 5 h × €25 = €560 + €450 + €125 = **€1,135.00** for **40.00 h**.

The value is hours × agreed rate **before deductions**. It is not a payroll calculation and not a payment confirmation.
