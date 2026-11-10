/**
 * Utilities for event date parsing, formatting, and calendar calculations.
 * Supports natural date formats like "SAT NOVEMBER 7", "Fri, Oct 10", "2026-11-07", etc.
 */

export type DateFormatStyle = "caps_full" | "caps_abbr" | "short" | "full" | "iso"

export const MONTH_NAMES_FULL = [
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

export const MONTH_NAMES_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

export const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

export const DAY_NAMES_ABBR = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
]

/**
 * Parses user input into a Date object.
 * Handles formats:
 * - "SAT NOVEMBER 7"
 * - "Fri, Oct 10"
 * - "SAT, NOV 7"
 * - "November 7, 2026"
 * - "2026-11-07"
 * - "11/07/2026" or "11/7"
 */
export function parseEventDate(input: string): Date | null {
  if (!input || !input.trim()) return null
  const str = input.trim()

  // 1. Try ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10)
    const m = parseInt(isoMatch[2], 10) - 1
    const d = parseInt(isoMatch[3], 10)
    const dt = new Date(y, m, d)
    if (!isNaN(dt.getTime())) return dt
  }

  // 2. Try MM/DD/YYYY or MM/DD
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (slashMatch) {
    const m = parseInt(slashMatch[1], 10) - 1
    const d = parseInt(slashMatch[2], 10)
    let y = slashMatch[3] ? parseInt(slashMatch[3], 10) : new Date().getFullYear()
    if (y < 100) y += 2000
    const dt = new Date(y, m, d)
    if (!isNaN(dt.getTime())) return dt
  }

  // 3. Month lookup table
  const monthMap: Record<string, number> = {}
  MONTH_NAMES_FULL.forEach((name, idx) => {
    monthMap[name.toLowerCase()] = idx
  })
  MONTH_NAMES_ABBR.forEach((abbr, idx) => {
    monthMap[abbr.toLowerCase()] = idx
  })
  // common variant
  monthMap["sept"] = 8

  // Clean string: replace commas, dots, dashes with spaces
  const clean = str.toLowerCase().replace(/[,.\-_/]/g, " ")
  const tokens = clean.split(/\s+/).filter(Boolean)

  let matchedMonth: number | null = null
  let matchedDay: number | null = null
  let matchedYear: number | null = null

  for (const token of tokens) {
    // Check if token is a month name
    if (token in monthMap && matchedMonth === null) {
      matchedMonth = monthMap[token]
      continue
    }

    // Strip ordinal suffixes like 1st, 2nd, 3rd, 7th
    const stripped = token.replace(/(st|nd|rd|th)$/i, "")
    const num = parseInt(stripped, 10)
    if (!isNaN(num)) {
      if (num >= 1970 && num <= 2100) {
        matchedYear = num
      } else if (num >= 1 && num <= 31 && matchedDay === null) {
        matchedDay = num
      }
    }
  }

  if (matchedMonth !== null && matchedDay !== null) {
    const year = matchedYear ?? new Date().getFullYear()
    const dt = new Date(year, matchedMonth, matchedDay)
    if (!isNaN(dt.getTime())) return dt
  }

  // 4. Fallback to standard Date.parse
  const fallback = new Date(str)
  if (!isNaN(fallback.getTime())) {
    return fallback
  }

  return null
}

/**
 * Detects the date format style from existing text.
 */
export function detectDateFormat(str: string): DateFormatStyle {
  if (!str) return "caps_full"

  const trimmed = str.trim()
  const isAllUpper =
    trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)

  if (isAllUpper) {
    // Check if it uses full month name like "NOVEMBER"
    const hasFullMonth = MONTH_NAMES_FULL.some((m) =>
      trimmed.toUpperCase().includes(m.toUpperCase()),
    )
    return hasFullMonth ? "caps_full" : "caps_abbr"
  }

  const hasFullWeekday = DAY_NAMES_FULL.some((d) => trimmed.includes(d))
  if (hasFullWeekday) return "full"

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "iso"

  return "short"
}

/**
 * Formats a Date object according to the selected style.
 */
export function formatEventDate(
  date: Date,
  style: DateFormatStyle = "caps_full",
): string {
  const currentYear = new Date().getFullYear()
  const dYear = date.getFullYear()
  const yearSuffix = dYear !== currentYear ? `, ${dYear}` : ""

  const dayAbbr = DAY_NAMES_ABBR[date.getDay()]
  const dayFull = DAY_NAMES_FULL[date.getDay()]
  const monthAbbr = MONTH_NAMES_ABBR[date.getMonth()]
  const monthFull = MONTH_NAMES_FULL[date.getMonth()]
  const dayNum = date.getDate()

  switch (style) {
    case "caps_full":
      // Example: "SAT NOVEMBER 7" (matches user's screenshot)
      return `${dayAbbr.toUpperCase()} ${monthFull.toUpperCase()} ${dayNum}${dYear !== currentYear ? ` ${dYear}` : ""}`

    case "caps_abbr":
      // Example: "SAT, NOV 7" (matches ics.ts import format)
      return `${dayAbbr.toUpperCase()}, ${monthAbbr.toUpperCase()} ${dayNum}${dYear !== currentYear ? `, ${dYear}` : ""}`

    case "short":
      // Example: "Sat, Nov 7" (compact title case)
      return `${dayAbbr}, ${monthAbbr} ${dayNum}${yearSuffix}`

    case "full":
      // Example: "Saturday, November 7"
      return `${dayFull}, ${monthFull} ${dayNum}${yearSuffix}`

    case "iso":
      // Example: "2026-11-07"
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

    default:
      return `${dayAbbr.toUpperCase()} ${monthFull.toUpperCase()} ${dayNum}`
  }
}

export interface CalendarDayItem {
  date: Date
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
}

/**
 * Builds a 35-to-42 cell calendar grid for a given year & month (0-indexed).
 */
export function getCalendarGrid(
  year: number,
  month: number,
  selectedDate: Date | null,
): CalendarDayItem[] {
  const today = new Date()
  const firstDayOfMonth = new Date(year, month, 1)
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate()
  const startDayOfWeek = firstDayOfMonth.getDay() // 0 = Sun

  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const days: CalendarDayItem[] = []

  // Previous month padding
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    const dt = new Date(year, month - 1, d)
    days.push({
      date: dt,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: isSameDay(dt, today),
      isSelected: selectedDate ? isSameDay(dt, selectedDate) : false,
    })
  }

  // Current month days
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dt = new Date(year, month, d)
    days.push({
      date: dt,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: isSameDay(dt, today),
      isSelected: selectedDate ? isSameDay(dt, selectedDate) : false,
    })
  }

  // Next month padding to fill out complete 7-day rows (up to 35 or 42)
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const dt = new Date(year, month + 1, d)
      days.push({
        date: dt,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: isSameDay(dt, today),
        isSelected: selectedDate ? isSameDay(dt, selectedDate) : false,
      })
    }
  }

  return days
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Normalizes a Date to local midnight (00:00:00.000).
 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

/**
 * Normalizes a Date to the end of the local day (23:59:59.999).
 */
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/**
 * Formats a start and optional end date as a range string (e.g. "MON NOV 9 – THU NOV 12").
 */
export function formatEventDateRange(
  startDate: Date,
  endDate?: Date | null,
  style: DateFormatStyle = "caps_abbr",
): string {
  if (!endDate || isSameDay(startDate, endDate)) {
    return formatEventDate(startDate, style)
  }
  const s = startOfDay(startDate)
  const e = startOfDay(endDate)
  const [first, last] = s.getTime() <= e.getTime() ? [s, e] : [e, s]
  return `${formatEventDate(first, style)} – ${formatEventDate(last, style)}`
}

/**
 * Parses a date string that might contain a range like "NOV 9 – NOV 12" or "2026-11-09 to 2026-11-12".
 */
export function parseEventDateRange(input: string): {
  startDate: Date | null
  endDate: Date | null
} {
  if (!input || !input.trim()) {
    return { startDate: null, endDate: null }
  }
  const parts = input.split(/\s*(?:–|—|\bto\b|\bthrough\b|\bthru\b)\s*/i)
  if (parts.length >= 2) {
    const start = parseEventDate(parts[0])
    const end = parseEventDate(parts[1])
    if (start && end) {
      return start.getTime() <= end.getTime()
        ? { startDate: start, endDate: end }
        : { startDate: end, endDate: start }
    }
  }
  const single = parseEventDate(input)
  return { startDate: single, endDate: single }
}

export interface EventDateSpanInfo {
  startDate: Date | null
  endDate: Date | null
  isMultiDay: boolean
  totalDays: number
}

/**
 * Resolves the start date, end date, multi-day status, and day count for an event.
 */
export function getEventDateSpan(event: {
  date?: string
  endDate?: string
  isMultiDay?: boolean
  startISO?: string
  endISO?: string
}): EventDateSpanInfo {
  let start: Date | null = null
  let end: Date | null = null

  if (event.startISO) {
    const d = new Date(event.startISO)
    if (!isNaN(d.getTime())) start = startOfDay(d)
  }
  if (event.endISO) {
    const d = new Date(event.endISO)
    if (!isNaN(d.getTime())) end = startOfDay(d)
  }

  // Fallback to parsing `date` / `endDate` strings
  if (!start && event.date) {
    const range = parseEventDateRange(event.date)
    if (range.startDate) start = startOfDay(range.startDate)
    if (!end && range.endDate) end = startOfDay(range.endDate)
  }

  if (event.endDate) {
    const parsedEnd = parseEventDate(event.endDate)
    if (parsedEnd) end = startOfDay(parsedEnd)
  }

  if (start && !end) {
    end = new Date(start)
  }
  if (start && end && end.getTime() < start.getTime()) {
    const tmp = start
    start = end
    end = tmp
  }

  if (!start || !end) {
    return {
      startDate: start,
      endDate: end,
      isMultiDay: Boolean(event.isMultiDay),
      totalDays: 1,
    }
  }

  const diffDays =
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const isMulti = diffDays > 1

  return {
    startDate: start,
    endDate: end,
    isMultiDay: isMulti,
    totalDays: Math.max(1, diffDays),
  }
}

/**
 * Checks whether an event is scheduled on a given calendar day (including multi-day spans).
 */
export function isEventOnDay(
  event: {
    date?: string
    endDate?: string
    isMultiDay?: boolean
    startISO?: string
    endISO?: string
  },
  targetDay: Date,
): boolean {
  const { startDate, endDate } = getEventDateSpan(event)
  if (!startDate || !endDate) return false
  const t = startOfDay(targetDay).getTime()
  return t >= startDate.getTime() && t <= endDate.getTime()
}

/**
 * Returns where `targetDay` sits within an event's date span:
 * - "single": single-day event on `targetDay`
 * - "start": first day of a multi-day event
 * - "middle": intermediate day of a multi-day event
 * - "end": last day of a multi-day event
 * - null: event does not occur on `targetDay`
 */
export function getEventDayPosition(
  event: {
    date?: string
    endDate?: string
    isMultiDay?: boolean
    startISO?: string
    endISO?: string
  },
  targetDay: Date,
): "single" | "start" | "middle" | "end" | null {
  const { startDate, endDate, isMultiDay } = getEventDateSpan(event)
  if (!startDate || !endDate) return null
  const t = startOfDay(targetDay).getTime()
  const s = startDate.getTime()
  const e = endDate.getTime()
  if (t < s || t > e) return null
  if (!isMultiDay || s === e) return "single"
  if (t === s) return "start"
  if (t === e) return "end"
  return "middle"
}

/**
 * For a multi-day event occurring on `targetDay`, returns 1-based day index and total days.
 */
export function getEventDayProgress(
  event: {
    date?: string
    endDate?: string
    isMultiDay?: boolean
    startISO?: string
    endISO?: string
  },
  targetDay: Date,
): { dayNumber: number; totalDays: number } | null {
  const { startDate, endDate, totalDays } = getEventDateSpan(event)
  if (!startDate || !endDate) return null
  const t = startOfDay(targetDay).getTime()
  if (t < startDate.getTime() || t > endDate.getTime()) return null
  const dayNumber =
    Math.round((t - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return { dayNumber, totalDays }
}

/**
 * Formats the display date label for an event, showing the full multi-day range when applicable.
 */
export function getEventDisplayDate(event: {
  date: string
  endDate?: string
  isMultiDay?: boolean
  startISO?: string
  endISO?: string
}): string {
  const { startDate, endDate, isMultiDay } = getEventDateSpan(event)
  if (isMultiDay && startDate && endDate) {
    if (event.endDate && event.date && !event.date.includes("–")) {
      return `${event.date} – ${event.endDate}`
    }
    if (event.date && event.date.includes("–")) {
      return event.date
    }
    return formatEventDateRange(startDate, endDate, detectDateFormat(event.date))
  }
  return event.date
}

/**
 * If `timeStr` is a time range like "3:00 PM – 5:00 PM", parses the end time on `baseDay`.
 * Returns null if `timeStr` is "All Day" or does not contain a range end time.
 */
function parseRangeEndTimeOnDay(baseDay: Date, timeStr?: string): Date | null {
  if (!timeStr) return null
  const trimmed = timeStr.trim()
  if (!trimmed || /all\s*day/i.test(trimmed)) return null

  const rangeParts = trimmed.split(/\s*(?:–|—|-|\bto\b)\s*/i)
  if (rangeParts.length < 2) return null

  const endPart = rangeParts[rangeParts.length - 1].trim()
  const match = endPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) return null

  let hours = parseInt(match[1], 10)
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  const meridiem = match[3]?.toUpperCase()

  if (meridiem === "PM" && hours < 12) hours += 12
  if (meridiem === "AM" && hours === 12) hours = 0

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return new Date(
    baseDay.getFullYear(),
    baseDay.getMonth(),
    baseDay.getDate(),
    hours,
    minutes,
    59,
    999,
  )
}

/**
 * Computes the epoch timestamp (ms) when an event finishes.
 * - Multi-day events finish at the end of their final day (or the range end time on that final day).
 * - Single-day events finish at their range end time, `endISO`, or 23:59:59.999 of their date.
 */
export function getEventEndTimestamp(event: {
  date?: string
  endDate?: string
  isMultiDay?: boolean
  time?: string
  startISO?: string
  endISO?: string
}): number | null {
  const span = getEventDateSpan(event)
  const finalDay = span.endDate || span.startDate

  if (finalDay) {
    const parsedEndTime = parseRangeEndTimeOnDay(finalDay, event.time)
    if (parsedEndTime) {
      return parsedEndTime.getTime()
    }
    if (event.endISO && !span.isMultiDay) {
      const isoDt = new Date(event.endISO)
      if (!isNaN(isoDt.getTime())) {
        return isoDt.getTime()
      }
    }
    return endOfDay(finalDay).getTime()
  }

  if (event.endISO) {
    const isoDt = new Date(event.endISO)
    if (!isNaN(isoDt.getTime())) {
      return isoDt.getTime()
    }
  }

  return null
}

/**
 * Parses the start time of an event (e.g. "3:00 PM – 5:00 PM" or "10:30 AM") on `baseDay`.
 * Returns null if `timeStr` is "All Day" or cannot be parsed.
 */
function parseStartTimeOnDay(baseDay: Date, timeStr?: string): Date | null {
  if (!timeStr) return null
  const trimmed = timeStr.trim()
  if (!trimmed || /all\s*day/i.test(trimmed)) return null

  const rangeParts = trimmed.split(/\s*(?:–|—|-|\bto\b)\s*/i)
  const startPart = rangeParts[0].trim()
  const match = startPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) return null

  let hours = parseInt(match[1], 10)
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  let meridiem = match[3]?.toUpperCase()

  // If start part omitted AM/PM (e.g. "1:00 – 3:00 PM"), inherit from the end part
  if (!meridiem && rangeParts.length >= 2) {
    const endMeridiemMatch = rangeParts[rangeParts.length - 1].match(/(AM|PM)\b/i)
    if (endMeridiemMatch) {
      meridiem = endMeridiemMatch[1].toUpperCase()
    }
  }

  if (meridiem === "PM" && hours < 12) hours += 12
  if (meridiem === "AM" && hours === 12) hours = 0

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return new Date(
    baseDay.getFullYear(),
    baseDay.getMonth(),
    baseDay.getDate(),
    hours,
    minutes,
    0,
    0,
  )
}

/**
 * Computes the epoch timestamp (ms) when an event begins, used for chronological sorting.
 */
export function getEventStartTimestamp(event: {
  date?: string
  endDate?: string
  isMultiDay?: boolean
  time?: string
  startISO?: string
  endISO?: string
}): number {
  const span = getEventDateSpan(event)
  if (span.startDate) {
    const parsedStart = parseStartTimeOnDay(span.startDate, event.time)
    if (parsedStart) {
      return parsedStart.getTime()
    }
    if (event.startISO) {
      const isoDt = new Date(event.startISO)
      if (!isNaN(isoDt.getTime()) && isSameDay(isoDt, span.startDate)) {
        return isoDt.getTime()
      }
    }
    return span.startDate.getTime()
  }

  if (event.startISO) {
    const isoDt = new Date(event.startISO)
    if (!isNaN(isoDt.getTime())) {
      return isoDt.getTime()
    }
  }

  return Number.MAX_SAFE_INTEGER
}

/**
 * Sorts events in ascending calendar order (soonest upcoming at the top -> later events at the bottom).
 * Ties on the same start date/time are broken by end timestamp, then title.
 */
export function sortEventsChronologically<
  T extends {
    title?: string
    date?: string
    endDate?: string
    isMultiDay?: boolean
    time?: string
    startISO?: string
    endISO?: string
  },
>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    const startA = getEventStartTimestamp(a)
    const startB = getEventStartTimestamp(b)
    if (startA !== startB) return startA - startB

    const endA = getEventEndTimestamp(a) ?? Number.MAX_SAFE_INTEGER
    const endB = getEventEndTimestamp(b) ?? Number.MAX_SAFE_INTEGER
    if (endA !== endB) return endA - endB

    return (a.title || "").localeCompare(b.title || "")
  })
}

/**
 * Returns true if the event's end date/time has already passed relative to `nowMs`.
 */
export function isEventExpired(
  event: {
    date?: string
    endDate?: string
    isMultiDay?: boolean
    time?: string
    startISO?: string
    endISO?: string
  },
  nowMs: number = Date.now(),
): boolean {
  const endTs = getEventEndTimestamp(event)
  if (endTs === null) return false
  return endTs < nowMs
}

/**
 * Computes the epoch timestamp (ms) at which a media slide (photo/video) should hide,
 * or null if no hide-after date is set.
 * A slide with `hideAfterDate` stays visible through the end of that day (23:59:59.999).
 */
export function getSlideHideAfterTimestamp(slide: {
  hideAfterDate?: string
  hideAfterISO?: string
}): number | null {
  if (slide.hideAfterDate && slide.hideAfterDate.trim()) {
    const parsed = parseEventDate(slide.hideAfterDate)
    if (parsed) {
      return endOfDay(parsed).getTime()
    }
  }
  if (slide.hideAfterISO) {
    const isoDt = new Date(slide.hideAfterISO)
    if (!isNaN(isoDt.getTime())) {
      return isoDt.getTime()
    }
  }
  return null
}

/**
 * Returns true if the slide's `hideAfterDate` / `hideAfterISO` has already passed relative to `nowMs`.
 */
export function isSlideExpiredByDate(
  slide: {
    hideAfterDate?: string
    hideAfterISO?: string
  },
  nowMs: number = Date.now(),
): boolean {
  const hideTs = getSlideHideAfterTimestamp(slide)
  if (hideTs === null) return false
  return nowMs > hideTs
}

/**
 * Returns true if a slide should be shown in the active TV rotation
 * (not manually hidden and not past its hide-after date).
 */
export function isSlideVisibleOnTv(
  slide: {
    hideAfterDate?: string
    hideAfterISO?: string
    hidden?: boolean
  },
  nowMs: number = Date.now(),
): boolean {
  if (slide.hidden) return false
  if (isSlideExpiredByDate(slide, nowMs)) return false
  return true
}

/**
 * Quick preset helpers.
 */
export function getQuickPresets(): { label: string; date: Date }[] {
  const today = new Date()

  // Tomorrow
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  // Upcoming Saturday
  const saturday = new Date(today)
  const day = today.getDay()
  const daysUntilSaturday = (6 - day + 7) % 7 || 7
  saturday.setDate(today.getDate() + daysUntilSaturday)

  // Next Monday
  const nextMonday = new Date(today)
  const daysUntilMonday = (1 - day + 7) % 7 || 7
  nextMonday.setDate(today.getDate() + daysUntilMonday)

  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: tomorrow },
    { label: "This Saturday", date: saturday },
    { label: "Next Week", date: nextMonday },
  ]
}
