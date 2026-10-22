import React from "react"
import { Calendar, Clock, MapPin, Sparkles } from "lucide-react"
import type { EventAnnouncement } from "../types/signage"

interface EventAnnouncementsProps {
  events: EventAnnouncement[]
  isTvMode?: boolean
  onSelectEvent?: (event: EventAnnouncement) => void
  onOpenAddModal?: () => void
}

export default function EventAnnouncements({
  events,
  isTvMode = true,
  onSelectEvent,
}: EventAnnouncementsProps) {
  const nowMs = Date.now()
  const nowDate = new Date(nowMs)
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  // Hide events that already finished (only possible when real timestamps exist)
  const liveEvents = events.filter(
    (e) => !e.endISO || new Date(e.endISO).getTime() >= nowMs,
  )
  const isTodayEvent = (e: EventAnnouncement) =>
    e.startISO ? isSameDay(new Date(e.startISO), nowDate) : !!e.isToday

  const todayEvents = liveEvents.filter(isTodayEvent)
  const featuredToday = todayEvents.length > 0 ? todayEvents[0] : undefined
  const upcomingEvents = liveEvents.filter((e) => e.id !== featuredToday?.id)

  // For the infinite seamless autoscroll on TV, we double the list
  const tickerEvents = [...upcomingEvents, ...upcomingEvents]

  // Dynamic animation duration based on item count so scrolling speed remains comfortable
  const animationDurationSeconds = Math.max(25, upcomingEvents.length * 6)

  return (
    <aside className="w-full h-full flex flex-col bg-[#F3F8FC] select-none overflow-hidden">
      {/* Section Header matching Figma Mockup */}
      <div className="flex items-center px-4 sm:px-5 bg-[#02275A] h-12 md:h-14 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-white/95" />
          <span className="text-white uppercase tracking-widest font-extrabold text-xs md:text-sm">
            Important Event Announcements
          </span>
        </div>
      </div>

      {/* Column content area with border-r below the unbroken header bar */}
      <div className="flex-1 min-h-0 flex flex-col border-r border-[#02275A]/20 overflow-hidden">

      {/* 1. Fixed "Happening Today" Section at Top */}
      {featuredToday && (
        <div className="flex-shrink-0 px-3 pt-3 pb-2 bg-gradient-to-b from-[#EBF3FB] via-[#F3F8FC] to-[#F3F8FC] border-b border-[#02275A]/15">
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <span className="uppercase tracking-widest text-[9px] md:text-[10px] font-extrabold text-[#02275A]">
                Happening Today
              </span>
            </div>
            <div className="flex-1 ml-2.5 h-px bg-[#02275A]/30" />
          </div>

          {/* Today Featured Card */}
          <div
            onClick={() => onSelectEvent?.(featuredToday)}
            className="group relative flex items-stretch rounded-md overflow-hidden bg-white shadow-sm border border-[#02275A]/30"
          >
            <div className="w-2 bg-[#02275A] flex-shrink-0" />
            <div className="flex flex-col justify-center px-3.5 py-2.5 flex-1 gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-extrabold text-[#02275A] text-xs md:text-sm leading-tight line-clamp-1">
                  {featuredToday.title}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded flex-shrink-0">
                  TODAY
                </span>
              </div>

              <div className="flex items-center gap-2 text-[#353A3C] text-[10px] md:text-[11px] font-medium flex-wrap">
                <span className="flex items-center gap-1 text-[#02275A] font-semibold">
                  <Clock className="w-3 h-3 text-[#02275A]" />
                  {featuredToday.time}
                </span>
                <span className="text-gray-300">|</span>
                <span className="flex items-center gap-1 text-[#02275A] font-medium truncate">
                  <MapPin className="w-3 h-3 text-[#02275A]" />
                  {featuredToday.location}
                </span>
              </div>

              {featuredToday.description && (
                <p className="text-[10px] text-gray-500 line-clamp-1 italic">
                  {featuredToday.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Upcoming Events Header Bar */}
      <div className="flex-shrink-0 px-3 pt-2 pb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-widest text-[9px] md:text-[10px] font-extrabold text-[#02275A]">
            Upcoming Schedule
          </span>
          <span className="text-[10px] text-[#02275A] font-bold bg-[#02275A]/10 px-1.5 rounded-full">
            Auto-Cycling
          </span>
        </div>
        <div className="flex-1 ml-2.5 h-px bg-[#02275A]/20" />
      </div>

      {/* 3. Autonomous Vertical Autoscroll Viewport for TV (No clicking needed) */}
      <div className="flex-1 min-h-0 overflow-hidden relative px-3">
        {/* Soft gradient masks top and bottom for smooth appearance/disappearance */}
        <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-[#F3F8FC] to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#F3F8FC] to-transparent z-10 pointer-events-none" />

        <style>{`
          @keyframes tvTickerScroll {
            0% {
              transform: translateY(0);
            }
            100% {
              transform: translateY(-50%);
            }
          }
          .tv-autoscroll-track {
            animation: tvTickerScroll ${animationDurationSeconds}s linear infinite;
            will-change: transform;
          }
          .tv-autoscroll-track:hover {
            animation-play-state: paused;
          }
        `}</style>

        {/* The continuous scrolling marquee track */}
        <div className="tv-autoscroll-track flex flex-col gap-2.5 py-1">
          {tickerEvents.map((event, idx) => (
            <div
              key={`${event.id}-${idx}`}
              className="flex items-stretch rounded-md overflow-hidden bg-white shadow-xs border border-slate-200/80 flex-shrink-0"
              style={{ minHeight: "68px" }}
            >
              {/* Left Color Accent Bar */}
              <div
                className={`w-1.5 flex-shrink-0 ${
                  event.category === "Capstone"
                    ? "bg-[#02275A]"
                    : event.category === "Hackathon"
                      ? "bg-purple-600"
                      : event.category === "Career"
                        ? "bg-emerald-500"
                        : event.category === "Workshop"
                          ? "bg-cyan-500"
                          : "bg-[#02275A]"
                }`}
              />

              <div className="flex flex-col justify-center px-3 py-2 flex-1 gap-1">
                <div className="flex items-start justify-between gap-1.5">
                  <span className="font-bold text-[#02275A] text-xs leading-snug line-clamp-1">
                    {event.title}
                  </span>
                  <span className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 whitespace-nowrap">
                    {event.category}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-[#353A3C] flex-wrap">
                  <span className="font-semibold text-[#02275A]">
                    {event.date}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="font-medium text-gray-600">
                    {event.time}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-[#02275A] font-medium pt-0.5">
                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="truncate">{event.location}</span>
                </div>

                {event.description && (
                  <p className="text-[9.5px] text-gray-500 line-clamp-1 italic pt-0.5">
                    {event.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </aside>
  )
}
