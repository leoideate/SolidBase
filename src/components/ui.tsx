import Link from "next/link";
import { hours, fmtMoney } from "@/lib/money";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-800",
  returned: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  open: "bg-brand-100 text-brand-700",
  closed: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-700"}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

export function FlagBadge({ label }: { label: string }) {
  return <span className="badge bg-red-100 text-red-800">⚠ {label}</span>;
}

export function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "muted" }) {
  const toneCls = tone === "good" ? "text-emerald-700" : tone === "muted" ? "text-slate-500" : "text-slate-900";
  return (
    <div className="card">
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export const Hours = ({ s }: { s: number | null | undefined }) => <span className="tabular-nums">{hours(s ?? 0)}</span>;
export const Money = ({ v }: { v: string | null | undefined }) => <span className="tabular-nums">{fmtMoney(v)}</span>;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <div className="muted mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function WeekNav({ base, week, prev, next, label, extraQuery = "" }: { base: string; week: string; prev: string; next: string | null; label: string; extraQuery?: string }) {
  void week;
  return (
    <div className="flex items-center gap-2">
      <Link className="btn-secondary btn-sm" href={`${base}${prev}${extraQuery}`} aria-label="Previous week">
        ←
      </Link>
      <span className="min-w-40 text-center text-sm font-semibold">{label}</span>
      {next ? (
        <Link className="btn-secondary btn-sm" href={`${base}${next}${extraQuery}`} aria-label="Next week">
          →
        </Link>
      ) : (
        <span className="btn-secondary btn-sm pointer-events-none opacity-40">→</span>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}
