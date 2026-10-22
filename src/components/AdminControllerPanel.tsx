import React, { useRef, useState, useEffect } from "react"
import {
  Sliders,
  Send,
  AlertTriangle,
  Play,
  Pause,
  Plus,
  Trash2,
  Users,
  Radio,
  CheckCircle2,
  RefreshCw,
  X,
  Volume2,
  Sparkles,
  Layers,
  ArrowRight,
  Shield,
  Clock,
  MapPin,
  Upload,
  Video,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  GraduationCap,
  Pencil,
  User,
  Calendar,
} from "lucide-react"
import type {
  SignageState,
  LabInfo,
  LabStatus,
  EventAnnouncement,
  ConnectedClient,
  WeekDay,
  TutorShift,
  SlideItem,
} from "../types/signage"
import { SyncEngine } from "../services/syncEngine"
import { parseIcs } from "../utils/ics"
import LabHoursIntervalPicker from "./LabHoursIntervalPicker"
import { getEffectiveLabStatus } from "../utils/labHours"
import LabClassScheduleManager from "./LabClassScheduleManager"

function HoursField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (val: string) => void
}) {
  const [currentVal, setCurrentVal] = useState(value)

  useEffect(() => {
    setCurrentVal(value)
  }, [value])

  const handleBlur = () => {
    if (currentVal.trim() !== value) {
      onCommit(currentVal.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur()
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700/70 text-xs">
      <span className="font-bold text-slate-300 w-20 flex-shrink-0">
        {label}:
      </span>
      <input
        type="text"
        value={currentVal}
        onChange={(e) => setCurrentVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="e.g. 8:00 AM – 10:00 PM"
        className="flex-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] font-mono"
      />
    </div>
  )
}

interface AdminControllerPanelProps {
  engine: SyncEngine
  state: SignageState
  connectedClients: ConnectedClient[]
  onClose?: () => void
  isInline?: boolean
}

export default function AdminControllerPanel({
  engine,
  state,
  connectedClients,
  onClose,
  isInline = false,
}: AdminControllerPanelProps) {
  // Alert form state
  const [alertText, setAlertText] = useState(state.urgentAlert?.message || "")
  const [alertLevel, setAlertLevel] =
    useState<"info" | "warning" | "emergency">("info")

  // New Event form state
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [eventTitle, setEventTitle] = useState("")
  const [eventDate, setEventDate] = useState("FRI, OCT 10")
  const [eventTime, setEventTime] = useState("3:00 PM – 5:00 PM")
  const [eventLocation, setEventLocation] = useState("")
  const [eventCategory, setEventCategory] =
    useState<EventAnnouncement["category"]>("Workshop")
  const [eventDescription, setEventDescription] = useState("")
  const [eventIsToday, setEventIsToday] = useState(false)

  // Edit Event state
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editEventTitle, setEditEventTitle] = useState("")
  const [editEventDate, setEditEventDate] = useState("")
  const [editEventTime, setEditEventTime] = useState("")
  const [editEventLocation, setEditEventLocation] = useState("")
  const [editEventCategory, setEditEventCategory] =
    useState<EventAnnouncement["category"]>("Workshop")
  const [editEventDescription, setEditEventDescription] = useState("")
  const [editEventIsToday, setEditEventIsToday] = useState(false)

  // Media (Photos & Videos) upload state
  const [showAddMedia, setShowAddMedia] = useState(false)
  const mediaFileInputRef = useRef<HTMLInputElement>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<"image" | "video">("image")
  const [mediaTitle, setMediaTitle] = useState("")
  const [mediaSubtitle, setMediaSubtitle] = useState("")
  const [mediaCategory, setMediaCategory] = useState("Campus Announcement")
  const [mediaCaption, setMediaCaption] = useState("")
  const [mediaDuration, setMediaDuration] = useState<number>(8)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [mediaUploadSuccess, setMediaUploadSuccess] = useState<string | null>(
    null,
  )

  // Edit Slide / Video state
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null)
  const [editSlideTitle, setEditSlideTitle] = useState("")
  const [editSlideSubtitle, setEditSlideSubtitle] = useState("")
  const [editSlideCategory, setEditSlideCategory] = useState("")
  const [editSlideCaption, setEditSlideCaption] = useState("")
  const [editSlideDuration, setEditSlideDuration] = useState<number>(8)

  // .ics import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<{
    type: "ok" | "error"
    text: string
  } | null>(null)

  const lab126 = state.labs[126]
  const lab127 = state.labs[127]

  // Tutor schedule builder state: Add tutor and pick times by day
  const [showAddTutor, setShowAddTutor] = useState(false)
  const [editingTutorOriginalName, setEditingTutorOriginalName] =
    useState<string | null>(null)
  const [tutorName, setTutorName] = useState("")
  const [tutorCourse, setTutorCourse] = useState("151 & 152")
  const [tutorDays, setTutorDays] = useState<Record<WeekDay, {
    enabled: boolean
    time: string
    course: string
  }>>({
    Mon: { enabled: true, time: "", course: "151 & 152" },
    Tue: { enabled: false, time: "", course: "151 & 152" },
    Wed: { enabled: false, time: "", course: "151 & 152" },
    Thu: { enabled: false, time: "", course: "151 & 152" },
    Fri: { enabled: false, time: "", course: "151 & 152" },
  })

  const handleSelectMediaFile = (file: File) => {
    setMediaFile(file)
    const isVid =
      file.type.startsWith("video/") ||
      Boolean(file.name.match(/\.(mp4|webm|mov|ogg)$/i))
    const detectedType: "image" | "video" = isVid ? "video" : "image"
    setMediaType(detectedType)
    setMediaDuration(isVid ? 15 : 8)

    if (!mediaTitle.trim()) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
      setMediaTitle(cleanName)
    }
    if (!mediaSubtitle.trim()) {
      setMediaSubtitle("Department of Computer Science · Hampton University")
    }

    const preview = URL.createObjectURL(file)
    setMediaPreviewUrl(preview)
  }

  const handleMediaUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mediaFile || !mediaPreviewUrl || !mediaTitle.trim()) return

    setIsUploadingMedia(true)
    try {
      await engine.addSlide(
        {
          title: mediaTitle.trim(),
          subtitle: mediaSubtitle.trim() || "Hampton University CS",
          category: mediaCategory.trim() || "Media Spotlight",
          caption: mediaCaption.trim(),
          url: mediaPreviewUrl,
          mediaType,
          durationSeconds:
            Number(mediaDuration) || (mediaType === "video" ? 15 : 8),
          fileName: mediaFile.name,
        },
        mediaFile,
      )

      setMediaUploadSuccess(
        `Uploaded ${
          mediaType === "video" ? "video" : "photo"
        } "${mediaTitle}"! Now live on TV.`,
      )
      setMediaFile(null)
      setMediaPreviewUrl(null)
      setMediaTitle("")
      setMediaSubtitle("")
      setMediaCaption("")
      setShowAddMedia(false)
      setTimeout(() => setMediaUploadSuccess(null), 5000)
    } catch (err) {
      console.error(err)
    } finally {
      setIsUploadingMedia(false)
    }
  }

  const handleMoveSlide = (idx: number, direction: "up" | "down") => {
    const slides = [...(state.slides || [])]
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= slides.length) return
    const temp = slides[idx]
    slides[idx] = slides[targetIdx]
    slides[targetIdx] = temp
    engine.reorderSlides(slides)
  }

  const handleDeleteSlide = async (slideId: string) => {
    if (
      confirm("Are you sure you want to remove this slide from the TV display?")
    ) {
      await engine.removeSlide(slideId)
    }
  }

  const handleLab126Status = (status: LabStatus) => {
    engine.updateLab(126, { status })
  }

  const handleLab127Status = (status: LabStatus) => {
    engine.updateLab(127, { status })
  }

  const handleStartAddTutor = () => {
    setEditingTutorOriginalName(null)
    setTutorName("")
    setTutorCourse("151 & 152")
    setTutorDays({
      Mon: { enabled: true, time: "", course: "151 & 152" },
      Tue: { enabled: false, time: "", course: "151 & 152" },
      Wed: { enabled: false, time: "", course: "151 & 152" },
      Thu: { enabled: false, time: "", course: "151 & 152" },
      Fri: { enabled: false, time: "", course: "151 & 152" },
    })
    setShowAddTutor(true)
  }

  const handleStartEditTutor = (name: string, shifts: TutorShift[]) => {
    setEditingTutorOriginalName(name)
    setTutorName(name)
    const primaryCourse = shifts[0]?.course || "Intro to Programming (151)"
    setTutorCourse(primaryCourse)

    const newDays: Record<WeekDay, {
      enabled: boolean
      time: string
      course: string
    }> = {
      Mon: { enabled: false, time: "", course: primaryCourse },
      Tue: { enabled: false, time: "", course: primaryCourse },
      Wed: { enabled: false, time: "", course: primaryCourse },
      Thu: { enabled: false, time: "", course: primaryCourse },
      Fri: { enabled: false, time: "", course: primaryCourse },
    }

    shifts.forEach((s) => {
      newDays[s.day] = {
        enabled: true,
        time: s.time,
        course: s.course,
      }
    })

    setTutorDays(newDays)
    setShowAddTutor(true)
  }

  const handleSaveTutorSchedule = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tutorName.trim()) return

    const daysToSave: { day: WeekDay; course: string; time: string }[] = []
    ;(["Mon", "Tue", "Wed", "Thu", "Fri"] as WeekDay[]).forEach((d) => {
      const entry = tutorDays[d]
      if (entry.enabled && entry.time.trim()) {
        daysToSave.push({
          day: d,
          course: entry.course || tutorCourse,
          time: entry.time.trim(),
        })
      }
    })

    if (daysToSave.length === 0) {
      alert("Please enable at least one day and enter their times.")
      return
    }

    engine.saveTutorSchedule(
      127,
      tutorName.trim(),
      daysToSave,
      editingTutorOriginalName || undefined,
    )

    setShowAddTutor(false)
    setTutorName("")
    setEditingTutorOriginalName(null)
  }

  const handleDeleteTutor = (tutorToDelete: string) => {
    if (
      confirm(`Remove ${tutorToDelete} from the weekly tutoring schedule?`)
    ) {
      engine.removeTutor(127, tutorToDelete)
    }
  }

  const handleIcsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    try {
      const text = await file.text()
      const result = parseIcs(text)

      if (result.total === 0) {
        setImportMsg({
          type: "error",
          text: "No events found in that .ics file.",
        })
        return
      }
      if (result.events.length === 0) {
        setImportMsg({
          type: "error",
          text: `All ${result.skippedPast} event${
            result.skippedPast === 1 ? "" : "s"
          } have already passed.`,
        })
        return
      }

      engine.addEvents(result.events)
      setImportMsg({
        type: "ok",
        text: `Imported ${result.events.length} event${
          result.events.length === 1 ? "" : "s"
        } from .ics calendar.`,
      })
    } catch {
      setImportMsg({ type: "error", text: "Could not read that .ics file." })
    }
  }

  const handleBroadcastAlert = (e: React.FormEvent) => {
    e.preventDefault()
    if (!alertText.trim()) return
    engine.setUrgentAlert({
      active: true,
      message: alertText.trim(),
      level: alertLevel,
    })
  }

  const handleDismissAlert = () => {
    engine.setUrgentAlert(null)
  }

  const handleAddEventSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventTitle.trim()) return
    engine.addEvent({
      title: eventTitle.trim(),
      date: eventDate.trim(),
      time: eventTime.trim(),
      location: eventLocation.trim(),
      category: eventCategory,
      isToday: eventIsToday,
      description: eventDescription.trim() || undefined,
    })
    setEventTitle("")
    setEventDescription("")
    setShowAddEvent(false)
  }

  const handleStartEditEvent = (ev: EventAnnouncement) => {
    setEditingEventId(ev.id)
    setEditEventTitle(ev.title)
    setEditEventDate(ev.date)
    setEditEventTime(ev.time)
    setEditEventLocation(ev.location)
    setEditEventCategory(ev.category)
    setEditEventDescription(ev.description || "")
    setEditEventIsToday(!!ev.isToday)
  }

  const handleSaveEditEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEventId || !editEventTitle.trim()) return
    engine.updateEvent(editingEventId, {
      title: editEventTitle.trim(),
      date: editEventDate.trim(),
      time: editEventTime.trim(),
      location: editEventLocation.trim(),
      category: editEventCategory,
      description: editEventDescription.trim() || undefined,
      isToday: editEventIsToday,
    })
    setEditingEventId(null)
  }

  const handleStartEditSlide = (slide: SlideItem) => {
    setEditingSlideId(slide.id)
    setEditSlideTitle(slide.title)
    setEditSlideSubtitle(slide.subtitle)
    setEditSlideCategory(slide.category)
    setEditSlideCaption(slide.caption || "")
    setEditSlideDuration(
      slide.durationSeconds || (slide.mediaType === "video" ? 15 : 8),
    )
  }

  const handleSaveEditSlide = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSlideId || !editSlideTitle.trim()) return
    engine.updateSlide(editingSlideId, {
      title: editSlideTitle.trim(),
      subtitle: editSlideSubtitle.trim(),
      category: editSlideCategory.trim() || "Spotlight",
      caption: editSlideCaption.trim() || undefined,
      durationSeconds: editSlideDuration > 0 ? editSlideDuration : 8,
    })
    setEditingSlideId(null)
  }

  return (
    <div
      className={`flex flex-col bg-[#0b1329] text-white ${
        isInline
          ? "h-full w-full overflow-y-auto p-4 sm:p-6"
          : "fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:max-w-xl z-50 shadow-2xl overflow-y-auto p-4 sm:p-6 border-l border-[#02275A]/40 backdrop-blur-xl"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#02275A] text-white shadow-md">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-wide text-white">
              Staff Admin Controller
            </h2>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Live Mesh Active · {connectedClients.length} Connected
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => engine.sendPulse()}
            title="Send pulse ping to test real-time connection across tabs"
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-white/10"
          >
            <Radio className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Test Ping</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6 flex-1">
        {/* Real-time sync activity banner */}
        {state.lastAction && (
          <div className="p-3 rounded-xl bg-blue-950/60 border border-[#02275A]/40 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <div className="truncate">
                <span className="text-white/60">Last Sync: </span>
                <span className="font-bold text-white">
                  {state.lastAction.description}
                </span>
              </div>
            </div>
            <span className="text-[10px] text-white/50 font-mono flex-shrink-0">
              v{state.version}
            </span>
          </div>
        )}

        {/* 1. Lab 126 Controller */}
        {lab126 && (
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#02275A]" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Lab 126 Controls
                </h3>
              </div>
              <span className="text-xs font-bold text-sky-400">
                Live on Board: {getEffectiveLabStatus(lab126)}
                {getEffectiveLabStatus(lab126) !== lab126.status && ` (Manual: ${lab126.status})`}
              </span>
            </div>

            {/* Status Selectors */}
            <div>
              <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1.5">
                Set Live Status (Instantly Updates TV)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  "Open",
                  "Closed",
                  "Reserved",
                ] as LabStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleLab126Status(st)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      lab126.status === st
                        ? st === "Open"
                          ? "bg-emerald-600 text-white shadow-md"
                          : st === "Closed"
                            ? "bg-red-600 text-white shadow-md"
                            : "bg-amber-600 text-white shadow-md"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Hours */}
            <div className="pt-2 border-t border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-400 uppercase font-bold block">
                  Lab 126 Hours (15-min intervals)
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  Syncs live to TV board
                </span>
              </div>
              <LabHoursIntervalPicker
                label="Mon – Thu"
                value={lab126.hours.monThu}
                onCommit={(v) =>
                  engine.updateLab(126, {
                    hours: { ...lab126.hours, monThu: v },
                  })
                }
              />
              <LabHoursIntervalPicker
                label="Fri"
                value={lab126.hours.fri}
                onCommit={(v) =>
                  engine.updateLab(126, { hours: { ...lab126.hours, fri: v } })
                }
              />
              <LabHoursIntervalPicker
                label="Weekend"
                value={lab126.hours.weekend || "Closed"}
                onCommit={(v) =>
                  engine.updateLab(126, {
                    hours: { ...lab126.hours, weekend: v },
                  })
                }
              />
            </div>

            {/* Class schedule for Lab 126 */}
            <LabClassScheduleManager lab={lab126} engine={engine} />
          </div>
        )}

        {/* 2. Lab 127 Controller */}
        {lab127 && (
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Lab 127 Controls (Tutoring & Senior Design)
                </h3>
              </div>
              <span className="text-xs font-bold text-purple-400">
                Live on Board: {getEffectiveLabStatus(lab127)}
                {getEffectiveLabStatus(lab127) !== lab127.status && ` (Manual: ${lab127.status})`}
              </span>
            </div>

            {/* Status Selectors */}
            <div>
              <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1.5">
                Set Live Status
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  "Open",
                  "Closed",
                  "Reserved",
                ] as LabStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleLab127Status(st)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      lab127.status === st
                        ? st === "Open"
                          ? "bg-emerald-600 text-white shadow-md"
                          : st === "Closed"
                            ? "bg-red-600 text-white shadow-md"
                            : "bg-amber-600 text-white shadow-md"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Hours */}
            <div className="pt-2 border-t border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-400 uppercase font-bold block">
                  Lab 127 Hours (15-min intervals)
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  Syncs live to TV board
                </span>
              </div>
              <LabHoursIntervalPicker
                label="Mon – Thu"
                value={lab127.hours.monThu}
                onCommit={(v) =>
                  engine.updateLab(127, {
                    hours: { ...lab127.hours, monThu: v },
                  })
                }
              />
              <LabHoursIntervalPicker
                label="Fri"
                value={lab127.hours.fri}
                onCommit={(v) =>
                  engine.updateLab(127, { hours: { ...lab127.hours, fri: v } })
                }
              />
              <LabHoursIntervalPicker
                label="Weekend"
                value={lab127.hours.weekend || "Closed"}
                onCommit={(v) =>
                  engine.updateLab(127, {
                    hours: { ...lab127.hours, weekend: v },
                  })
                }
              />

              <div className="pt-2 border-t border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-purple-300 uppercase font-bold flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Active Tutors & Schedules</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleStartAddTutor}
                    className="text-[10px] font-bold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-500/30 flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Tutor</span>
                  </button>
                </div>

                {/* Add Tutor & Pick Times by Days Form */}
                {showAddTutor && (
                  <form
                    onSubmit={handleSaveTutorSchedule}
                    className="p-3 bg-slate-900/95 rounded-xl border border-sky-500/40 space-y-2.5 animate-in fade-in duration-200"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-sky-400" />
                        <span className="text-[11px] font-bold text-sky-300">
                          {editingTutorOriginalName
                            ? `Edit: ${editingTutorOriginalName}`
                            : "Add Tutor & Hours"}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400">
                        Pick times by day
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">
                          Tutor Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={tutorName}
                          onChange={(e) => setTutorName(e.target.value)}
                          placeholder="e.g. Cole, James, Erick, Aniya"
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">
                          Default Course
                        </label>
                        <select
                          value={tutorCourse}
                          onChange={(e) => {
                            const c = e.target.value
                            setTutorCourse(c)
                            setTutorDays((prev) => {
                              const updated = { ...prev }
                              ;([
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                              ] as WeekDay[]).forEach((d) => {
                                if (
                                  updated[d].enabled &&
                                  (!updated[d].course ||
                                    updated[d].course === tutorCourse)
                                ) {
                                  updated[d] = { ...updated[d], course: c }
                                }
                              })
                              return updated
                            })
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                        >
                          <option value="151 & 152">
                            151 & 152
                          </option>
                          <option value="251">
                            251
                          </option>
                        </select>
                      </div>
                    </div>

                    {/* Pick times by days */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                        Pick Times by Day (Mon – Fri)
                      </label>

                      {(["Mon", "Tue", "Wed", "Thu", "Fri"] as WeekDay[]).map(
                        (day) => {
                          const entry = tutorDays[day]
                          const dayNames: Record<WeekDay, string> = {
                            Mon: "Monday",
                            Tue: "Tuesday",
                            Wed: "Wednesday",
                            Thu: "Thursday",
                            Fri: "Friday",
                          }

                          return (
                            <div
                              key={day}
                              className={`p-1.5 rounded border transition-all ${
                                entry.enabled
                                  ? "bg-slate-800/90 border-sky-500/50"
                                  : "bg-slate-900/50 border-slate-800 opacity-70"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={entry.enabled}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked
                                      setTutorDays((prev) => ({
                                        ...prev,
                                        [day]: {
                                          ...prev[day],
                                          enabled: isChecked,
                                          time:
                                            isChecked && !prev[day].time
                                              ? "2:00 PM – 4:00 PM"
                                              : prev[day].time,
                                          course:
                                            prev[day].course || tutorCourse,
                                        },
                                      }))
                                    }}
                                    className="rounded border-slate-700 text-[#02275A] focus:ring-0 cursor-pointer"
                                  />
                                  <span
                                    className={`text-[11px] font-bold ${
                                      entry.enabled
                                        ? "text-white"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {dayNames[day]} ({day})
                                  </span>
                                </label>

                                {entry.enabled ? (
                                  <select
                                    value={entry.course}
                                    onChange={(e) => {
                                      const newCourse = e.target.value
                                      setTutorDays((prev) => ({
                                        ...prev,
                                        [day]: {
                                          ...prev[day],
                                          course: newCourse,
                                        },
                                      }))
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9.5px] text-sky-300 font-bold focus:outline-none"
                                  >
                                    <option value="151 & 152">
                                      151 & 152
                                    </option>
                                    <option value="251">
                                      251
                                    </option>
                                  </select>
                                ) : (
                                  <span className="text-[9.5px] text-slate-500 italic">
                                    Off
                                  </span>
                                )}
                              </div>

                              {entry.enabled && (
                                <div className="space-y-1 mt-1 pl-5">
                                  <input
                                    type="text"
                                    value={entry.time}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      setTutorDays((prev) => ({
                                        ...prev,
                                        [day]: { ...prev[day], time: val },
                                      }))
                                    }}
                                    placeholder="e.g. 11:50 AM – 1:00 PM or 1-2 then 3-6"
                                    className="w-full px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] font-mono"
                                  />

                                  <div className="flex flex-wrap gap-1">
                                    {[
                                      "11:50 AM – 1:00 PM",
                                      "1:00 PM – 2:00 PM & 3:00 PM – 6:00 PM",
                                      "2:00 PM – 4:00 PM",
                                      "3:30 PM – 5:00 PM",
                                      "5:00 PM – 6:00 PM",
                                    ].map((preset) => (
                                      <button
                                        key={preset}
                                        type="button"
                                        onClick={() => {
                                          setTutorDays((prev) => ({
                                            ...prev,
                                            [day]: {
                                              ...prev[day],
                                              time: preset,
                                            },
                                          }))
                                        }}
                                        className="text-[8.5px] px-1 py-0.2 rounded bg-slate-700/60 hover:bg-slate-700 text-slate-300 font-mono transition cursor-pointer"
                                      >
                                        {preset.length > 18
                                          ? preset.slice(0, 16) + "..."
                                          : preset}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        },
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 py-1 rounded bg-[#02275A] hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1 shadow transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Save Tutor Schedule</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddTutor(false)
                          setEditingTutorOriginalName(null)
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Active Tutors List grouped by tutor */}
                <div className="space-y-1.5">
                  {(() => {
                    const shifts = lab127.tutorShifts || []
                    if (shifts.length === 0) {
                      return (
                        <p className="text-[11px] text-slate-500 italic p-2 bg-slate-800/40 rounded text-center">
                          No tutors added yet. Click &quot;Add Tutor&quot; above
                          to set up peer tutors and their days.
                        </p>
                      )
                    }

                    const tutorMap: Record<string, TutorShift[]> = {}
                    shifts.forEach((s) => {
                      if (!tutorMap[s.tutorName]) {
                        tutorMap[s.tutorName] = []
                      }
                      tutorMap[s.tutorName].push(s)
                    })

                    return Object.entries(tutorMap).map(([tutor, tShifts]) => {
                      const courses = Array.from(
                        new Set(tShifts.map((s) => s.course)),
                      )
                      return (
                        <div
                          key={tutor}
                          className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/70 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-5 h-5 rounded-full bg-[#02275A]/30 text-sky-300 flex items-center justify-center font-bold text-[10px] border border-sky-400/40 flex-shrink-0">
                                {tutor.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <span className="font-extrabold text-white text-xs block truncate">
                                  {tutor}
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {courses.map((c) => (
                                    <span
                                      key={c}
                                      className="text-[8px] font-bold px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                    >
                                      {c.toLowerCase().includes("intro") ||
                                      c.includes("151") ||
                                      c.includes("152")
                                        ? "151 & 152"
                                        : "251"}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleStartEditTutor(tutor, tShifts)
                                }
                                title="Edit Tutor Times"
                                className="p-1 rounded text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 transition cursor-pointer flex items-center gap-1 text-[9.5px] font-bold"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTutor(tutor)}
                                title="Delete Tutor"
                                className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 border-t border-slate-700/50">
                            {tShifts.map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-800 text-[9.5px]"
                              >
                                <span className="font-bold text-sky-300 bg-sky-500/20 px-1 rounded border border-sky-500/30 font-mono">
                                  {s.day}
                                </span>
                                <span className="text-white/90 font-mono text-[9px] truncate ml-1">
                                  {s.time}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>

            {/* Class schedule for Lab 127 */}
            <LabClassScheduleManager lab={lab127} engine={engine} />
          </div>
        )}

        {/* 3. Urgent Alert Broadcast Form */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                Urgent Campus Broadcast Banner
              </h3>
            </div>
            {state.urgentAlert?.active && (
              <span className="text-[10px] bg-red-600 font-black px-2 py-0.5 rounded uppercase">
                Active on Screen
              </span>
            )}
          </div>

          <form onSubmit={handleBroadcastAlert} className="space-y-2.5">
            <textarea
              rows={2}
              value={alertText}
              onChange={(e) => setAlertText(e.target.value)}
              placeholder="Type urgent campus announcement or notice..."
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] resize-none"
            />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {(["info", "warning", "emergency"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setAlertLevel(level)}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      alertLevel === level
                        ? level === "emergency"
                          ? "bg-red-600 text-white"
                          : level === "warning"
                            ? "bg-amber-600 text-white"
                            : "bg-[#02275A] text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {state.urgentAlert?.active && (
                  <button
                    type="button"
                    onClick={handleDismissAlert}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Dismiss
                  </button>
                )}
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-[#02275A] hover:bg-[#02275A]/80 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Broadcast Now</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* 4. Center Screen Slideshow Media Manager (Photos & Videos) */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              Slideshow Media ({(state.slides || []).length})
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAddMedia(!showAddMedia)}
                className="py-1 px-2 rounded-lg bg-[#02275A] hover:bg-[#02275A]/80 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
              >
                <Plus className="w-3 h-3" />
                <span>{showAddMedia ? "Close" : "Upload"}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  engine.toggleCarouselPause(!state.isCarouselPaused)
                }
                className={`py-1 px-2 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                  state.isCarouselPaused
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-amber-600 hover:bg-amber-500 text-white"
                }`}
              >
                {state.isCarouselPaused ? (
                  <Play className="w-3 h-3 fill-current" />
                ) : (
                  <Pause className="w-3 h-3 fill-current" />
                )}
                <span>{state.isCarouselPaused ? "Play" : "Pause"}</span>
              </button>
            </div>
          </div>

          {/* Upload Success */}
          {mediaUploadSuccess && (
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-600 text-emerald-200 text-xs flex items-center justify-between">
              <span>✓ {mediaUploadSuccess}</span>
              <button
                type="button"
                onClick={() => setMediaUploadSuccess(null)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          {/* Upload Form */}
          {showAddMedia && (
            <form
              onSubmit={handleMediaUploadSubmit}
              className="p-3 rounded-lg bg-slate-800/90 border border-slate-700 space-y-3"
            >
              <input
                ref={mediaFileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleSelectMediaFile(file)
                }}
                className="hidden"
              />

              {mediaPreviewUrl ? (
                <div className="rounded-lg overflow-hidden bg-black/60 border border-slate-700 p-2 flex flex-col items-center gap-2">
                  {mediaType === "video" ? (
                    <video
                      src={mediaPreviewUrl}
                      controls
                      className="max-h-40 rounded bg-black"
                    />
                  ) : (
                    <img
                      src={mediaPreviewUrl}
                      alt="Preview"
                      className="max-h-40 rounded object-contain bg-black"
                    />
                  )}
                  <div className="flex items-center justify-between w-full text-[11px] text-slate-300">
                    <span className="truncate max-w-[200px]">
                      {mediaFile?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => mediaFileInputRef.current?.click()}
                      className="px-2 py-0.5 rounded bg-slate-700 text-white hover:bg-slate-600"
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => mediaFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-600 hover:border-[#02275A] rounded-lg p-5 text-center cursor-pointer bg-slate-900/50 hover:bg-slate-900/80"
                >
                  <Upload className="w-5 h-5 text-sky-400 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-white">
                    Click to upload photo or video
                  </p>
                  <p className="text-[10px] text-slate-400">
                    JPG, PNG, WEBP, MP4, WebM, MOV
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <input
                  type="text"
                  required
                  placeholder="Slide Title *"
                  value={mediaTitle}
                  onChange={(e) => setMediaTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Subtitle / Location / Date"
                  value={mediaSubtitle}
                  onChange={(e) => setMediaSubtitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={mediaCategory}
                    onChange={(e) => setMediaCategory(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                  >
                    <option value="Campus Announcement">
                      Campus Announcement
                    </option>
                    <option value="Club Announcement">Club Announcement</option>
                    <option value="Department Spotlight">
                      Department Spotlight
                    </option>
                    <option value="Industry Partner">Industry Partner</option>
                    <option value="Student Showcase">Student Showcase</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={3}
                      max={120}
                      value={mediaDuration}
                      onChange={(e) => setMediaDuration(Number(e.target.value))}
                      className="w-16 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400">
                      sec on TV
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMedia(false)
                    setMediaFile(null)
                    setMediaPreviewUrl(null)
                  }}
                  className="px-3 py-1 rounded-lg bg-slate-700 text-xs text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    !mediaFile || !mediaTitle.trim() || isUploadingMedia
                  }
                  className="px-3.5 py-1 rounded-lg bg-[#02275A] hover:bg-[#02275A]/80 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" />
                  <span>
                    {isUploadingMedia ? "Publishing..." : "Publish to TV"}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Slides List */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-bold uppercase tracking-wider text-[10px]">
                Slides Rotation:
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Reset to default slides?"))
                    engine.resetSlidesToDefault()
                }}
                className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset Defaults</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {(state.slides || []).map((slide, idx) => {
                const isCurrent = state.activeSlideIndex === idx
                const isVid =
                  slide.mediaType === "video" ||
                  Boolean(
                    slide.url &&
                      (slide.url.match(/\.(mp4|webm|mov|ogg)$/i) ||
                        slide.url.startsWith("data:video/")),
                  )

                return (
                  <div key={slide.id} className="space-y-1">
                    <div
                      className={`p-2 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                        isCurrent
                          ? "bg-blue-950/40 border-[#02275A] ring-1 ring-[#02275A]"
                          : "bg-slate-800/60 border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-10 h-8 rounded bg-black flex-shrink-0 overflow-hidden border border-slate-700 flex items-center justify-center">
                          {isVid ? (
                            <Video className="w-3 h-3 text-red-400" />
                          ) : (
                            <ImageIcon className="w-3 h-3 text-sky-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-sky-400">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-white truncate text-[11px]">
                              {slide.title}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-extrabold text-emerald-400 animate-pulse">
                                LIVE
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">
                            {slide.category} · {slide.durationSeconds || 6}s
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEditSlide(slide)}
                          title="Edit title, description, or duration"
                          className={`p-1 rounded cursor-pointer transition-colors ${
                            editingSlideId === slide.id
                              ? "bg-sky-600 text-white"
                              : "bg-slate-700 hover:bg-sky-600 text-slate-300 hover:text-white"
                          }`}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => engine.setActiveSlide(idx)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            isCurrent
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-700 hover:bg-[#02275A] text-white"
                          }`}
                        >
                          {isCurrent ? "Live" : "Show"}
                        </button>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveSlide(idx, "up")}
                          className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white cursor-pointer"
                        >
                          <ArrowUp className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === (state.slides || []).length - 1}
                          onClick={() => handleMoveSlide(idx, "down")}
                          className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white cursor-pointer"
                        >
                          <ArrowDown className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="p-1 rounded bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white cursor-pointer"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Edit Slide Form */}
                    {editingSlideId === slide.id && (
                      <form
                        onSubmit={handleSaveEditSlide}
                        className="p-2.5 bg-slate-900 rounded-lg border border-sky-500/50 space-y-2 mt-1 animate-in fade-in duration-200"
                      >
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1">
                            <Pencil className="w-3 h-3" />
                            <span>Edit Slide #{idx + 1}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingSlideId(null)}
                            className="text-slate-400 hover:text-white cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                              Title
                            </label>
                            <input
                              type="text"
                              required
                              value={editSlideTitle}
                              onChange={(e) =>
                                setEditSlideTitle(e.target.value)
                              }
                              className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                              Subtitle
                            </label>
                            <input
                              type="text"
                              value={editSlideSubtitle}
                              onChange={(e) =>
                                setEditSlideSubtitle(e.target.value)
                              }
                              className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                              Category
                            </label>
                            <input
                              type="text"
                              value={editSlideCategory}
                              onChange={(e) =>
                                setEditSlideCategory(e.target.value)
                              }
                              className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                              Duration (s)
                            </label>
                            <input
                              type="number"
                              min={3}
                              max={120}
                              value={editSlideDuration}
                              onChange={(e) =>
                                setEditSlideDuration(Number(e.target.value))
                              }
                              className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                            Description / Caption
                          </label>
                          <textarea
                            rows={2}
                            value={editSlideCaption}
                            onChange={(e) =>
                              setEditSlideCaption(e.target.value)
                            }
                            placeholder="Caption displayed on TV..."
                            className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] resize-none"
                          />
                        </div>

                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="submit"
                            className="py-1 px-3 rounded bg-[#02275A] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Save Changes</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSlideId(null)}
                            className="py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 5. Add / Manage Event Announcements */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Event Announcements ({state.events.length})
            </h3>
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".ics,text/calendar"
                onChange={handleIcsFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import .ics</span>
              </button>
              <button
                onClick={() => setShowAddEvent(!showAddEvent)}
                className="py-1 px-2.5 rounded-lg bg-[#02275A] hover:bg-[#02275A]/80 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddEvent ? "Cancel" : "New Event"}</span>
              </button>
            </div>
          </div>

          {importMsg && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center justify-between gap-2 border ${
                importMsg.type === "ok"
                  ? "bg-emerald-950/60 border-emerald-700 text-emerald-200"
                  : "bg-red-950/60 border-red-800 text-red-200"
              }`}
            >
              <span>{importMsg.text}</span>
              <button
                onClick={() => setImportMsg(null)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {showAddEvent && (
            <form
              onSubmit={handleAddEventSubmit}
              className="space-y-2.5 bg-slate-800/80 p-3 rounded-lg border border-slate-700"
            >
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ACM Coding Interview Workshop"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Date
                  </label>
                  <input
                    type="text"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Time
                  </label>
                  <input
                    type="text"
                    required
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    required
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Category
                  </label>
                  <select
                    value={eventCategory}
                    onChange={(e) => setEventCategory(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                  >
                    <option value="Capstone">Capstone</option>
                    <option value="Workshop">Workshop</option>
                    <option value="Club">Club</option>
                    <option value="Lecture">Lecture</option>
                    <option value="Career">Career</option>
                    <option value="Hackathon">Hackathon</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  Description / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  placeholder="Details shown on TV announcement ticker & cards..."
                  className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="eventToday"
                  checked={eventIsToday}
                  onChange={(e) => setEventIsToday(e.target.checked)}
                  className="rounded text-[#02275A]"
                />
                <label
                  htmlFor="eventToday"
                  className="text-xs text-white font-medium cursor-pointer"
                >
                  Feature as "Happening Today"
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Publish Announcement (Syncs to All Screens)
              </button>
            </form>
          )}

          {/* Quick list of current events with inline edit & delete */}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {state.events.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-2 text-center">
                No event announcements active.
              </p>
            ) : (
              state.events.map((ev) => {
                const isEditing = editingEventId === ev.id

                if (isEditing) {
                  return (
                    <form
                      key={ev.id}
                      onSubmit={handleSaveEditEvent}
                      className="p-3 rounded-lg bg-slate-800 border-2 border-emerald-500/80 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between pb-1 border-b border-slate-700">
                        <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                          <Pencil className="w-3 h-3" />
                          <span>Edit Event</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingEventId(null)}
                          className="text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div>
                        <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                          Event Title
                        </label>
                        <input
                          type="text"
                          required
                          value={editEventTitle}
                          onChange={(e) => setEditEventTitle(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                            Date
                          </label>
                          <input
                            type="text"
                            required
                            value={editEventDate}
                            onChange={(e) => setEditEventDate(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                            Time
                          </label>
                          <input
                            type="text"
                            required
                            value={editEventTime}
                            onChange={(e) => setEditEventTime(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                            Location
                          </label>
                          <input
                            type="text"
                            required
                            value={editEventLocation}
                            onChange={(e) =>
                              setEditEventLocation(e.target.value)
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                            Category
                          </label>
                          <select
                            value={editEventCategory}
                            onChange={(e) =>
                              setEditEventCategory(e.target.value as any)
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                          >
                            <option value="Capstone">Capstone</option>
                            <option value="Workshop">Workshop</option>
                            <option value="Club">Club</option>
                            <option value="Lecture">Lecture</option>
                            <option value="Career">Career</option>
                            <option value="Hackathon">Hackathon</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] text-slate-400 uppercase font-bold block mb-0.5">
                          Description / Notes
                        </label>
                        <textarea
                          rows={2}
                          value={editEventDescription}
                          onChange={(e) =>
                            setEditEventDescription(e.target.value)
                          }
                          placeholder="Brief description or agenda..."
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] resize-none"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-0.5">
                        <input
                          type="checkbox"
                          id={`adminEventToday-${ev.id}`}
                          checked={editEventIsToday}
                          onChange={(e) =>
                            setEditEventIsToday(e.target.checked)
                          }
                          className="rounded text-[#02275A]"
                        />
                        <label
                          htmlFor={`adminEventToday-${ev.id}`}
                          className="text-[11px] text-white font-medium cursor-pointer"
                        >
                          Feature as "Happening Today"
                        </label>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="submit"
                          className="py-1 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Save Changes</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingEventId(null)}
                          className="py-1 px-2.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )
                }

                return (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded-lg bg-slate-800 flex items-start justify-between gap-2 text-xs border border-slate-700/60 hover:bg-slate-750 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-white truncate">
                          {ev.title}
                        </span>
                        <span className="text-[9px] font-semibold uppercase px-1 py-0.2 rounded bg-slate-700 text-sky-300">
                          {ev.category}
                        </span>
                        {ev.isToday && (
                          <span className="text-[9px] font-bold bg-amber-400 text-slate-950 px-1 py-0.2 rounded uppercase">
                            Today
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {ev.date} · {ev.time} · {ev.location}
                      </div>
                      {ev.description && (
                        <p className="text-[10px] text-slate-300/80 italic mt-1 line-clamp-2 bg-slate-900/50 p-1 rounded border border-slate-800">
                          {ev.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleStartEditEvent(ev)}
                        title="Edit event details"
                        className="p-1 rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-700 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => engine.removeEvent(ev.id)}
                        title="Remove event"
                        className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 6. System Reset */}
        <div className="pt-2">
          <button
            onClick={() => engine.resetToDefaults()}
            className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-red-950/40 hover:text-red-300 text-slate-400 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Demo to Original Defaults</span>
          </button>
        </div>
      </div>
    </div>
  )
}
