# Administrator guide

## First-time setup
1. **Clients and projects** (Admin → Projects). First add your clients at the bottom of the page. Then add each project: client, principal, project type, a unique Project ID (e.g. `P004`), name, description, full address, SIN and start and end dates. Making a project inactive hides it from clocking but keeps its history.
2. **Roles** (Admin → Roles). Add the work roles workers choose when clocking in, such as *Dumper driver*.
3. **Rates** (Admin → Rates). Add a *role standard* rate for every role, per hour or per day. Add worker-specific, project-specific or worker+project overrides only where an agreed rate differs.
4. **Users** (Admin → Users → Add user). Enter first, middle and last name, contact details and engagement type, a username and a temporary 6-digit PIN, then tick the access roles. Leave Worker ID empty to get the next one automatically (W001, W002…). Bank details are not stored.
5. **On each worker's page:**
   - tick the projects and roles they may clock against;
   - assign their manager (primary, plus any cover managers).
6. **CostMaster.** On the user's page, grant *All projects* or individual projects, and tick *Can export* if needed.
7. **Settings.** Set the long-shift flag threshold and choose whether managers may download CSVs.

## Everyday tasks
| Task | How |
|---|---|
| Supervisor-added worker needs the app | The user list shows *No app login*. Open the user → **Set PIN**, then give them the login name shown (`w.<worker id>`) and the temporary PIN. |
| Record a worker's bank details | Open the user → **Bank details** → *Add bank details* (bank name and IBAN). Only admins see them. The IBAN is shown masked; **Show full IBAN** reveals it and is recorded in the audit log. After any change, confirm the new IBAN with the worker by phone before paying them. |
| Worker forgot their PIN | Open the user's page → **Reset PIN** with a temporary PIN. Their sessions end and they choose a new PIN at next login. |
| Worker leaves | **Deactivate** on their page. They can't log in, but their history is kept. Their open shift (if any) appears in the manager queue for closing. |
| Rate change | Add a new rate with a later *effective from* date. To stop a rate, use **End**. Rates are never deleted. |
| *No rate* or *Rate conflict* warning | Admin → Rates lists the blocked entries. Add the missing rate, or end one of the two conflicting rates. Affected entries are re-priced automatically. |
| Correct an approved week | As manager or admin, open the timesheet → **Reopen** with a reason. Correct it, then approve again. Exports show the new approved version number. |
| IT needs to see records | Admin → IT support access → grant for a few hours with the ticket reference. Revoke early if possible. |
| Who changed what | Admin → Audit log (append-only). Admin → Export history shows every CSV downloaded. |

## Rules the system enforces
- Managers only ever see workers assigned to them. This applies on screens, CSV downloads and direct links.
- Nobody approves their own hours. An admin who also records hours needs another reviewer.
- A timesheet with open entries or missing or conflicting rates can't be approved.
- Every correction needs a reason. The worker sees the original value, the new value and the reason.
- Approved timesheets are locked, including at database level, until they are reopened.
