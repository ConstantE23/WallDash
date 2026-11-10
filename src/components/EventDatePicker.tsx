import React, { useState, useEffect, useRef } from "react"
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Sparkles,
} from "lucide-react"
import {
  parseEventDate,
  formatEventDate,
  detectDateFormat,
  getCalendarGrid,
  getQuickPresets,
  isSameDay,
  MONTH_NAMES_FULL,
  MONTH_NAMES_ABBR,
  DAY_NAMES_ABBR,
  type DateFormatStyle,
} from "../utils/datePickerUtils"

interface EventDatePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onDateSelect?: (date: Date, formattedString: string, isToday: boolean) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  theme?: "light" | "dark"
  className?: string
}

export default function EventDatePicker({
  id,
  value,
  onChange,
  onDateSelect,
  placeholder = "e.g. SAT NOVEMBER 7 or Fri, Oct 10",
  required = false,
  disabled = false,
  theme = "light",
  className,
}: EventDatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nativeInputRef = useRef<HTMLInputElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [formatStyle, setFormatStyle] = useState<DateFormatStyle>(() =>
    detectDateFormat(value),
  )

  // Track the current calendar navigation view
  const parsed = parseEventDate(value)
  const [viewYear, setViewYear] = useState<number>(() =>
    parsed ? parsed.getFullYear() : new Date().getFullYear(),
  )
  const [viewMonth, setViewMonth] = useState<number>(() =>
    parsed ? parsed.getMonth() : new Date().getMonth(),
  )

  // Quick month/year jump selector overlay
  const [showMonthSelect, setShowMonthSelect] = useState(false)

  // When external value changes, sync the calendar view if it parses to a valid date
  useEffect(() => {
    const p = parseEventDate(value)
    if (p) {
      setViewYear(p.getFullYear())
      setViewMonth(p.getMonth())
      setFormatStyle(detectDateFormat(value))
    }
  }, [value])

  // Handle clicking outside to close
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setShowMonthSelect(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false)
        setShowMonthSelect(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("touchstart", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((prev) => prev - 1)
    } else {
      setViewMonth((prev) => prev - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((prev) => prev + 1)
    } else {
      setViewMonth((prev) => prev + 1)
    }
  }

  const handleSelectDay = (date: Date) => {
    const formatted = formatEventDate(date, formatStyle)
    onChange(formatted)
    const isToday = isSameDay(date, new Date())
    onDateSelect?.(date, formatted, isToday)
    setIsOpen(false)
    setShowMonthSelect(false)
  }

  const handleFormatChange = (newStyle: DateFormatStyle) => {
    setFormatStyle(newStyle)
    const dt = parsed || new Date()
    const formatted = formatEventDate(dt, newStyle)
    onChange(formatted)
    const isToday = isSameDay(dt, new Date())
    onDateSelect?.(dt, formatted, isToday)
  }

  const handleClear = () => {
    onChange("")
    setIsOpen(false)
  }

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!val) return
    const dt = parseEventDate(val)
    if (dt) {
      handleSelectDay(dt)
    }
  }

  const handleOpenSystemPicker = () => {
    if (nativeInputRef.current) {
      try {
        if ("showPicker" in HTMLInputElement.prototype) {
          nativeInputRef.current.showPicker()
        } else {
          nativeInputRef.current.focus()
        }
      } catch {
        nativeInputRef.current.focus()
      }
    }
  }

  const grid = getCalendarGrid(viewYear, viewMonth, parsed)
  const presets = getQuickPresets()
  const today = new Date()

  // Styling based on theme
  const isDark = theme === "dark"

  const inputClasses =
    className ||
    (isDark
      ? "w-full pl-3 pr-10 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#02275A] transition-colors"
      : "w-full rounded-md border border-slate-300 bg-white pl-3 pr-10 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[#02275A] focus:outline-none focus:ring-2 focus:ring-[#02275A]/15 disabled:bg-slate-50 transition-colors")

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Hidden input for native picker integration */}
      <input
        ref={nativeInputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleNativeChange}
        className="sr-only pointer-events-none"
      />

      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          value={value}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClasses}
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className={`p-1 rounded-full transition-colors cursor-pointer ${
                isDark
                  ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
              title="Clear date"
              aria-label="Clear date"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label="Select date on calendar"
            aria-expanded={isOpen}
            className={`p-1.5 rounded transition-all cursor-pointer ${
              isOpen
                ? isDark
                  ? "bg-[#02275A] text-white ring-1 ring-sky-400/50"
                  : "bg-[#02275A] text-white shadow-xs"
                : isDark
                  ? "text-slate-400 hover:text-white hover:bg-slate-800"
                  : "text-slate-500 hover:text-[#02275A] hover:bg-slate-100"
            }`}
            title="Open calendar picker"
          >
            <CalendarIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Calendar date picker"
          className={`absolute left-0 mt-2 z-50 w-[310px] sm:w-[330px] rounded-xl shadow-2xl p-3.5 select-none border transition-all animate-in fade-in zoom-in-95 duration-100 ${
            isDark
              ? "bg-slate-900 border-slate-700 text-slate-100 shadow-black/60"
              : "bg-white border-slate-200 text-slate-800 shadow-slate-300/60"
          }`}
        >
          {/* Top Quick Preset Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800 no-scrollbar">
            {presets.map((preset) => {
              const active = parsed ? isSameDay(parsed, preset.date) : false
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleSelectDay(preset.date)}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? isDark
                        ? "bg-[#02275A] text-white ring-1 ring-sky-400"
                        : "bg-[#02275A] text-white"
                      : isDark
                        ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Calendar Header with Month/Year Navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isDark
                  ? "hover:bg-slate-800 text-slate-300"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
              title="Previous month"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowMonthSelect((prev) => !prev)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide transition-colors cursor-pointer flex items-center gap-1 ${
                isDark
                  ? "text-white hover:bg-slate-800"
                  : "text-slate-900 hover:bg-slate-100"
              }`}
              title="Click to jump month/year"
            >
              <span>
                {MONTH_NAMES_FULL[viewMonth]} {viewYear}
              </span>
            </button>

            <button
              type="button"
              onClick={handleNextMonth}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isDark
                  ? "hover:bg-slate-800 text-slate-300"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
              title="Next month"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Month/Year Selector Dropdown View */}
          {showMonthSelect ? (
            <div className="py-2 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Select Month & Year
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => y - 1)}
                    className="p-1 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 cursor-pointer"
                  >
                    -1y
                  </button>
                  <span className="text-xs font-black px-1">{viewYear}</span>
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => y + 1)}
                    className="p-1 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-slate-800 px-1.5 cursor-pointer"
                  >
                    +1y
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_NAMES_ABBR.map((m, idx) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setViewMonth(idx)
                      setShowMonthSelect(false)
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      viewMonth === idx
                        ? "bg-[#02275A] text-white"
                        : isDark
                          ? "hover:bg-slate-800 text-slate-300"
                          : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Day of Week Header */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {DAY_NAMES_ABBR.map((day) => (
                  <div
                    key={day}
                    className="text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 py-1"
                  >
                    {day.slice(0, 2)}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {grid.map((cell, idx) => {
                  const isCurrent = cell.isCurrentMonth
                  const isSel = cell.isSelected
                  const isCurrentDay = cell.isToday

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectDay(cell.date)}
                      className={`relative h-8 w-full flex items-center justify-center text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        isSel
                          ? isDark
                            ? "bg-[#02275A] text-white font-bold ring-2 ring-sky-400 shadow-sm"
                            : "bg-[#02275A] text-white font-bold ring-2 ring-[#02275A]/25 shadow-sm"
                          : isCurrentDay
                            ? isDark
                              ? "ring-1 ring-sky-400 text-sky-300 font-bold hover:bg-slate-800"
                              : "ring-1 ring-[#02275A] text-[#02275A] font-bold hover:bg-slate-100"
                            : isCurrent
                              ? isDark
                                ? "text-slate-200 hover:bg-slate-800"
                                : "text-slate-800 hover:bg-slate-100"
                              : isDark
                                ? "text-slate-600 hover:text-slate-400 hover:bg-slate-800/40"
                                : "text-slate-300 hover:text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <span>{cell.dayNumber}</span>
                      {isCurrentDay && !isSel && (
                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#02275A] dark:bg-sky-400" />
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Footer: Format Style Selector & Utilities */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 dark:text-slate-500 font-medium">
                Format:
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: "caps_full", label: "SAT NOV 7" },
                    { id: "caps_abbr", label: "SAT, NOV 7" },
                    { id: "short", label: "Sat, Nov 7" },
                    { id: "full", label: "Saturday" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleFormatChange(f.id)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      formatStyle === f.id
                        ? isDark
                          ? "bg-sky-950 text-sky-300 border border-sky-600/50"
                          : "bg-slate-900 text-white"
                        : isDark
                          ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleOpenSystemPicker}
                className="text-[10px] text-slate-400 hover:text-[#02275A] dark:hover:text-sky-300 transition-colors underline cursor-pointer"
              >
                System calendar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    isDark
                      ? "bg-slate-800 hover:bg-slate-700 text-white"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                  }`}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
