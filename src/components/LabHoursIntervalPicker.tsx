import React, { useState, useEffect } from "react"
import {
  TIME_INTERVALS_15_MIN,
  parseLabHoursRange,
  timeStringToMinutes,
} from "../utils/labHours"
import { Clock, Ban } from "lucide-react"

interface LabHoursIntervalPickerProps {
  label: string
  value: string
  onCommit: (val: string) => void
  disabled?: boolean
}

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

  const handleToggleClosed = () => {
    if (disabled) return
    const nextClosed = !isClosed
    setIsClosed(nextClosed)
    if (nextClosed) {
      onCommit("Closed")
    } else {
      onCommit(`${startTime} – ${endTime}`)
    }
  }

  const handleStartChange = (newStart: string) => {
    if (disabled) return
    setStartTime(newStart)
    if (!isClosed) {
      // Ensure end time is at least 15 mins after start time if possible
      const startMins = timeStringToMinutes(newStart) ?? 0
      const endMins = timeStringToMinutes(endTime) ?? 0
      if (endMins <= startMins && startMins + 60 < 1440) {
        // Automatically nudge end time to at least 1 hour later
        const nextEndMins = Math.min(startMins + 60, 1425)
        const h = Math.floor(nextEndMins / 60)
        const m = nextEndMins % 60
        const ampm = h >= 12 ? "PM" : "AM"
        const hour12 = h % 12 === 0 ? 12 : h % 12
        const autoEnd = `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`
        setEndTime(autoEnd)
        onCommit(`${newStart} – ${autoEnd}`)
        return
      }
      onCommit(`${newStart} – ${endTime}`)
    }
  }

  const handleEndChange = (newEnd: string) => {
    if (disabled) return
    setEndTime(newEnd)
    if (!isClosed) {
      onCommit(`${startTime} – ${newEnd}`)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-800/90 p-2.5 rounded-lg border border-slate-700/80 text-xs">
      {/* Label & Closed toggle badge */}
      <div className="flex items-center justify-between sm:justify-start gap-2 min-w-[100px]">
        <span className="font-bold text-slate-200 tracking-wide">{label}:</span>
        <button
          type="button"
          onClick={handleToggleClosed}
          disabled={disabled}
          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
            isClosed
              ? "bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30"
              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
          }`}
          title={isClosed ? "Click to set open hours" : "Click to mark Closed"}
        >
          {isClosed ? (
            <>
              <Ban className="w-2.5 h-2.5" />
              <span>Closed</span>
            </>
          ) : (
            <>
              <Clock className="w-2.5 h-2.5" />
              <span>Scheduled</span>
            </>
          )}
        </button>
      </div>

      {/* 15-Minute Interval Dropdowns */}
      {isClosed ? (
        <div className="flex items-center justify-between sm:justify-end gap-2 text-slate-400 italic text-[11px] py-1">
          <span>Lab closed on this schedule</span>
          <button
            type="button"
            onClick={handleToggleClosed}
            disabled={disabled}
            className="text-[10px] not-italic font-bold text-sky-400 hover:text-sky-300 underline cursor-pointer"
          >
            Open with hours
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
          {/* Start Time (15-min intervals) */}
          <div className="relative">
            <select
              value={startTime}
              disabled={disabled}
              onChange={(e) => handleStartChange(e.target.value)}
              className="bg-slate-900 border border-slate-700 hover:border-sky-500 text-white rounded px-2 py-1 text-xs font-mono font-medium focus:outline-none focus:border-[#02275A] cursor-pointer"
            >
              {TIME_INTERVALS_15_MIN.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <span className="text-slate-400 font-bold px-0.5">–</span>

          {/* End Time (15-min intervals) */}
          <div className="relative">
            <select
              value={endTime}
              disabled={disabled}
              onChange={(e) => handleEndChange(e.target.value)}
              className="bg-slate-900 border border-slate-700 hover:border-sky-500 text-white rounded px-2 py-1 text-xs font-mono font-medium focus:outline-none focus:border-[#02275A] cursor-pointer"
            >
              {TIME_INTERVALS_15_MIN.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
