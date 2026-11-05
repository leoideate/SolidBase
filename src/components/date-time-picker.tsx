"use client";

import { useEffect, useRef, useState } from "react";
import { DatePicker } from "./date-picker";

/** Date and minute-precision Dublin wall time; the server performs timezone conversion. */
export function DateTimePicker({ id, name, defaultValue = "", today, required = false, min, max }: {
  id: string; name: string; defaultValue?: string; today: string; required?: boolean; min?: string; max?: string;
}) {
  const initialDate = defaultValue.slice(0, 10);
  const initialHour = defaultValue.slice(11, 13) || "00";
  const initialMinute = defaultValue.slice(14, 16) || "00";
  const [date, setDate] = useState(initialDate);
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = root.current?.closest("form");
    function reset(event: Event) {
      queueMicrotask(() => {
        if (!event.defaultPrevented) {
          setDate(initialDate); setHour(initialHour); setMinute(initialMinute);
        }
      });
    }
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initialDate, initialHour, initialMinute]);
  return (
    <div ref={root} className="relative min-w-0 space-y-2">
      <input type="datetime-local" name={name} value={date ? `${date}T${hour}:${minute}` : ""}
        min={min} max={max} required={required} tabIndex={-1} aria-label="Selected date and time"
        className="pointer-events-none absolute inset-x-0 top-0 h-11 w-full opacity-0" onChange={() => {}} />
      <DatePicker id={id} name={`${name}Date`} defaultValue={initialDate} today={today} required={required} onValueChange={setDate} portal
        time={`${hour}:${minute}`} onTimeChange={(time) => { setHour(time.slice(0, 2)); setMinute(time.slice(3, 5)); }} />
    </div>
  );
}
