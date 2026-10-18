/**
 * Screen labels. Phase one ships English only; keeping labels here makes later translation a
 * matter of adding a dictionary per language (ARD p.10). Document packs are out of scope.
 */
export const en = {
  appName: "SolidBase",
  nav: {
    clock: "Clock",
    myWeek: "My week",
    history: "History",
    team: "Team queue",
    crewHours: "Enter hours",
    crew: "My crew",
    overview: "Team overview",
    admin: "Admin",
    costs: "CostMaster",
    system: "System",
    logout: "Log out",
  },
  clock: {
    title: "Clock in / out",
    project: "Project",
    role: "Role",
    clockIn: "Clock in",
    clockOut: "Clock out",
    onShift: "On shift",
    since: "Since",
    saving: "Saving…",
    savedIn: "Clocked in. Your shift is saved.",
    savedOut: "Clocked out. Your shift is saved.",
    uncertain: "Not confirmed. Your connection may have dropped. Tap Retry. It will not create a duplicate.",
    breakHint: "Unpaid break? Clock out, then clock in again when you return.",
    changeHint: "Changing project or role? Clock out, then clock in with the new selection.",
    noAssignments: "You have no assigned projects or roles yet. Ask your administrator.",
  },
  status: {
    draft: "Draft",
    submitted: "Submitted",
    returned: "Returned",
    approved: "Approved",
    open: "Open",
    closed: "Closed",
  },
} as const;

export type Dict = typeof en;
const dictionaries: Record<string, Dict> = { en };

export function dict(lang: string | undefined | null): Dict {
  return dictionaries[lang ?? "en"] ?? en;
}
