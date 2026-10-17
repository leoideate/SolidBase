"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Dict } from "@/lib/i18n/en";

type Option = { id: string; code: string; name: string };
type OpenInfo = { id: string; startAt: string; project: string; role: string } | null;
type Phase = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; msg: string } | { kind: "error"; msg: string } | { kind: "uncertain" };

function elapsed(fromIso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** UUID v4; crypto.randomUUID is unavailable outside secure contexts (e.g. plain-HTTP LAN testing). */
function newKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const timeFmt = new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Clock in/out with explicit save states (F05, F06, Q01). Each press gets a UUID; a retry after an
 * uncertain result reuses it, so the server never creates a duplicate.
 */
export function ClockPanel({ open, projects, roles, t }: { open: OpenInfo; projects: Option[]; roles: Option[]; t: Dict["clock"] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : "");
  const [roleId, setRoleId] = useState(roles.length === 1 ? roles[0].id : "");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, setPending] = useState<{ action: "in" | "out"; key: string; projectId?: string; jobRoleId?: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(i);
  }, []);

  async function send(req: { action: "in" | "out"; key: string; projectId?: string; jobRoleId?: string }) {
    setPending(req);
    setPhase({ kind: "saving" });
    try {
      const res = await fetch("/api/clock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setPending(null);
        setPhase({ kind: "saved", msg: req.action === "in" ? t.savedIn : t.savedOut });
        router.refresh();
        return;
      }
      if (res.status >= 500) {
        setPhase({ kind: "uncertain" });
        return;
      }
      setPending(null);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      setPhase({ kind: "error", msg: data.error ?? "Not saved." });
      router.refresh();
    } catch {
      // Network failure: the server may or may not have saved. Keep the key for a safe retry.
      setPhase({ kind: "uncertain" });
    }
  }

  const busy = phase.kind === "saving";

  const status =
    phase.kind === "saving" ? (
      <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700" role="status">{t.saving}</p>
    ) : phase.kind === "saved" ? (
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800" role="status">✓ {phase.msg}</p>
    ) : phase.kind === "error" ? (
      <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{phase.msg}</p>
    ) : phase.kind === "uncertain" ? (
      <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
        <p>{t.uncertain}</p>
        <button className="btn-brand btn-sm mt-2" onClick={() => pending && send(pending)}>
          Retry
        </button>
      </div>
    ) : null;

  if (open) {
    return (
      <section className="card space-y-4 border-brand-400 ring-2 ring-brand-200">
        <div className="flex items-center gap-2">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm font-semibold text-emerald-700">{t.onShift}</span>
        </div>
        <div>
          <div className="text-4xl font-black tabular-nums">{elapsed(open.startAt, now)}</div>
          <div className="mt-1 text-sm text-slate-600">
            {t.since} {timeFmt.format(new Date(open.startAt))}
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">{t.project}</dt>
            <dd className="font-semibold">{open.project}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">{t.role}</dt>
            <dd className="font-semibold">{open.role}</dd>
          </div>
        </dl>
        <button
          className="btn w-full bg-red-600 py-5 text-lg text-white hover:bg-red-700"
          disabled={busy}
          onClick={() => send(pending?.action === "out" ? pending : { action: "out", key: newKey() })}
        >
          {busy ? t.saving : t.clockOut}
        </button>
        {status}
      </section>
    );
  }

  if (projects.length === 0 || roles.length === 0) {
    return (
      <section className="card">
        <h1 className="h2">{t.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{t.noAssignments}</p>
      </section>
    );
  }

  return (
    <section className="card space-y-4">
      <h1 className="h2">{t.title}</h1>
      <div>
        <label className="label" htmlFor="project">{t.project}</label>
        <select id="project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Choose project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="role">{t.role}</label>
        <select id="role" className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Choose role…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <button
        className="btn w-full bg-emerald-600 py-5 text-lg text-white hover:bg-emerald-700"
        disabled={busy || !projectId || !roleId}
        onClick={() =>
          send(
            pending?.action === "in" && pending.projectId === projectId && pending.jobRoleId === roleId
              ? pending
              : { action: "in", key: newKey(), projectId, jobRoleId: roleId },
          )
        }
      >
        {busy ? t.saving : t.clockIn}
      </button>
      {status}
    </section>
  );
}
