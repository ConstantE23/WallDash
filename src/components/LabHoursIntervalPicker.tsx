import React, { useState, useEffect } from "react"
import { parseLabHoursRange, isValidLabHours, HOURS_SEPARATOR } from "../utils/labHours"
import TimeInput from "./TimeInput"

interface LabHoursIntervalPickerProps {
  label: string
  value: string
  onCommit: (val: string) => void
  disabled?: boolean
}

/**
 * One row of lab hours: an "Open" checkbox plus typed opening and closing times.
 * Only valid ranges ("h:mm AM – h:mm PM" with different times) are saved.
 */
export default function LabHoursIntervalPicker({
  label,
  value,
  onCommit,
  disabled = false,
}: LabHoursIntervalPickerProps) {
  const parsed = parseLabHoursRange(value)
  const [isClosed, setIsClosed] = useState(parsed.isClosed)
  const [startTime, setStartTime] = useState(parsed.start)
  const [endTime, setEndTime] = useState(parsed.end)

  useEffect(() => {
    const updated = parseLabHoursRange(value)
    setIsClosed(updated.isClosed)
    setStartTime(updated.start)
    setEndTime(updated.end)
  }, [value])

  const sameTime = startTime === endTime

  const commitRange = (start: string, end: string) => {
    const next = `${start}${HOURS_SEPARATOR}${end}`
    if (isValidLabHours(next) && next !== value) onCommit(next)
  }

  const handleToggleClosed = () => {
    if (disabled) return
    const nextClosed = !isClosed
    setIsClosed(nextClosed)
    if (nextClosed) {
      onCommit("Closed")
    } else {
      commitRange(startTime, endTime)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
      <span className="w-20 text-sm font-medium text-slate-700">{label}</span>

      <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!isClosed}
          disabled={disabled}
          onChange={handleToggleClosed}
          className="h-4 w-4 rounded border-slate-300 accent-[#02275A]"
        />
        Open
      </label>

      {isClosed ? (
        <span className="text-sm text-slate-500">Closed</span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <TimeInput
            label={`${label} opening time`}
            value={startTime}
            disabled={disabled}
            invalid={sameTime}
            onChange={(t) => {
              setStartTime(t)
              commitRange(t, endTime)
            }}
          />
          <span className="text-sm text-slate-500">to</span>
          <TimeInput
            label={`${label} closing time`}
            value={endTime}
            disabled={disabled}
            invalid={sameTime}
            onChange={(t) => {
              setEndTime(t)
              commitRange(startTime, t)
            }}
          />
          {sameTime && (
            <span className="text-xs text-red-600" role="alert">
              Opening and closing times must be different.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
