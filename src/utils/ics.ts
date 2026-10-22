import type { EventAnnouncement } from "../types/signage"

export interface IcsParseResult {
  events: Omit<EventAnnouncement, "id">[]
  /** Events skipped because they already ended */
  skippedPast: number
  /** Recurring events (RRULE) – only the first occurrence is imported */
  recurring: number
  /** Total VEVENT blocks found */
  total: number
}

const DAY_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
const MONTH_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
]

/** Unfold folded lines (RFC 5545: continuation lines start with space/tab). */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim()
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":")
  if (colon < 0) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const [name, ...paramParts] = left.split(";")
  const params: Record<string, string> = {}
  for (const p of paramParts) {
    const eq = p.indexOf("=")
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1)
  }
  return { name: name.toUpperCase(), params, value }
}

/** Parse DTSTART/DTEND value. Returns the Date and whether it was a date-only (all-day) value. */
function parseDate(p: Prop): { date: Date; allDay: boolean } | null {
  const m = p.value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/,
  )
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  const allDay = h === undefined || p.params["VALUE"] === "DATE"
  if (allDay) {
    return {
      date: new Date(Number(y), Number(mo) - 1, Number(d)),
      allDay: true,
    }
  }
  if (z) {
    return {
      date: new Date(
        Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(h),
          Number(mi),
          Number(s || 0),
        ),
      ),
      allDay: false,
    }
  }
  // Floating / TZID time: treated as the viewing device's local time
  return {
    date: new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s || 0),
    ),
    allDay: false,
  }
}

function fmtTime(d: Date): string {
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, "0")
  const ap = h >= 12 ? "PM" : "AM"
  h = h % 12 || 12
  return `${h}:${m} ${ap}`
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function guessCategory(text: string): EventAnnouncement["category"] {
  const t = text.toLowerCase()
  if (/capstone|senior design|defense|presentation/.test(t)) return "Capstone"
  if (/hackathon|hack\b|ctf|competition/.test(t)) return "Hackathon"
  if (
    /career|internship|recruit|job|interview|fair|info session|open house/.test(
      t,
    )
  )
    return "Career"
  if (/workshop|bootcamp|training|study session|tutorial|lab session/.test(t))
    return "Workshop"
  if (/lecture|talk|seminar|panel|speaker|symposium|colloquium/.test(t))
    return "Lecture"
  if (/club|society|acm|meeting|chapter|association/.test(t)) return "Club"
  return "Workshop"
}

export function parseIcs(text: string): IcsParseResult {
  const lines = unfold(text)
  const result: IcsParseResult = {
    events: [],
    skippedPast: 0,
    recurring: 0,
    total: 0,
  }
  const now = new Date()

  let current: Prop[] | null = null
  for (const line of lines) {
    const up = line.trim().toUpperCase()
    if (up === "BEGIN:VEVENT") {
      current = []
      continue
    }
    if (up === "END:VEVENT") {
      if (current) {
        result.total++
        const get = (n: string) => current!.find((p) => p.name === n)
        const summary = get("SUMMARY")
        const dtstart = get("DTSTART")
        const dtend = get("DTEND")
        const status = get("STATUS")

        if (summary && dtstart && status?.value.toUpperCase() !== "CANCELLED") {
          const start = parseDate(dtstart)
          const end = dtend ? parseDate(dtend) : null
          if (start) {
            // All-day DTEND is exclusive, so the real last day is one day earlier
            let endDate = end ? end.date : start.date
            if (start.allDay && end) endDate = new Date(end.date.getTime() - 1)
            const endsAt = start.allDay
              ? new Date(
                  endDate.getFullYear(),
                  endDate.getMonth(),
                  endDate.getDate(),
                  23,
                  59,
                  59,
                )
              : endDate

            if (endsAt.getTime() < now.getTime()) {
              result.skippedPast++
            } else {
              if (get("RRULE")) result.recurring++

              const title = unescapeText(summary.value)
              const location =
                unescapeText(get("LOCATION")?.value || "") || "TBA"
              const description = unescapeText(get("DESCRIPTION")?.value || "")
              const date = `${DAY_ABBR[start.date.getDay()]}, ${MONTH_ABBR[start.date.getMonth()]} ${start.date.getDate()}`
              const time = start.allDay
                ? "All Day"
                : end && !sameDay(start.date, end.date)
                  ? `${fmtTime(start.date)} – ${fmtTime(end.date)} (${MONTH_ABBR[end.date.getMonth()]} ${end.date.getDate()})`
                  : end
                    ? `${fmtTime(start.date)} – ${fmtTime(end.date)}`
                    : fmtTime(start.date)

              result.events.push({
                title,
                date,
                time,
                location,
                category: guessCategory(`${title} ${description}`),
                isToday: sameDay(start.date, now),
                description: description
                  ? description.slice(0, 160)
                  : undefined,
                organizer:
                  unescapeText(
                    get("ORGANIZER")?.params["CN"]?.replace(/^"|"$/g, "") || "",
                  ) || undefined,
                uid: get("UID")?.value.trim() || undefined,
                startISO: start.date.toISOString(),
                endISO: endsAt.toISOString(),
              })
            }
          }
        }
      }
      current = null
      continue
    }
    if (current) {
      const prop = parseLine(line)
      if (prop) current.push(prop)
    }
  }

  result.events.sort(
    (a, b) =>
      new Date(a.startISO || 0).getTime() - new Date(b.startISO || 0).getTime(),
  )
  return result
}
