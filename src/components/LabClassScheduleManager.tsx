import React, { useState } from "react"
import { BookOpen, Plus, Trash2, Clock, Calendar, Check, AlertCircle } from "lucide-react"
import type { LabInfo, LabClassSession, WeekDay } from "../types/signage"
import { TIME_INTERVALS_15_MIN, getActiveClassForLab, isTimeInRange } from "../utils/labHours"
import type { SyncEngine } from "../services/syncEngine"

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
      alert("Please enter a class name (e.g. CSC 151)")
      return
    }
    if (selectedDays.length === 0) {
      alert("Please select at least one day for this class.")
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
    if (confirm(`Remove "${name}" from Lab ${lab.id} class schedule?`)) {
      engine.removeClassSession(lab.id, classId)
    }
  }

  return (
    <div className="pt-3 border-t border-slate-700/80 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Class Schedule (Room In-Class Periods)
          </h4>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-2 py-1 rounded bg-[#02275A] hover:bg-[#02275A]/80 text-white text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <Plus className="w-3 h-3" />
          <span>{showAddForm ? "Cancel" : "Add Class"}</span>
        </button>
      </div>

      <p className="text-[10px] text-slate-400">
        When a class is in session at the current day and time, the TV board will automatically switch status to{" "}
        <span className="text-amber-400 font-bold">IN CLASS</span>.
      </p>

      {/* Active in-session alert if currently in class */}
      {activeClassNow && (
        <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center gap-2 text-amber-300 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping flex-shrink-0" />
          <span>
            Class in session now: <strong className="text-white">{activeClassNow.className}</strong> ({activeClassNow.startTime} – {activeClassNow.endTime})
          </span>
        </div>
      )}

      {/* Add New Class Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddClass}
          className="p-3 rounded-lg bg-slate-950/80 border border-slate-700 space-y-3 shadow-inner"
        >
          <div className="text-xs font-extrabold text-sky-400 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule New Class for Room {lab.id}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                Class Name / Course *
              </label>
              <input
                type="text"
                placeholder="e.g. CSC 151: Computer Science I"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#02275A]"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                Instructor (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. Adams"
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#02275A]"
              />
            </div>
          </div>

          {/* Days Selection */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
              Class Days
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {ALL_DAYS.map((day) => {
                const isSelected = selectedDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#02275A] text-white shadow-sm"
                        : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 15-Minute Interval Times */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
              Class Time (15-Minute Intervals)
            </label>
            <div className="flex items-center gap-2">
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-[#02275A] cursor-pointer"
              >
                {TIME_INTERVALS_15_MIN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <span className="text-slate-400 font-bold">to</span>

              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-[#02275A] cursor-pointer"
              >
                {TIME_INTERVALS_15_MIN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1 rounded bg-[#02275A] hover:bg-[#02275A]/90 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Class</span>
            </button>
          </div>
        </form>
      )}

      {/* Class List */}
      {classes.length === 0 ? (
        <div className="p-3 rounded-lg bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs text-slate-500 italic">
          No classes scheduled for Room {lab.id}. Click "Add Class" to input class times.
        </div>
      ) : (
        <div className="space-y-1.5">
          {classes.map((c) => {
            const isActiveNow =
              activeClassNow?.id === c.id ||
              (c.days.includes(
                (ALL_DAYS[new Date().getDay() - 1] as WeekDay) || "Mon",
              ) &&
                isTimeInRange(c.startTime, c.endTime))

            return (
              <div
                key={c.id}
                className={`flex items-center justify-between p-2 rounded-lg border transition-all text-xs ${
                  isActiveNow
                    ? "bg-amber-500/10 border-amber-500/40 shadow-sm"
                    : "bg-slate-800/60 hover:bg-slate-800 border-slate-700/60"
                }`}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white truncate">
                      {c.className}
                    </span>
                    {isActiveNow && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black font-black text-[9px] uppercase tracking-wider animate-pulse flex-shrink-0">
                        In Session
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span className="font-mono text-sky-300 font-bold">
                      {c.days.join(", ")}
                    </span>
                    <span>•</span>
                    <span className="font-mono text-slate-300">
                      {c.startTime} – {c.endTime}
                    </span>
                    {c.instructor && (
                      <>
                        <span>•</span>
                        <span className="italic text-slate-400">
                          {c.instructor}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteClass(c.id, c.className)}
                  className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
                  title="Remove this class"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
