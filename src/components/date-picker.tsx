"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { addDays, addMonths, format, parseISO, setMonth as withMonth, setYear, startOfMonth, startOfWeek } from "date-fns";

/** Calendar dates stay local: never convert a date-only field through UTC. */
function parseDate(value: string) {
  return parseISO(value);
}

export function DatePicker({ id, name, defaultValue, max, today = max ?? format(new Date(), "yyyy-MM-dd"), required = true, portal = false, onValueChange, time, onTimeChange }: { id: string; name: string; defaultValue: string; max?: string; today?: string; required?: boolean; portal?: boolean; onValueChange?: (value: string) => void; time?: string; onTimeChange?: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue);
  const [month, setMonth] = useState(() => startOfMonth(parseDate(defaultValue || today)));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();
  const first = startOfWeek(month, { weekStartsOn: 1 });
  const lastMonth = max ? startOfMonth(parseDate(max)) : null;
  const currentYear = parseDate(today).getFullYear();
  const firstYear = currentYear - 10;
  const lastYear = currentYear;
  const buttonStyle = "rounded-lg text-sm transition-colors hover:bg-[#f5f1eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e] disabled:cursor-not-allowed disabled:opacity-30";

  useEffect(() => {
    if (!open) return;
    const selected = panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]:not(:disabled)');
    const firstEnabled = panel.current?.querySelector<HTMLButtonElement>('[data-day]:not(:disabled)');
    (selected ?? firstEnabled)?.focus();
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    const form = root.current?.closest("form");
    function reset(event: Event) {
      queueMicrotask(() => {
        if (!event.defaultPrevented) {
          setValue(defaultValue);
          setOpen(false);
        }
      });
    }
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);

  useLayoutEffect(() => {
    if (!open || !portal) return;
    function place() {
      const anchor = trigger.current?.getBoundingClientRect();
      const calendar = panel.current?.getBoundingClientRect();
      if (!anchor || !calendar) return;
      const below = anchor.bottom + 8;
      const top = below + calendar.height <= window.innerHeight - 8
        ? below : Math.max(8, anchor.top - calendar.height - 8);
      setPosition({ top, left: Math.max(8, Math.min(anchor.left, window.innerWidth - calendar.width - 8)) });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, portal]);

  function renderPanel(content: ReactNode) {
    return portal ? createPortal(content, document.body) : content;
  }

  function choose(date: string) {
    setValue(date);
    onValueChange?.(date);
    if (!time || !date) {
      setOpen(false);
      trigger.current?.focus();
    }
  }

  return (
    <div ref={root} className="relative" onBlur={(event) => {
      // A disabled or removed calendar button can lose focus without leaving the picker.
      // Outside pointer presses are handled separately; close on actual focus movement.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !panel.current?.contains(event.relatedTarget as Node)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
      {/* Keep a full-size validation target so the browser anchors its required-field bubble to Day. */}
      <input type="text" name={name} value={value} required={required} tabIndex={-1} aria-label="Selected date"
        className="peer pointer-events-none absolute inset-x-0 top-0 h-11 w-full opacity-0"
        onChange={() => {}} onInvalid={() => setOpen(false)} />
      <button ref={trigger} id={id} type="button" aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog"
        className="input flex items-center justify-between gap-3 border-[#d9cfc1] text-left focus:border-[#a99576] focus:ring-[#eee5d7] peer-focus:border-[#a99576] peer-focus:ring-2 peer-focus:ring-[#eee5d7]"
        onClick={() => { setMonth(startOfMonth(parseDate(value || today))); setOpen(!open); }}>
        <span className={value ? undefined : "text-slate-400"}>{value ? `${format(parseDate(value), "dd/MM/yyyy")}${time ? ` ${time}` : ""}` : "dd/mm/yyyy"}</span>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
      </button>
      {open && renderPanel(
        <div ref={panel} id={panelId} role="dialog" aria-labelledby={titleId}
          style={portal ? { position: "fixed", top: position.top, left: position.left } : undefined}
          className={`${portal ? "z-50" : "absolute top-full left-0 z-30 mt-2"} w-72 max-w-[calc(100vw-4rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border border-[#d9cfc1] bg-white p-3 shadow-lg shadow-[#66545d]/10`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" aria-label="Previous month" className={`${buttonStyle} size-9`} onClick={() => setMonth(addMonths(month, -1))}>←</button>
            <span id={titleId} aria-live="polite" className="sr-only">{format(month, "MMMM yyyy")}</span>
            <div className="flex min-w-0 items-center gap-1">
              <select aria-label="Month" value={month.getMonth()}
                className="min-w-0 shrink rounded-lg border border-[#d9cfc1] bg-white px-1 py-1.5 text-sm font-semibold focus:outline-2 focus:outline-[#92754e]"
                onChange={(event) => setMonth(withMonth(month, Number(event.target.value)))}>
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index} value={index} disabled={!!lastMonth && month.getFullYear() === lastMonth.getFullYear() && index > lastMonth.getMonth()}>{format(withMonth(month, index), "MMMM")}</option>
                ))}
              </select>
              <select aria-label="Year" value={month.getFullYear()}
                className="min-w-0 shrink rounded-lg border border-[#d9cfc1] bg-white px-1 py-1.5 text-sm font-semibold focus:outline-2 focus:outline-[#92754e]"
                onChange={(event) => {
                  const next = setYear(month, Number(event.target.value));
                  setMonth(lastMonth && next > lastMonth ? lastMonth : next);
                }}>
                {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
                  const year = lastYear - index;
                  return <option key={year} value={year} disabled={!!lastMonth && year > lastMonth.getFullYear()}>{year}</option>;
                })}
              </select>
            </div>
            <button type="button" aria-label="Next month" aria-disabled={!!lastMonth && month >= lastMonth} className={`${buttonStyle} size-9 aria-disabled:cursor-not-allowed aria-disabled:opacity-30`} onClick={() => { if (!lastMonth || month < lastMonth) setMonth(addMonths(month, 1)); }}>→</button>
          </div>
          <div className="grid grid-cols-7 text-center">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day} className="py-2 text-xs font-medium text-[#66545d]">{day}</span>)}
            {Array.from({ length: 42 }, (_, index) => {
              const day = addDays(first, index);
              const iso = format(day, "yyyy-MM-dd");
              return <button key={iso} type="button" data-day={iso} disabled={!!max && iso > max} aria-label={format(day, "EEEE, d MMMM yyyy")} aria-pressed={iso === value}
                className={`${buttonStyle} aspect-square ${iso === value ? "bg-[#ddcbb0] font-semibold text-slate-950" : day.getMonth() === month.getMonth() ? "text-slate-900" : "text-slate-400"} ${iso === today ? "underline decoration-[#a4834e] underline-offset-4" : ""}`}
                onKeyDown={(event) => {
                  const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
                  if (offset === undefined) return;
                  event.preventDefault();
                  const target = format(addDays(day, offset), "yyyy-MM-dd");
                  if (max && target > max) return;
                  const next = panel.current?.querySelector<HTMLButtonElement>(`[data-day="${target}"]`);
                  if (next) next.focus();
                }} onClick={() => choose(iso)}>{day.getDate()}</button>;
            })}
          </div>
          {time && onTimeChange && (
            <div className="mt-3 flex items-center gap-2 border-t border-[#eee9e2] pt-3">
              <span className="mr-auto text-xs text-[#66545d]">Time</span>
              <select aria-label={`${id} hour`} className="rounded-lg border border-[#d9cfc1] bg-white px-2 py-1.5 text-sm focus:outline-[#92754e]" value={time.slice(0, 2)} onChange={(event) => onTimeChange(`${event.target.value}:${time.slice(3, 5)}`)}>
                {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((hour) => <option key={hour}>{hour}</option>)}
              </select>
              <span aria-hidden="true">:</span>
              <select aria-label={`${id} minute`} className="rounded-lg border border-[#d9cfc1] bg-white px-2 py-1.5 text-sm focus:outline-[#92754e]" value={time.slice(3, 5)} onChange={(event) => onTimeChange(`${time.slice(0, 2)}:${event.target.value}`)}>
                {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => <option key={minute}>{minute}</option>)}
              </select>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-[#eee9e2] pt-2">
            <button type="button" className={`${buttonStyle} px-3 py-2 font-semibold text-[#92754e]`} onClick={() => choose("")}>Clear</button>
            <button type="button" className={`${buttonStyle} px-3 py-2 font-semibold text-[#92754e]`} disabled={!!max && today > max} onClick={() => choose(today)}>Today</button>
            {time && <button type="button" className={`${buttonStyle} px-3 py-2 font-semibold text-[#92754e]`} onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button>}
          </div>
        </div>
      )}
    </div>
  );
}
