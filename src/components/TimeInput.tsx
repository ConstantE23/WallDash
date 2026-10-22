import React, { useEffect, useState } from "react"
import { formatTime, parseTimeParts, type Period } from "../utils/labHours"

interface TimeInputProps {
  /** Canonical time such as "8:00 AM". */
  value: string
  /** Called with a valid canonical time once the hour and minute are complete. */
  onChange: (value: string) => void
  /** Accessible name, e.g. "Mon – Thu opening time". */
  label: string
  disabled?: boolean
  /** Highlight as invalid (e.g. range error from the parent). */
  invalid?: boolean
}

const boxClass =
  "w-11 rounded-md border bg-white px-1.5 py-2 text-center text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 disabled:bg-slate-50"

/**
 * Typed 12-hour time: hour box (1–12), minute box (00–59) and an AM/PM switch.
 * Keystrokes that would make an out-of-range value are ignored.
 */
export default function TimeInput({
  value,
  onChange,
  label,
  disabled = false,
  invalid = false,
}: TimeInputProps) {
  const parsed = parseTimeParts(value)
  const [hour, setHour] = useState(parsed ? String(parsed.hour) : "")
  const [minute, setMinute] = useState(
    parsed ? String(parsed.minute).padStart(2, "0") : "",
  )
  const [period, setPeriod] = useState<Period>(parsed?.period ?? "AM")

  // Follow outside changes (e.g. another staff member edited the hours).
  useEffect(() => {
    const next = parseTimeParts(value)
    if (!next) return
    setHour(String(next.hour))
    setMinute(String(next.minute).padStart(2, "0"))
    setPeriod(next.period)
  }, [value])

  const hourNum = Number(hour)
  const minuteNum = Number(minute)
  const hourValid = hour !== "" && hourNum >= 1 && hourNum <= 12
  const minuteValid = minute !== "" && minuteNum >= 0 && minuteNum <= 59

  const commit = (h = hour, m = minute, p = period) => {
    const hn = Number(h)
    const mn = Number(m)
    if (h === "" || m === "" || hn < 1 || hn > 12 || mn > 59) return
    const next = formatTime(hn, mn, p)
    if (next !== value) onChange(next)
  }

  const handleHour = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2)
    if (digits !== "" && Number(digits) > 12) return
    setHour(digits)
  }

  const handleMinute = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2)
    if (digits !== "" && Number(digits) > 59) return
    setMinute(digits)
  }

  const borderClass = (ok: boolean) =>
    ok && !invalid
      ? "border-slate-300 focus:border-[#02275A] focus:ring-[#02275A]/15"
      : "border-red-400 focus:border-red-500 focus:ring-red-500/15"

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={hour}
        disabled={disabled}
        placeholder="hh"
        aria-label={`${label} hour`}
        aria-invalid={!hourValid}
        onChange={(e) => handleHour(e.target.value)}
        onBlur={() => commit()}
        className={`${boxClass} ${borderClass(hourValid)}`}
      />
      <span className="text-sm font-medium text-slate-500">:</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={minute}
        disabled={disabled}
        placeholder="mm"
        aria-label={`${label} minutes`}
        aria-invalid={!minuteValid}
        onChange={(e) => handleMinute(e.target.value)}
        onBlur={() => {
          if (minute.length === 1) setMinute(minute.padStart(2, "0"))
          commit(hour, minute.padStart(2, "0"))
        }}
        className={`${boxClass} ${borderClass(minuteValid)}`}
      />
      <div className="ml-1 inline-flex" role="group" aria-label={`${label} AM or PM`}>
        {(["AM", "PM"] as const).map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            aria-pressed={period === p}
            onClick={() => {
              setPeriod(p)
              commit(hour, minute, p)
            }}
            className={`border px-2 py-2 text-xs font-medium first:rounded-l-md last:rounded-r-md -ml-px first:ml-0 cursor-pointer ${
              period === p
                ? "relative z-10 border-[#02275A] bg-[#02275A] text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
