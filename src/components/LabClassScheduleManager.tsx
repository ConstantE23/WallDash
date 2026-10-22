import React, { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import type { LabInfo, LabClassSession, WeekDay } from "../types/signage"
import { TIME_INTERVALS_15_MIN, getActiveClassForLab, isTimeInRange } from "../utils/labHours"
import type { SyncEngine } from "../services/syncEngine"
import { ui } from "./manageStyles"

const ALL_DAYS: WeekDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri"]

interface LabClassScheduleManagerProps {
  lab: LabInfo
  engine: SyncEngine
}

export default function LabClassScheduleManager({
  lab,
  engine,
}: LabClassScheduleManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [className, setClassName] = useState("")
  const [instructor, setInstructor] = useState("")
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>(["Mon", "Wed"])
  const [startTime, setStartTime] = useState("10:00 AM")
  const [endTime, setEndTime] = useState("11:15 AM")

  const classes = lab.classes || []
  const activeClassNow = getActiveClassForLab(lab)

  const toggleDay = (day: WeekDay) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    )
  }

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault()
    if (!className.trim()) {
      alert("Enter a class name, e.g. CSC 151.")
      return
    }
    if (selectedDays.length === 0) {
      alert("Pick at least one day.")
      return
    }

    engine.addClassSession(lab.id, {
      className: className.trim(),
      instructor: instructor.trim() || undefined,
      days: selectedDays,
      startTime,
      endTime,
    })

    // Reset form
    setClassName("")
    setInstructor("")
    setShowAddForm(false)
  }

  const handleDeleteClass = (classId: string, name: string) => {
    if (confirm(`Remove "${name}" from the Lab ${lab.id} schedule?`)) {
      engine.removeClassSession(lab.id, classId)
    }
  }

  const todayKey = ALL_DAYS[new Date().getDay() - 1] as WeekDay | undefined

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Classes</h4>
          <p className={ui.hint}>
            While a class is in session, the TV shows this lab as "In Class".
          </p>
        </div>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className={ui.btnSecondary}
          >
            <Plus className="w-4 h-4" />
            Add class
          </button>
        )}
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddClass}
          className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={ui.label} htmlFor={`class-name-${lab.id}`}>
                Class name
              </label>
              <input
                id={`class-name-${lab.id}`}
                type="text"
                placeholder="CSC 151: Computer Science I"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className={ui.input}
              />
            </div>
            <div>
              <label className={ui.label} htmlFor={`class-instructor-${lab.id}`}>
                Instructor <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id={`class-instructor-${lab.id}`}
                type="text"
                placeholder="Dr. Adams"
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                className={ui.input}
              />
            </div>
          </div>

          <div>
            <span className={ui.label}>Days</span>
            <div className="flex gap-1.5 flex-wrap">
              {ALL_DAYS.map((day) => {
                const isSelected = selectedDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={isSelected}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium cursor-pointer ${
                      isSelected
                        ? "border-[#02275A] bg-[#02275A] text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span className={ui.label}>Time</span>
            <div className="flex items-center gap-2">
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-label="Start time"
                className={ui.select}
              >
                {TIME_INTERVALS_15_MIN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span className="text-sm text-slate-500">to</span>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="End time"
                className={ui.select}
              >
                {TIME_INTERVALS_15_MIN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className={ui.btnSecondary}
            >
              Cancel
            </button>
            <button type="submit" className={ui.btnPrimary}>
              Save class
            </button>
          </div>
        </form>
      )}

      {classes.length === 0 ? (
        <p className="text-sm text-slate-500">No classes scheduled.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {classes.map((c) => {
            const isActiveNow =
              activeClassNow?.id === c.id ||
              (!!todayKey &&
                c.days.includes(todayKey) &&
                isTimeInRange(c.startTime, c.endTime))

            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {c.className}
                    </span>
                    {isActiveNow && (
                      <span className={`${ui.badge} bg-amber-100 text-amber-800`}>
                        In session
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {c.days.join(", ")} · {c.startTime} – {c.endTime}
                    {c.instructor && ` · ${c.instructor}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteClass(c.id, c.className)}
                  className={ui.iconBtnDanger}
                  title="Remove class"
                  aria-label={`Remove ${c.className}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
