import React, { useState, useEffect } from "react"
import {
  Clock,
  CloudSun,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldAlert,
  GraduationCap,
  Sparkles,
} from "lucide-react"
import type { LabInfo, EventAnnouncement, WeekDay } from "../types/signage"
import WeatherForecast from "./WeatherForecast"
import {
  getEffectiveLabStatus,
  getTodayLabHours,
  getActiveClassForLab,
  getTodayClassesForLab,
} from "../utils/labHours"

interface RightPanelProps {
  labs: { [key: number]: LabInfo }
  events?: EventAnnouncement[]
  isTvMode?: boolean
  onToggleLabStatus?: (labId: number) => void
  onOpenController?: () => void
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const DAY_ABBRS: WeekDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri"]

// Stable badge color per course name, so each course always looks the same.
const COURSE_BADGE_CLASSES = [
  "bg-blue-100 text-[#02275A] border border-blue-200",
  "bg-purple-100 text-purple-700 border border-purple-200",
  "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "bg-amber-100 text-amber-800 border border-amber-200",
  "bg-rose-100 text-rose-700 border border-rose-200",
]

function courseBadgeClass(course: string): string {
  let hash = 0
  for (const ch of course) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return COURSE_BADGE_CLASSES[hash % COURSE_BADGE_CLASSES.length]
}

export default function RightPanel({
  labs,
  isTvMode = true,
  onToggleLabStatus,
  onOpenController,
}: RightPanelProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const hours = time.getHours()
  const minutes = time.getMinutes().toString().padStart(2, "0")
  const seconds = time.getSeconds().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  const displayHour = (hours % 12 || 12).toString().padStart(2, "0")

  const dayName = DAYS[time.getDay()]
  const monthName = MONTHS[time.getMonth()]
  const dateNum = time.getDate()
  const year = time.getFullYear()

  const todayAbbr: WeekDay = (() => {
    const d = time.getDay()
    if (d >= 1 && d <= 5) return DAY_ABBRS[d - 1]
    return "Mon"
  })()

  const [selectedTutorDay, setSelectedTutorDay] = useState<WeekDay>(todayAbbr)

  // Auto-cycle through M-F days on unattended TV if not manually clicked
  useEffect(() => {
    if (!isTvMode) return
    const cycleTimer = setInterval(() => {
      setSelectedTutorDay((prev) => {
        const nextIdx = (DAY_ABBRS.indexOf(prev) + 1) % DAY_ABBRS.length
        return DAY_ABBRS[nextIdx]
      })
    }, 8000)
    return () => clearInterval(cycleTimer)
  }, [isTvMode])

  const lab126 = labs[126]
  const lab127 = labs[127]

  const getStatusBadge = (status: LabInfo["status"]) => {
    switch (status) {
      case "Open":
        return {
          bg: "bg-emerald-500/20 border-emerald-400 text-emerald-300",
          dot: "bg-emerald-400 shadow-[0_0_10px_#10b981]",
          label: "OPEN",
          icon: CheckCircle2,
        }
      case "Closed":
        return {
          bg: "bg-red-500/20 border-red-400 text-red-300",
          dot: "bg-red-400 shadow-[0_0_10px_#ef4444]",
          label: "CLOSED",
          icon: XCircle,
        }
      case "In Class":
        return {
          bg: "bg-amber-500/20 border-amber-400 text-amber-300",
          dot: "bg-amber-400 shadow-[0_0_10px_#f59e0b]",
          label: "IN CLASS",
          icon: AlertCircle,
        }
      case "Reserved":
        return {
          bg: "bg-purple-500/20 border-purple-400 text-purple-300",
          dot: "bg-purple-400 shadow-[0_0_10px_#a855f7]",
          label: "RESERVED",
          icon: ShieldAlert,
        }
      default:
        return {
          bg: "bg-blue-500/20 border-blue-400 text-blue-300",
          dot: "bg-blue-400 shadow-[0_0_10px_#3b82f6]",
          label: status,
          icon: Sparkles,
        }
    }
  }

  return (
    <aside className="w-full h-full flex flex-col bg-[#F3F8FC] select-none overflow-hidden text-[#02275A]">
      {/* 1. DAY and TIME section matching mockup */}
      <div className="flex items-center justify-between px-4 sm:px-5 bg-[#02275A] h-12 md:h-14 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-white/95" />
          <span className="text-white uppercase tracking-widest font-extrabold text-xs md:text-sm">
            Day & Time
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded text-white/90 text-[10px] font-bold font-mono">
          <CloudSun className="w-3.5 h-3.5 text-white/90" />
          <span>Hampton, VA</span>
        </div>
      </div>

      {/* Column content area with border-l below the unbroken header bar */}
      <div className="flex-1 min-h-0 flex flex-col border-l border-[#02275A]/20 overflow-hidden">

      <div className="flex-shrink-0 flex flex-col items-center justify-center py-3.5 px-4 bg-gradient-to-b from-[#EBF3FB] via-[#F3F8FC] to-[#F3F8FC] border-b border-[#02275A]/15">
        {/* Big Clock Numerals */}
        <div className="flex items-baseline justify-center font-black tracking-tight my-1 text-[#02275A] tabular-nums">
          <span className="text-3xl sm:text-4xl lg:text-5xl tracking-wide font-black text-[#02275A]">
            {displayHour}:{minutes}
          </span>
          <span className="text-base sm:text-lg lg:text-xl text-[#02275A] font-bold ml-1.5 mr-2">
            :{seconds}
          </span>
          <span className="text-xs sm:text-sm font-black bg-[#02275A] text-white px-2 py-0.5 rounded shadow-xs tracking-wider">
            {ampm}
          </span>
        </div>

        {/* Date line */}
        <div className="flex items-center gap-1.5 text-center mt-0.5">
          <span className="text-[#02275A] font-extrabold text-xs sm:text-sm tracking-wide">
            {dayName},
          </span>
          <span className="text-[#02275A] font-semibold text-xs sm:text-sm">
            {monthName} {dateNum}, {year}
          </span>
        </div>

        {/* Live weather + forecast of the day */}
        <WeatherForecast />
      </div>

      {/* Scrollable Labs & Room Status Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3.5 scrollbar-hide">
        {/* Lab 126 Card matching Figma Mockup */}
        {lab126 && (
          <div className="rounded-xl overflow-hidden bg-white border border-[#02275A]/20 shadow-xs">
            {/* Header: 126 LAB HOURS with inline status badge */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#02275A] border-b border-[#02275A]/20">
              <span className="text-white uppercase font-extrabold tracking-wider text-[11px] md:text-xs">
                126 Lab Hours
              </span>
              <div className="flex items-center gap-1.5">
                {(() => {
                  const effectiveStatus = getEffectiveLabStatus(lab126, time)
                  const badge = getStatusBadge(effectiveStatus)
                  return (
                    <div
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded border font-extrabold text-[10px] tracking-wider ${badge.bg}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}
                      />
                      <span>{badge.label}</span>
                    </div>
                  )
                })()}
                {!isTvMode && onToggleLabStatus && (
                  <button
                    onClick={() => onToggleLabStatus(126)}
                    className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-[9px] font-bold text-white/90 border border-white/15 transition-all cursor-pointer"
                  >
                    Toggle
                  </button>
                )}
              </div>
            </div>

            {/* Schedule details */}
            <div className="p-3 bg-white">
              {(() => {
                const today = getTodayLabHours(lab126.hours, time)
                const activeClass = getActiveClassForLab(lab126, time)
                const todayClasses = getTodayClassesForLab(lab126, time)
                return (
                  <>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                      <div
                        className={`flex flex-col p-1 rounded transition-colors ${
                          today.dayKey === "monThu"
                            ? "bg-[#02275A]/8 border border-[#02275A]/20"
                            : ""
                        }`}
                      >
                        <span
                          className={`uppercase text-[8px] sm:text-[9px] font-bold tracking-wider ${
                            today.dayKey === "monThu"
                              ? "text-[#02275A]"
                              : "text-slate-500"
                          }`}
                        >
                          Mon – Thu
                        </span>
                        <span className="font-extrabold text-[#02275A] text-[10px] sm:text-[11px] leading-tight">
                          {lab126.hours.monThu}
                        </span>
                      </div>
                      <div
                        className={`flex flex-col p-1 rounded transition-colors ${
                          today.dayKey === "fri"
                            ? "bg-[#02275A]/8 border border-[#02275A]/20"
                            : ""
                        }`}
                      >
                        <span
                          className={`uppercase text-[8px] sm:text-[9px] font-bold tracking-wider ${
                            today.dayKey === "fri"
                              ? "text-[#02275A]"
                              : "text-slate-500"
                          }`}
                        >
                          Fri
                        </span>
                        <span className="font-extrabold text-[#02275A] text-[10px] sm:text-[11px] leading-tight">
                          {lab126.hours.fri}
                        </span>
                      </div>
                      <div
                        className={`flex flex-col p-1 rounded transition-colors ${
                          today.dayKey === "weekend"
                            ? "bg-[#02275A]/8 border border-[#02275A]/20"
                            : ""
                        }`}
                      >
                        <span
                          className={`uppercase text-[8px] sm:text-[9px] font-bold tracking-wider ${
                            today.dayKey === "weekend"
                              ? "text-[#02275A]"
                              : "text-slate-500"
                          }`}
                        >
                          Weekend
                        </span>
                        <span className="font-extrabold text-[#02275A] text-[10px] sm:text-[11px] leading-tight">
                          {lab126.hours.weekend || "Closed"}
                        </span>
                      </div>
                    </div>

                    {/* Active class taking the room */}
                    {activeClass && (
                      <div className="mt-2.5 pt-2 border-t border-[#02275A]/15 flex items-center justify-between text-[10px] bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/30">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping flex-shrink-0" />
                          <span className="font-extrabold text-[#02275A] text-[11px] truncate">
                            {activeClass.className}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-amber-800 text-[10px] flex-shrink-0 ml-1.5">
                          {activeClass.startTime} – {activeClass.endTime}
                        </span>
                      </div>
                    )}

                    {/* Today's upcoming classes if not currently in class */}
                    {!activeClass && todayClasses.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-[#02275A]/15 flex items-center justify-between text-[9px]">
                        <span className="font-bold uppercase tracking-wider text-[8.5px] text-slate-500">
                          Today's Class:
                        </span>
                        <span className="font-semibold text-[#02275A] truncate ml-1">
                          {todayClasses[0].className} ({todayClasses[0].startTime})
                        </span>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* Lab 127 Card with inline live status badge */}
        {lab127 && (
          <div className="rounded-xl overflow-hidden bg-white border border-[#02275A]/20 shadow-xs">
            {/* Header: 127 LAB HOURS with inline status badge */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#02275A] border-b border-[#02275A]/20">
              <span className="text-white uppercase font-extrabold tracking-wider text-[11px] md:text-xs">
                127 Lab Hours
              </span>
              <div className="flex items-center gap-1.5">
                {(() => {
                  const effectiveStatus = getEffectiveLabStatus(lab127, time)
                  const badge = getStatusBadge(effectiveStatus)
                  return (
                    <div
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded border font-extrabold text-[10px] tracking-wider ${badge.bg}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}
                      />
                      <span>{badge.label}</span>
                    </div>
                  )
                })()}
                {!isTvMode && onToggleLabStatus && (
                  <button
                    onClick={() => onToggleLabStatus(127)}
                    className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-[9px] font-bold text-white/90 border border-white/15 transition-all cursor-pointer"
                  >
                    Toggle
                  </button>
                )}
              </div>
            </div>

            {/* Schedule details */}
            <div className="p-3 bg-white">
              {(() => {
                const today = getTodayLabHours(lab127.hours, time)
                const activeClass = getActiveClassForLab(lab127, time)
                const todayClasses = getTodayClassesForLab(lab127, time)
                return (
                  <>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                      <div
                        className={`flex flex-col p-1 rounded transition-colors ${
                          today.dayKey === "monThu"
                            ? "bg-[#02275A]/8 border border-[#02275A]/20"
                            : ""
                        }`}
                      >
                        <span
                          className={`uppercase text-[8px] sm:text-[9px] font-bold tracking-wider ${
                            today.dayKey === "monThu"
                              ? "text-[#02275A]"
                              : "text-slate-500"
                          }`}
                        >
                          Mon – Thu
                        </span>
                        <span className="font-extrabold text-[#02275A] text-[10px] sm:text-[11px] leading-tight">
                          {lab127.hours.monThu}
                        </span>
                      </div>
                      <div
                        className={`flex flex-col p-1 rounded transition-colors ${
                          today.dayKey === "fri"
                            ? "bg-[#02275A]/8 border border-[#02275A]/20"
                            : ""
                        }`}
                      >
                        <span
                          className={`uppercase text-[8px] sm:text-[9px] font-bold tracking-wider ${
                            today.dayKey === "fri"
                              ? "text-[#02275A]"
                              : "text-slate-500"
                          }`}
                        >
                          Fri
                        </span>
                        <span className="font-extrabold text-[#02275A] text-[10px] sm:text-[11px] leading-tight">
                          {lab127.hours.fri}
                        </span>
                      </div>
                      <div
                        className={`flex flex-col p-1 rounded transition-colors ${
                          today.dayKey === "weekend"
                            ? "bg-[#02275A]/8 border border-[#02275A]/20"
                            : ""
                        }`}
                      >
                        <span
                          className={`uppercase text-[8px] sm:text-[9px] font-bold tracking-wider ${
                            today.dayKey === "weekend"
                              ? "text-[#02275A]"
                              : "text-slate-500"
                          }`}
                        >
                          Weekend
                        </span>
                        <span className="font-extrabold text-[#02275A] text-[10px] sm:text-[11px] leading-tight">
                          {lab127.hours.weekend || "Closed"}
                        </span>
                      </div>
                    </div>

                    {/* Active class taking the room */}
                    {activeClass && (
                      <div className="mt-2.5 pt-2 border-t border-[#02275A]/15 flex items-center justify-between text-[10px] bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/30">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping flex-shrink-0" />
                          <span className="font-extrabold text-[#02275A] text-[11px] truncate">
                            {activeClass.className}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-amber-800 text-[10px] flex-shrink-0 ml-1.5">
                          {activeClass.startTime} – {activeClass.endTime}
                        </span>
                      </div>
                    )}

                    {/* Today's upcoming classes if not currently in class */}
                    {!activeClass && todayClasses.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-[#02275A]/15 flex items-center justify-between text-[9px]">
                        <span className="font-bold uppercase tracking-wider text-[8.5px] text-slate-500">
                          Today's Class:
                        </span>
                        <span className="font-semibold text-[#02275A] truncate ml-1">
                          {todayClasses[0].className} ({todayClasses[0].startTime})
                        </span>
                      </div>
                    )}
                  </>
                )
              })()}

              {/* Tutoring Schedule for Intro to Programming (151) & Data Structures One (M-F) */}
              <div className="pt-2.5 mt-2.5 border-t border-[#02275A]/15 space-y-2">
                <div className="flex items-center">
                  <span className="text-[#02275A] uppercase text-[8px] sm:text-[9px] font-extrabold tracking-wider flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5 text-[#02275A]" />
                    <span>Tutoring Schedule</span>
                  </span>
                </div>

                {/* Day selector pills M-F */}
                <div className="grid grid-cols-5 gap-1 bg-[#EDF4FA] p-1 rounded-lg border border-[#02275A]/15">
                  {DAY_ABBRS.map((d) => {
                    const isSelected = selectedTutorDay === d
                    const isToday = todayAbbr === d
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSelectedTutorDay(d)}
                        className={`py-1 rounded text-center transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#02275A] text-white font-extrabold shadow-xs"
                            : "text-[#02275A]/70 hover:text-[#02275A] hover:bg-white font-bold"
                        }`}
                      >
                        <span className="text-[10px] block leading-tight">
                          {d}
                        </span>
                        {isToday && (
                          <span className="block text-[6.5px] text-emerald-600 font-extrabold uppercase">
                            Today
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Tutor shifts for the selected day */}
                <div className="space-y-1">
                  {(() => {
                    const shifts = (lab127.tutorShifts || []).filter(
                      (s) => s.day === selectedTutorDay,
                    )

                    if (shifts.length === 0) {
                      return (
                        <div className="text-[10px] text-slate-500 bg-[#F8FBFE] p-2.5 rounded-lg text-center italic border border-dashed border-[#02275A]/20">
                          No tutors scheduled for {selectedTutorDay}
                        </div>
                      )
                    }

                    return shifts.map((shift) => {
                      return (
                        <div
                          key={shift.id}
                          className="flex items-center justify-between text-[10px] bg-[#F8FBFE] hover:bg-white px-2.5 py-1.5 rounded-lg border border-[#02275A]/15 transition-colors shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-extrabold text-[#02275A] text-[11px] truncate">
                              {shift.tutorName}
                            </span>
                            <span
                              className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider flex-shrink-0 truncate max-w-[45%] ${courseBadgeClass(shift.course)}`}
                            >
                              {shift.course}
                            </span>
                          </div>
                          <span className="text-[#02275A] font-bold text-[9px] sm:text-[10px] font-mono flex-shrink-0 ml-1.5">
                            {shift.time}
                          </span>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isTvMode && onOpenController && (
          <button
            onClick={onOpenController}
            className="w-full py-2 px-3 rounded-lg bg-[#02275A] hover:bg-[#02275A]/85 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer active:scale-98"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Open Staff Live Controller</span>
          </button>
        )}
      </div>
      </div>
    </aside>
  )
}
