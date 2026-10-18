# Implementation decisions (ARD section 8)

Each setting below was confirmed with the business owner's representative before the build, or adopted from the ARD's recommended pilot defaults (p.15). Any change should be raised as a scope change with its requirement ID.

| Setting | Decision |
|---|---|
| Labour source | In-house workers of one company. Agencies and subcontractor portals are not included. |
| Clocking device | Each worker uses their own phone. Managers use a tablet or desktop. No shared kiosk. |
| Weekly period | Monday to Sunday, Europe/Dublin. There is no hard cut-off: workers submit any time after the week ends. Overdue drafts appear in the manager queue. Admin can submit on a worker's behalf, with a reason. |
| Period boundary | Shifts crossing Monday 00:00 are split into two linked entries at clock-out. |
| Breaks | The worker clocks out and back in. There is no automatic deduction. |
| Rounding | See [ROUNDING.md](ROUNDING.md): exact seconds, value rounded half-up per entry, 2-decimal hours. |
| Supervisor crew | Supervisors add workers to their own crew, set their roles and projects, and enter crew hours by day and project. They submit on the worker's behalf and approve. Workers added this way have no app login until admin sets a PIN. |
| Login | Username plus a 6-digit PIN. Admin sets a temporary PIN and the worker must change it on first login. After 5 failed attempts the account locks for 15 minutes. Recovery is an admin PIN reset; there is no email or SMS. Logging in never clocks in, and logging out never clocks out. |
| Rates | Agreed worker rates in EUR with effective dates. The most specific rate wins: **worker+project > worker > project > role standard**. At the same level, the latest effective-from wins. Two rates at the same level on the same date are a *conflict*, which blocks approval until admin resolves it. A missing rate is flagged, but the worker can still record time. Only admin configures rates. |
| Rate changes | New rates re-price **unapproved** entries only. If a submitted timesheet changes as a result, approval creates a new version for the manager to review. Approved values are never rewritten. |
| Manager coverage | Assignments are explicit: primary or cover. Removing one revokes access immediately. Access is never business-wide by default. |
| Self-approval | Nobody approves their own hours, including admins. A manager who is also a worker needs another manager assigned to them. |
| Long shifts | Shifts over 14 h (configurable) and open entries from earlier weeks are flagged for review. Hours are never cut automatically. |
| Manager CSV export | Off by default and switched on per company by admin (seeded on for the demo). An export only ever contains the manager's assigned workers. |
| CostMaster | A separate grant: either all projects or named projects, with an optional export permission. Read-only. It never grants approval or rate editing. Equipment, admin allocations and materials show **Not included**. |
| IT support | IT sees system health and the error log only. Admin can issue a read-only grant to business data that lasts 1–168 h, then expires or is revoked; it is audited. The IT role can't be combined with admin or manager. |
| Offline / GPS / photos | Not included. A failed or uncertain save is shown explicitly, and retrying is safe. |
| Languages | English. Labels are kept in `src/lib/i18n/en.ts` for later translation. |

## Still to confirm before launch (owner / architect)
- Number of registered workers, peak concurrent users, and the conditions for the 2-second performance target (Q04).
- Which phone and desktop browsers are supported, and the test devices.
- Hosting owner, backup frequency, recovery targets (RPO/RTO) and record retention. See [DEPLOYMENT.md](DEPLOYMENT.md).
