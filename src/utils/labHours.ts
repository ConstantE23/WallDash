import type { LabInfo, LabStatus, LabClassSession, WeekDay } from "../types/signage"

/**
 * Generates all 15-minute intervals in a 24-hour day in 12-hour AM/PM format.
 * (e.g. 12:00 AM, 12:15 AM, ..., 11:45 PM)
 */
export const TIME_INTERVALS_15_MIN: string[] = (() => {
  const times: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const ampm = h >= 12 ? "PM" : "AM"
      const hour12 = h % 12 === 0 ? 12 : h % 12
      const minStr = m.toString().padStart(2, "0")
      times.push(`${hour12}:${minStr} ${ampm}`)
    }
  }
  return times
})()

/**
 * Parses a 12-hour AM/PM time string into minutes from midnight (0..1439).
 */
export function timeStringToMinutes(timeStr: string): number | null {
  if (!timeStr) return null
  const cleaned = timeStr.trim().toUpperCase()
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/)
  if (!match) return null

  let hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  const ampm = match[3]

  if (ampm === "PM" && hour !== 12) hour += 12
  if (ampm === "AM" && hour === 12) hour = 0

  return hour * 60 + minute
}

export type Period = "AM" | "PM"

/** Separator used between opening and closing time, e.g. "8:00 AM – 10:00 PM". */
export const HOURS_SEPARATOR = " – "

/** Canonical 12-hour time, e.g. formatTime(8, 5, "AM") → "8:05 AM". */
export function formatTime(hour12: number, minute: number, period: Period): string {
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`
}

/** Splits "8:05 AM" into parts; null unless hours are 1–12 and minutes 0–59. */
export function parseTimeParts(
  timeStr: string,
): { hour: number; minute: number; period: Period } | null {
  const match = timeStr?.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/)
  if (!match) return null
  const hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  if (hour < 1 || hour > 12 || minute > 59) return null
  return { hour, minute, period: match[3] as Period }
}

/** Returns the canonical form of a valid time string, or null if it's invalid. */
export function normalizeTimeString(timeStr: string): string | null {
  const parts = parseTimeParts(timeStr)
  return parts ? formatTime(parts.hour, parts.minute, parts.period) : null
}

/**
 * Lab hours must be "Closed" or "h:mm AM – h:mm PM" with valid, different times.
 * Mirrors public.is_valid_lab_hours() in supabase/migrations/0002_validate_lab_hours.sql.
 */
export function isValidLabHours(hours: string): boolean {
  if (hours === "Closed") return true
  const parts = hours.split(HOURS_SEPARATOR)
  if (parts.length !== 2) return false
  const start = normalizeTimeString(parts[0])
  const end = normalizeTimeString(parts[1])
  return start === parts[0] && end === parts[1] && start !== end
}

/**
 * Checks if current time is within a specific start and end time.
 */
export function isTimeInRange(startTimeStr: string, endTimeStr: string, now: Date = new Date()): boolean {
  const startMins = timeStringToMinutes(startTimeStr)
  const endMins = timeStringToMinutes(endTimeStr)
  if (startMins === null || endMins === null) return false

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  if (startMins < endMins) {
    return currentMinutes >= startMins && currentMinutes < endMins
  }
  return currentMinutes >= startMins || currentMinutes < endMins
}

/**
 * Finds the nearest 15-minute interval in TIME_INTERVALS_15_MIN for a given string.
 */
export function matchNearestInterval(timeStr: string, defaultVal = "8:00 AM"): string {
  const mins = timeStringToMinutes(timeStr)
  if (mins === null) return defaultVal
  const roundedMins = Math.round(mins / 15) * 15 % 1440
  const h = Math.floor(roundedMins / 60)
  const m = roundedMins % 60
  const ampm = h >= 12 ? "PM" : "AM"
  const hour12 = h % 12 === 0 ? 12 : h % 12
  const minStr = m.toString().padStart(2, "0")
  return `${hour12}:${minStr} ${ampm}`
}

export interface ParsedHoursRange {
  isClosed: boolean
  start: string
  end: string
  startMinutes?: number
  endMinutes?: number
}

/**
 * Parses a lab hours string such as "8:00 AM – 10:00 PM" or "Closed".
 */
export function parseLabHoursRange(hoursStr: string): ParsedHoursRange {
  if (!hoursStr || hoursStr.trim().toLowerCase().includes("closed")) {
    return {
      isClosed: true,
      start: "8:00 AM",
      end: "10:00 PM",
    }
  }

  // Split on dash, en-dash, em-dash, or "to"
  const parts = hoursStr.split(/[–—\-]|(?:\s+to\s+)/i)
  if (parts.length >= 2) {
    const rawStart = parts[0].trim()
    const rawEnd = parts[1].trim()
    const startMins = timeStringToMinutes(rawStart)
    const endMins = timeStringToMinutes(rawEnd)

    if (startMins !== null && endMins !== null) {
      return {
        isClosed: false,
        start: normalizeTimeString(rawStart) || "8:00 AM",
        end: normalizeTimeString(rawEnd) || "10:00 PM",
        startMinutes: startMins,
        endMinutes: endMins,
      }
    }
  }

  // Fallback default
  return {
    isClosed: false,
    start: "8:00 AM",
    end: "10:00 PM",
    startMinutes: 8 * 60,
    endMinutes: 22 * 60,
  }
}

/**
 * Checks if a lab hours string is currently open given a specific Date.
 */
export function isWithinHours(hoursStr: string | undefined, now: Date = new Date()): boolean {
  if (!hoursStr) return false
  const parsed = parseLabHoursRange(hoursStr)
  if (parsed.isClosed || parsed.startMinutes === undefined || parsed.endMinutes === undefined) {
    return false
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  // Standard daytime range (e.g., 8:00 AM (480) to 10:00 PM (1320))
  if (parsed.startMinutes < parsed.endMinutes) {
    return currentMinutes >= parsed.startMinutes && currentMinutes < parsed.endMinutes
  }

  // Overnight range (e.g., 9:00 PM to 2:00 AM)
  return currentMinutes >= parsed.startMinutes || currentMinutes < parsed.endMinutes
}

/**
 * Returns today's relevant hours string from a lab's hours object based on day of week.
 */
export function getTodayLabHours(
  hours: LabInfo["hours"],
  now: Date = new Date()
): { dayKey: "monThu" | "fri" | "weekend"; dayLabel: string; hoursStr: string } {
  const day = now.getDay() // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  if (day >= 1 && day <= 4) {
    return { dayKey: "monThu", dayLabel: "Mon – Thu", hoursStr: hours.monThu }
  }
  if (day === 5) {
    return { dayKey: "fri", dayLabel: "Fri", hoursStr: hours.fri }
  }
  return {
    dayKey: "weekend",
    dayLabel: "Weekend",
    hoursStr: hours.weekend || "Closed",
  }
}

const DAY_INDEX_TO_WEEKDAY: Record<number, WeekDay | undefined> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
}

/**
 * Finds any class currently taking the room right now.
 */
export function getActiveClassForLab(lab: LabInfo, now: Date = new Date()): LabClassSession | null {
  if (!lab.classes || lab.classes.length === 0) return null
  const currentWeekDay = DAY_INDEX_TO_WEEKDAY[now.getDay()]
  if (!currentWeekDay) return null

  for (const session of lab.classes) {
    if (session.days.includes(currentWeekDay)) {
      if (isTimeInRange(session.startTime, session.endTime, now)) {
        return session
      }
    }
  }
  return null
}

/**
 * Gets all classes scheduled for today for this lab.
 */
export function getTodayClassesForLab(lab: LabInfo, now: Date = new Date()): LabClassSession[] {
  if (!lab.classes || lab.classes.length === 0) return []
  const currentWeekDay = DAY_INDEX_TO_WEEKDAY[now.getDay()]
  if (!currentWeekDay) return []

  return lab.classes
    .filter((session) => session.days.includes(currentWeekDay))
    .sort((a, b) => (timeStringToMinutes(a.startTime) ?? 0) - (timeStringToMinutes(b.startTime) ?? 0))
}

/**
 * Evaluates the real-time effective status of a lab.
 * - If outside hours or schedule says Closed => "Closed"
 * - If a class is actively scheduled right now => "In Class"
 * - Otherwise => Open / Tutoring
 */
export function getEffectiveLabStatus(lab: LabInfo, now: Date = new Date()): LabStatus {
  // If the admin explicitly marked the lab Closed, it is closed
  if (lab.status === "Closed") {
    return "Closed"
  }

  // Check today's schedule against current time
  const today = getTodayLabHours(lab.hours, now)
  const openNow = isWithinHours(today.hoursStr, now)

  if (!openNow) {
    return "Closed"
  }

  // If a class is actively scheduled in this room right now, it displays IN CLASS
  const activeClass = getActiveClassForLab(lab, now)
  if (activeClass) {
    return "In Class"
  }

  // During open hours: maintain admin status (Open, Tutoring, In Class, Reserved)
  return lab.status
}

