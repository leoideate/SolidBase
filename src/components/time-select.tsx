"use client";

import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** Hour and minute drop-downs (5-minute steps) that submit one HH:MM value under `name`. */
export function TimeSelect({ name, defaultValue, label }: { name: string; defaultValue: string; label: string }) {
  const [h0, m0] = defaultValue.split(":");
  const [h, setH] = useState(h0);
  // Round an off-grid default to the nearest 5 minutes so it can be shown.
  const [m, setM] = useState(String(Math.min(55, Math.round(Number(m0) / 5) * 5)).padStart(2, "0"));
  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={`${h}:${m}`} />
      <select className="input px-2" value={h} onChange={(e) => setH(e.target.value)} aria-label={`${label} hour`}>
        {HOURS.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <span aria-hidden>:</span>
      <select className="input px-2" value={m} onChange={(e) => setM(e.target.value)} aria-label={`${label} minutes`}>
        {MINUTES.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </div>
  );
}

/** Ticks or clears every "worked" box in the form. */
export function TickAll() {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        className="size-5"
        onChange={(e) => {
          const form = e.currentTarget.closest("form");
          form?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name^="on_"]:not(:disabled)').forEach((c) => (c.checked = e.currentTarget.checked));
        }}
      />
      Tick all workers
    </label>
  );
}
