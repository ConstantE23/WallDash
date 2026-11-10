import React, { useRef, useState, useEffect } from "react"
import {
  Tv,
  Eye,
  EyeOff,
  Clock,
  Crop,
  LogOut,
  ShieldCheck,
  Plus,
  Trash2,
  Pencil,
  ArrowUp,
  ArrowDown,
  Upload,
  Video,
  Image as ImageIcon,
  Play,
  Pause,
  X,
  Images,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Building2,
  GraduationCap,
  Megaphone,
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
  SignageUser,
} from "../types/signage"
import { SyncEngine } from "../services/syncEngine"
import { parseIcs } from "../utils/ics"
import TvPreviewPanel from "./TvPreviewPanel"
import LabHoursIntervalPicker from "./LabHoursIntervalPicker"
import { getEffectiveLabStatus } from "../utils/labHours"
import LabClassScheduleManager from "./LabClassScheduleManager"
import { getUserDatabase } from "../services/userDatabase"
import { uploadSlideMedia, validateMediaFile } from "../services/mediaStorage"
import ManageLoginPage from "./ManageLoginPage"
import AdminPortalModal from "./AdminPortalModal"
import EventDatePicker from "./EventDatePicker"
import {
  parseEventDate,
  formatEventDate,
  endOfDay,
  getCalendarGrid,
  getEventDateSpan,
  getEventDayPosition,
  getEventDisplayDate,
  isEventOnDay,
  isSameDay,
  isSlideExpiredByDate,
  isSlideVisibleOnTv,
  sortEventsChronologically,
  MONTH_NAMES_FULL,
  DAY_NAMES_ABBR,
} from "../utils/datePickerUtils"
import { ui, segment } from "./manageStyles"
import { getTutorCourses } from "../data/initialData"

type Section = "slides" | "preview" | "events" | "labs" | "tutoring" | "alert"

const WEEKDAYS: WeekDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri"]
const DAY_NAMES: Record<WeekDay, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
}
const EVENT_CATEGORIES: EventAnnouncement["category"][] = [
  "Department Event",
  "Campus Events",
  "Capstone",
  "Workshop",
  "Club",
  "Lecture",
  "Career",
  "Hackathon",
]
const SLIDE_CATEGORIES = [
  "Campus Announcement",
  "Club Announcement",
  "Department Spotlight",
  "Industry Partner",
  "Campus Facilities",
  "Student Showcase",
  "Career & Research",
]
type TutorDays = Record<WeekDay, { enabled: boolean; time: string }>

function emptyTutorDays(): TutorDays {
  return {
    Mon: { enabled: true, time: "" },
    Tue: { enabled: false, time: "" },
    Wed: { enabled: false, time: "" },
    Thu: { enabled: false, time: "" },
    Fri: { enabled: false, time: "" },
  }
}

const LAB_TITLES: Record<number, string> = {
  126: "Lab 126 · Computer Lab",
  127: "Lab 127 · Senior Design & Tutoring",
}

interface ManagePageProps {
  engine: SyncEngine
  state: SignageState
  connectedClients: ConnectedClient[]
  onNavigateToTv: () => void
}

export default function ManagePage({
  engine,
  state,
  connectedClients,
  onNavigateToTv,
}: ManagePageProps) {
  // User Authentication & Admin Portal State
  const db = getUserDatabase()
  const [authenticatedUser, setAuthenticatedUser] = useState<SignageUser | null>(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [showAdminPortal, setShowAdminPortal] = useState(false)
  const [loginNotice, setLoginNotice] = useState<string | null>(null)
  const isSigningOutRef = useRef(false)

  useEffect(() => {
    // Restore an existing Supabase (or local dev) session
    let cancelled = false
    db.restoreSession()
      .then((user) => {
        if (!cancelled && user) {
          setAuthenticatedUser(user)
          engine.purgeExpiredEvents()
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsAuthChecking(false)
      })

    // Expired or revoked sessions send staff back to the login view
    const unsubSession = db.onSessionChange((user) => {
      if (user) {
        setAuthenticatedUser(user)
        engine.purgeExpiredEvents()
        return
      }
      setAuthenticatedUser((prev) => {
        if (prev && !isSigningOutRef.current) {
          setLoginNotice("Your session has expired. Please sign in again.")
        }
        return null
      })
    })

    return () => {
      cancelled = true
      unsubSession()
    }
  }, [db])

  const handleSignOut = async () => {
    isSigningOutRef.current = true
    try {
      await db.signOut()
    } finally {
      isSigningOutRef.current = false
      setLoginNotice(null)
      setAuthenticatedUser(null)
    }
  }

  // Alert form state
  const [alertText, setAlertText] = useState(state.urgentAlert?.message || "")
  const [alertLevel, setAlertLevel] =
    useState<"info" | "warning" | "emergency">("info")

  // New Event / Schedule form state
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [eventTitle, setEventTitle] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [eventEndDate, setEventEndDate] = useState("")
  const [eventIsMultiDay, setEventIsMultiDay] = useState(false)
  const [eventTime, setEventTime] = useState("")
  const [eventLocation, setEventLocation] = useState("")
  const [eventCategory, setEventCategory] =
    useState<EventAnnouncement["category"]>("Department Event")
  const [eventDescription, setEventDescription] = useState("")
  const [eventIsToday, setEventIsToday] = useState(false)

  // Edit Event / Schedule state
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editEventTitle, setEditEventTitle] = useState("")
  const [editEventDate, setEditEventDate] = useState("")
  const [editEventEndDate, setEditEventEndDate] = useState("")
  const [editEventIsMultiDay, setEditEventIsMultiDay] = useState(false)
  const [editEventTime, setEditEventTime] = useState("")
  const [editEventLocation, setEditEventLocation] = useState("")
  const [editEventCategory, setEditEventCategory] =
    useState<EventAnnouncement["category"]>("Workshop")
  const [editEventDescription, setEditEventDescription] = useState("")
  const [editEventIsToday, setEditEventIsToday] = useState(false)

  // Schedule Calendar view state inside ManagePage
  const [scheduleViewYear, setScheduleViewYear] = useState(() =>
    new Date().getFullYear(),
  )
  const [scheduleViewMonth, setScheduleViewMonth] = useState(() =>
    new Date().getMonth(),
  )
  const [scheduleSelectedDate, setScheduleSelectedDate] = useState<Date | null>(
    null,
  )

  // Current console section; previewSlideId picks the slide the Preview opens on
  const [section, setSection] = useState<Section>("slides")
  const [previewSlideId, setPreviewSlideId] = useState<string | null>(null)

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
  const [mediaHideAfterDate, setMediaHideAfterDate] = useState("")
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [mediaUploadProgress, setMediaUploadProgress] = useState<number | null>(
    null,
  )
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null)
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
  const [editSlideHideAfterDate, setEditSlideHideAfterDate] = useState("")
  const [slideFilter, setSlideFilter] = useState<"all" | "active" | "hidden">(
    "all",
  )

  // .ics import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<{
    type: "ok" | "error"
    text: string
  } | null>(null)

  // Tutor schedule builder state: Add tutor and pick times by day
  const [showAddTutor, setShowAddTutor] = useState(false)
  const [editingTutorOriginalName, setEditingTutorOriginalName] =
    useState<string | null>(null)
  const tutorCourses = getTutorCourses(state)
  const [tutorName, setTutorName] = useState("")
  const [tutorCourse, setTutorCourse] = useState(tutorCourses[0])
  const [tutorDays, setTutorDays] = useState<TutorDays>(emptyTutorDays())
  const [newCourseName, setNewCourseName] = useState("")

  const lab126 = state.labs[126]
  const lab127 = state.labs[127]

  const handleSelectMediaFile = (file: File) => {
    // Reject oversize / unsupported files before anything is uploaded
    const validationError = validateMediaFile(file)
    if (validationError) {
      setMediaUploadError(validationError)
      setMediaFile(null)
      setMediaPreviewUrl(null)
      return
    }
    setMediaUploadError(null)
    setMediaFile(file)
    const isVid =
      file.type.startsWith("video/") ||
      Boolean(file.name.match(/\.(mp4|webm|mov|ogg)$/i))
    const detectedType: "image" | "video" = isVid ? "video" : "image"
    setMediaType(detectedType)
    setMediaDuration(isVid ? 15 : 8)

    // Auto-fill title from filename if title is blank
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

    // Verify it is a valid local file from user's filesystem
    const isLocalFile = mediaFile instanceof File && mediaFile.size > 0
    if (!isLocalFile) {
      alert("Only local image and video files from your system can be uploaded.")
      return
    }

    const validationError = validateMediaFile(mediaFile)
    if (validationError) {
      setMediaUploadError(validationError)
      return
    }

    setIsUploadingMedia(true)
    setMediaUploadError(null)
    setMediaUploadProgress(0)
    try {
      const slideId = `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const userDb = getUserDatabase()

      // 1. Upload the file to Supabase Storage (or IndexedDB in local fallback)
      const uploaded = await uploadSlideMedia(
        slideId,
        mediaFile,
        mediaFile.name,
        (pct) => setMediaUploadProgress(pct),
      )

      await userDb.recordUpload({
        fileName: mediaFile.name,
        fileSize: mediaFile.size,
        fileType: mediaFile.type,
        mediaType,
        storageKey: uploaded.storagePath || slideId,
        previewUrl: uploaded.url,
        associatedSlideId: slideId,
        tags: [mediaCategory.toLowerCase(), "slide-upload"],
        customUser: authenticatedUser || undefined,
      })

      const parsedHideAfter = mediaHideAfterDate.trim()
        ? parseEventDate(mediaHideAfterDate)
        : null
      const hideAfterISO = parsedHideAfter
        ? endOfDay(parsedHideAfter).toISOString()
        : undefined

      // 2. Only after the upload is recorded, put it on the screens
      await engine.addSlide({
        id: slideId,
        title: mediaTitle.trim(),
        subtitle: mediaSubtitle.trim() || "Hampton University CS",
        category: mediaCategory.trim() || "Media Spotlight",
        caption: mediaCaption.trim(),
        url: uploaded.url,
        storagePath: uploaded.storagePath,
        hasStoredBlob: uploaded.hasStoredBlob,
        mediaType,
        durationSeconds:
          Number(mediaDuration) || (mediaType === "video" ? 15 : 8),
        fileName: mediaFile.name,
        hideAfterDate: mediaHideAfterDate.trim() || undefined,
        hideAfterISO,
      })

      setMediaUploadSuccess(
        `"${mediaTitle.trim()}" was added to the slideshow.`,
      )
      setMediaFile(null)
      setMediaPreviewUrl(null)
      setMediaTitle("")
      setMediaSubtitle("")
      setMediaCaption("")
      setMediaHideAfterDate("")
      setShowAddMedia(false)
      setTimeout(() => setMediaUploadSuccess(null), 5000)
    } catch (err) {
      console.error("Upload error:", err)
      setMediaUploadError(
        err instanceof Error
          ? err.message
          : "Failed to upload media. Nothing was published.",
      )
    } finally {
      setIsUploadingMedia(false)
      setMediaUploadProgress(null)
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
      confirm("Remove this slide from the slideshow? The file will be deleted.")
    ) {
      await engine.removeSlide(slideId)
    }
  }

  const handleStartAddTutor = () => {
    setEditingTutorOriginalName(null)
    setTutorName("")
    setTutorCourse(tutorCourses[0])
    setTutorDays(emptyTutorDays())
    setShowAddTutor(true)
  }

  const handleStartEditTutor = (name: string, shifts: TutorShift[]) => {
    setEditingTutorOriginalName(name)
    setTutorName(name)
    setTutorCourse(shifts[0]?.course || tutorCourses[0])

    const newDays = emptyTutorDays()
    newDays.Mon.enabled = false
    shifts.forEach((s) => {
      newDays[s.day] = { enabled: true, time: s.time }
    })

    setTutorDays(newDays)
    setShowAddTutor(true)
  }

  const handleSaveTutorSchedule = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tutorName.trim()) return

    // Every day uses the tutor's course
    const daysToSave: { day: WeekDay; course: string; time: string }[] = []
    WEEKDAYS.forEach((d) => {
      const entry = tutorDays[d]
      if (entry.enabled && entry.time.trim()) {
        daysToSave.push({ day: d, course: tutorCourse, time: entry.time.trim() })
      }
    })

    if (daysToSave.length === 0) {
      alert("Turn on at least one day and enter the hours.")
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

  const handleAddCourse = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newCourseName.trim()
    if (!name) return
    if (tutorCourses.some((c) => c.toLowerCase() === name.toLowerCase())) {
      alert(`"${name}" is already in the list.`)
      return
    }
    engine.addTutorCourse(name)
    setNewCourseName("")
  }

  const handleRemoveCourse = (course: string) => {
    const inUse = new Set(
      (lab127?.tutorShifts || [])
        .filter((s) => s.course === course)
        .map((s) => s.tutorName),
    ).size
    const message = inUse
      ? `Remove "${course}"? ${inUse} tutor${inUse === 1 ? " is" : "s are"} still assigned to it and will keep showing it until you edit them.`
      : `Remove "${course}" from the course list?`
    if (confirm(message)) engine.removeTutorCourse(course)
  }

  const handleDeleteTutor = (tutorToDelete: string) => {
    if (
      confirm(`Remove ${tutorToDelete} from the weekly tutoring schedule?`)
    ) {
      engine.removeTutor(127, tutorToDelete)
    }
  }

  const handleLab126Status = (status: LabStatus) => {
    engine.updateLab(126, { status })
  }

  const handleLab127Status = (status: LabStatus) => {
    engine.updateLab(127, { status })
  }

  const handleIcsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file later
    if (!file) return

    try {
      const text = await file.text()
      const result = parseIcs(text)

      if (result.total === 0) {
        setImportMsg({
          type: "error",
          text: "No events were found in that file. Is it a valid .ics calendar?",
        })
        return
      }
      if (result.events.length === 0) {
        setImportMsg({
          type: "error",
          text: `All ${result.skippedPast} event${
            result.skippedPast === 1 ? "" : "s"
          } in that file have already ended, so nothing was imported.`,
        })
        return
      }

      engine.addEvents(result.events)

      const notes: string[] = []
      if (result.skippedPast > 0)
        notes.push(`${result.skippedPast} past skipped`)
      if (result.recurring > 0)
        notes.push(`${result.recurring} recurring (first date only)`)
      setImportMsg({
        type: "ok",
        text: `Imported ${result.events.length} event${
          result.events.length === 1 ? "" : "s"
        }${
          notes.length ? ` (${notes.join(", ")})` : ""
        }. Now showing on the TV.`,
      })
    } catch {
      setImportMsg({ type: "error", text: "Could not read that file." })
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
    const parsedStart = parseEventDate(eventDate)
    const parsedEnd =
      eventIsMultiDay && eventEndDate.trim()
        ? parseEventDate(eventEndDate)
        : parsedStart

    const startDt =
      parsedStart && parsedEnd && parsedEnd.getTime() < parsedStart.getTime()
        ? parsedEnd
        : parsedStart
    const endDt =
      parsedStart && parsedEnd && parsedEnd.getTime() < parsedStart.getTime()
        ? parsedStart
        : parsedEnd || parsedStart

    const startISO = startDt
      ? new Date(
          startDt.getFullYear(),
          startDt.getMonth(),
          startDt.getDate(),
          0,
          0,
          0,
        ).toISOString()
      : undefined
    const endISO = endDt
      ? new Date(
          endDt.getFullYear(),
          endDt.getMonth(),
          endDt.getDate(),
          23,
          59,
          59,
        ).toISOString()
      : undefined

    const isMulti =
      Boolean(eventIsMultiDay && eventEndDate.trim()) &&
      Boolean(startDt && endDt && !isSameDay(startDt, endDt))

    engine.addEvent({
      title: eventTitle.trim(),
      date: eventDate.trim(),
      endDate: isMulti ? eventEndDate.trim() : undefined,
      isMultiDay: isMulti,
      time: eventTime.trim(),
      location: eventLocation.trim(),
      category: eventCategory,
      isToday: eventIsToday,
      description: eventDescription.trim() || undefined,
      startISO,
      endISO,
    })
    setEventTitle("")
    setEventDate("")
    setEventEndDate("")
    setEventIsMultiDay(false)
    setEventTime("")
    setEventLocation("")
    setEventDescription("")
    setEventIsToday(false)
    setShowAddEvent(false)
  }

  const handleStartEditEvent = (ev: EventAnnouncement) => {
    const span = getEventDateSpan(ev)
    setEditingEventId(ev.id)
    setEditEventTitle(ev.title)
    setEditEventDate(ev.date)
    setEditEventEndDate(
      ev.endDate ||
        (span.isMultiDay && span.endDate ? formatEventDate(span.endDate) : ""),
    )
    setEditEventIsMultiDay(span.isMultiDay)
    setEditEventTime(ev.time)
    setEditEventLocation(ev.location)
    setEditEventCategory(ev.category)
    setEditEventDescription(ev.description || "")
    setEditEventIsToday(!!ev.isToday)
  }

  const handleSaveEditEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEventId || !editEventTitle.trim()) return
    const parsedStart = parseEventDate(editEventDate)
    const parsedEnd =
      editEventIsMultiDay && editEventEndDate.trim()
        ? parseEventDate(editEventEndDate)
        : parsedStart

    const startDt =
      parsedStart && parsedEnd && parsedEnd.getTime() < parsedStart.getTime()
        ? parsedEnd
        : parsedStart
    const endDt =
      parsedStart && parsedEnd && parsedEnd.getTime() < parsedStart.getTime()
        ? parsedStart
        : parsedEnd || parsedStart

    const startISO = startDt
      ? new Date(
          startDt.getFullYear(),
          startDt.getMonth(),
          startDt.getDate(),
          0,
          0,
          0,
        ).toISOString()
      : undefined
    const endISO = endDt
      ? new Date(
          endDt.getFullYear(),
          endDt.getMonth(),
          endDt.getDate(),
          23,
          59,
          59,
        ).toISOString()
      : undefined

    const isMulti =
      Boolean(editEventIsMultiDay && editEventEndDate.trim()) &&
      Boolean(startDt && endDt && !isSameDay(startDt, endDt))

    engine.updateEvent(editingEventId, {
      title: editEventTitle.trim(),
      date: editEventDate.trim(),
      endDate: isMulti ? editEventEndDate.trim() : undefined,
      isMultiDay: isMulti,
      time: editEventTime.trim(),
      location: editEventLocation.trim(),
      category: editEventCategory,
      description: editEventDescription.trim() || undefined,
      isToday: editEventIsToday,
      startISO,
      endISO,
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
    setEditSlideHideAfterDate(slide.hideAfterDate || "")
  }

  const handleSaveEditSlide = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSlideId || !editSlideTitle.trim()) return
    const parsedHideAfter = editSlideHideAfterDate.trim()
      ? parseEventDate(editSlideHideAfterDate)
      : null
    const hideAfterISO = parsedHideAfter
      ? endOfDay(parsedHideAfter).toISOString()
      : undefined
    engine.updateSlide(editingSlideId, {
      title: editSlideTitle.trim(),
      subtitle: editSlideSubtitle.trim(),
      category: editSlideCategory.trim() || "Spotlight",
      caption: editSlideCaption.trim() || undefined,
      durationSeconds: editSlideDuration > 0 ? editSlideDuration : 8,
      hideAfterDate: editSlideHideAfterDate.trim() || undefined,
      hideAfterISO,
    })
    setEditingSlideId(null)
  }

  // Auth gate: Display loading or login page if not authenticated
  if (isAuthChecking) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="w-5 h-5 rounded-full border-2 border-[#02275A] border-t-transparent animate-spin" />
          <span>Checking your session…</span>
        </div>
      </div>
    )
  }

  if (!authenticatedUser) {
    return (
      <ManageLoginPage
        onLoginSuccess={(user) => {
          setLoginNotice(null)
          setAuthenticatedUser(user)
        }}
        onNavigateToTv={onNavigateToTv}
        notice={loginNotice}
      />
    )
  }

  const isAdmin = db.isAdmin(authenticatedUser)
  const slides = state.slides || []

  const navItems: {
    id: Section
    label: string
    icon: React.ComponentType<{ className?: string }>
    meta?: React.ReactNode
  }[] = [
    {
      id: "slides",
      label: "Slides",
      icon: Images,
      meta: <span className="text-xs text-slate-400">{slides.length}</span>,
    },
    { id: "preview", label: "Preview & layout", icon: Eye },
    {
      id: "events",
      label: "Schedule",
      icon: CalendarDays,
      meta: <span className="text-xs text-slate-400">{state.events.length}</span>,
    },
    { id: "labs", label: "Labs & hours", icon: Building2 },
    { id: "tutoring", label: "Tutoring", icon: GraduationCap },
    {
      id: "alert",
      label: "Alert banner",
      icon: Megaphone,
      meta: state.urgentAlert?.active ? (
        <span className={`${ui.badge} bg-red-100 text-red-700`}>On</span>
      ) : undefined,
    },
  ]

  const renderSectionHeader = (
    title: string,
    description: string,
    actions?: React.ReactNode,
  ) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )

  const renderNotice = (
    kind: "ok" | "error" | "warn",
    text: React.ReactNode,
    onDismiss?: () => void,
  ) => (
    <div
      className={
        kind === "ok" ? ui.noticeOk : kind === "error" ? ui.noticeError : ui.noticeWarn
      }
      role={kind === "error" ? "alert" : "status"}
    >
      <span>{text}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )

  // Shared add/edit event fields. Called as a function (not a component) so inputs keep focus.
  const renderEventFields = (
    idPrefix: string,
    v: {
      title: string
      date: string
      endDate: string
      isMultiDay: boolean
      time: string
      location: string
      category: EventAnnouncement["category"]
      description: string
      isToday: boolean
    },
    set: {
      title: (val: string) => void
      date: (val: string) => void
      endDate: (val: string) => void
      isMultiDay: (val: boolean) => void
      time: (val: string) => void
      location: (val: string) => void
      category: (val: EventAnnouncement["category"]) => void
      description: (val: string) => void
      isToday: (val: boolean) => void
    },
  ) => {
    const spanInfo = getEventDateSpan({
      date: v.date,
      endDate: v.isMultiDay ? v.endDate : undefined,
      isMultiDay: v.isMultiDay,
    })

    return (
      <>
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-title`}>
            Title
          </label>
          <input
            id={`${idPrefix}-title`}
            type="text"
            required
            placeholder="Coding interview workshop or Fall Hackathon Week"
            value={v.title}
            onChange={(e) => set.title(e.target.value)}
            className={ui.input}
          />
        </div>

        {/* Multi-day toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={v.isMultiDay}
              onChange={(e) => {
                const checked = e.target.checked
                set.isMultiDay(checked)
                if (checked && !v.endDate && v.date) {
                  const start = parseEventDate(v.date)
                  if (start) {
                    const nextDay = new Date(start)
                    nextDay.setDate(start.getDate() + 2)
                    set.endDate(formatEventDate(nextDay))
                  }
                }
              }}
              className="h-4 w-4 rounded border-slate-300 accent-[#02275A]"
            />
            <CalendarRange className="w-4 h-4 text-[#02275A]" />
            <span>Multi-day event (spans across multiple days on calendar)</span>
          </label>
          {v.isMultiDay && spanInfo.totalDays > 1 && (
            <span className="text-xs font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
              Spans {spanInfo.totalDays} days
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={ui.label} htmlFor={`${idPrefix}-date`}>
              {v.isMultiDay ? "Start Date" : "Date"}
            </label>
            <EventDatePicker
              id={`${idPrefix}-date`}
              value={v.date}
              onChange={(val) => set.date(val)}
              onDateSelect={(_date, _formatted, isToday) => {
                if (isToday) set.isToday(true)
              }}
              placeholder="e.g. MON NOVEMBER 9"
              required
              theme="light"
            />
          </div>

          {v.isMultiDay && (
            <div>
              <label className={ui.label} htmlFor={`${idPrefix}-end-date`}>
                End Date
              </label>
              <EventDatePicker
                id={`${idPrefix}-end-date`}
                value={v.endDate}
                onChange={(val) => set.endDate(val)}
                placeholder="e.g. FRI NOVEMBER 13"
                required={v.isMultiDay}
                theme="light"
              />
            </div>
          )}

          <div>
            <label className={ui.label} htmlFor={`${idPrefix}-time`}>
              Time
            </label>
            <input
              id={`${idPrefix}-time`}
              type="text"
              required
              placeholder="3:00 PM – 5:00 PM or All Day"
              value={v.time}
              onChange={(e) => set.time(e.target.value)}
              className={ui.input}
            />
          </div>
          <div>
            <label className={ui.label} htmlFor={`${idPrefix}-location`}>
              Location
            </label>
            <input
              id={`${idPrefix}-location`}
              type="text"
              required
              placeholder="Room 126"
              value={v.location}
              onChange={(e) => set.location(e.target.value)}
              className={ui.input}
            />
          </div>
          <div>
            <label className={ui.label} htmlFor={`${idPrefix}-category`}>
              Category
            </label>
            <select
              id={`${idPrefix}-category`}
              value={v.category}
              onChange={(e) =>
                set.category(e.target.value as EventAnnouncement["category"])
              }
              className={`${ui.select} w-full`}
            >
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={ui.label} htmlFor={`${idPrefix}-description`}>
            Description <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id={`${idPrefix}-description`}
            rows={2}
            value={v.description}
            onChange={(e) => set.description(e.target.value)}
            className={`${ui.input} resize-none`}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={v.isToday}
            onChange={(e) => set.isToday(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-[#02275A]"
          />
          Feature under "Happening today / Ongoing"
        </label>
      </>
    )
  }

  // ---------------------------------------------------------------- Slides
  const renderSlidesSection = () => (
    <>
      {renderSectionHeader(
        "Slides",
        "Photos and videos that rotate in the center of the TV screen.",
        <>
          <button
            type="button"
            onClick={() => engine.toggleCarouselPause(!state.isCarouselPaused)}
            className={ui.btnSecondary}
          >
            {state.isCarouselPaused ? (
              <>
                <Play className="w-4 h-4" />
                Resume slideshow
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Pause slideshow
              </>
            )}
          </button>
          {!showAddMedia && (
            <button
              type="button"
              onClick={() => setShowAddMedia(true)}
              className={ui.btnPrimary}
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          )}
        </>,
      )}

      {state.isCarouselPaused &&
        renderNotice("warn", "The slideshow is paused on all screens.")}
      {mediaUploadSuccess &&
        renderNotice("ok", mediaUploadSuccess, () => setMediaUploadSuccess(null))}

      {showAddMedia && (
        <form
          onSubmit={handleMediaUploadSubmit}
          className={`${ui.card} ${ui.cardBody} space-y-4`}
        >
          <div>
            <h2 className={ui.sectionTitle}>Upload a photo or video</h2>
            <p className={ui.hint}>JPG, PNG, WebP, GIF, MP4, WebM or MOV, up to 50 MB.</p>
          </div>

          {mediaUploadError &&
            renderNotice("error", mediaUploadError, () => setMediaUploadError(null))}

          <input
            ref={mediaFileInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleSelectMediaFile(file)
              e.target.value = ""
            }}
            className="hidden"
          />

          {mediaPreviewUrl ? (
            <div className="flex flex-col sm:flex-row gap-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex-shrink-0 overflow-hidden rounded bg-black sm:w-64">
                {mediaType === "video" ? (
                  <video src={mediaPreviewUrl} controls className="max-h-44 w-full" />
                ) : (
                  <img
                    src={mediaPreviewUrl}
                    alt="Upload preview"
                    className="max-h-44 w-full object-contain"
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-col justify-between gap-2 text-sm">
                <div>
                  <p className="truncate font-medium text-slate-900">{mediaFile?.name}</p>
                  <p className="text-slate-500">
                    {mediaType === "video" ? "Video" : "Photo"} ·{" "}
                    {((mediaFile?.size || 0) / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => mediaFileInputRef.current?.click()}
                  disabled={isUploadingMedia}
                  className={`${ui.btnSecondary} self-start`}
                >
                  Choose a different file
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => mediaFileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) handleSelectMediaFile(file)
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-[#02275A] hover:bg-white cursor-pointer"
            >
              <Upload className="w-6 h-6 text-slate-400" />
              <span className="text-sm font-medium text-slate-900">
                Choose a file or drag it here
              </span>
            </button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={ui.label} htmlFor="media-title">
                Title
              </label>
              <input
                id="media-title"
                type="text"
                required
                placeholder="ACM Hackathon, Fall 2026"
                value={mediaTitle}
                onChange={(e) => setMediaTitle(e.target.value)}
                className={ui.input}
              />
            </div>
            <div>
              <label className={ui.label} htmlFor="media-subtitle">
                Subtitle
              </label>
              <input
                id="media-subtitle"
                type="text"
                placeholder="Saturday, Oct 17 · Room 112"
                value={mediaSubtitle}
                onChange={(e) => setMediaSubtitle(e.target.value)}
                className={ui.input}
              />
            </div>
            <div>
              <label className={ui.label} htmlFor="media-category">
                Category
              </label>
              <select
                id="media-category"
                value={mediaCategory}
                onChange={(e) => setMediaCategory(e.target.value)}
                className={`${ui.select} w-full`}
              >
                {SLIDE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={ui.label} htmlFor="media-duration">
                Seconds on screen
              </label>
              <input
                id="media-duration"
                type="number"
                min={3}
                max={120}
                value={mediaDuration}
                onChange={(e) => setMediaDuration(Number(e.target.value))}
                className={`${ui.input} max-w-[8rem]`}
              />
              <p className={`${ui.hint} mt-1`}>About 8 for photos, 15 for videos.</p>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className={ui.label} htmlFor="media-hide-after">
                  Hide after date <span className="font-normal text-slate-500">(optional — auto-hides from TV after this day)</span>
                </label>
                {mediaHideAfterDate && (
                  <button
                    type="button"
                    onClick={() => setMediaHideAfterDate("")}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Clear date
                  </button>
                )}
              </div>
              <EventDatePicker
                id="media-hide-after"
                value={mediaHideAfterDate}
                onChange={(val) => setMediaHideAfterDate(val)}
                placeholder="No expiration (stay visible indefinitely)"
                theme="light"
              />
            </div>
          </div>

          <div>
            <label className={ui.label} htmlFor="media-caption">
              Caption <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="media-caption"
              rows={2}
              placeholder="Shown along the bottom of the slide"
              value={mediaCaption}
              onChange={(e) => setMediaCaption(e.target.value)}
              className={`${ui.input} resize-none`}
            />
          </div>

          {isUploadingMedia && mediaUploadProgress !== null && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200">
                <div
                  className="h-full bg-[#02275A] transition-all"
                  style={{ width: `${mediaUploadProgress}%` }}
                />
              </div>
              <p className={ui.hint}>
                {mediaUploadProgress < 100
                  ? `Uploading… ${mediaUploadProgress}%`
                  : "Adding to slideshow…"}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowAddMedia(false)
                setMediaFile(null)
                setMediaPreviewUrl(null)
                setMediaUploadError(null)
              }}
              disabled={isUploadingMedia}
              className={ui.btnSecondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!mediaFile || !mediaTitle.trim() || isUploadingMedia}
              className={ui.btnPrimary}
            >
              {isUploadingMedia ? "Uploading…" : "Add to slideshow"}
            </button>
          </div>
        </form>
      )}

      {slides.length === 0 ? (
        <div className={ui.empty}>
          No slides yet. Upload a photo or video to start the slideshow.
        </div>
      ) : (
        <>
          {/* Organization filter tabs for Active vs Hidden/Expired slides */}
          {(() => {
            const activeCount = slides.filter((s) => isSlideVisibleOnTv(s)).length
            const hiddenCount = slides.length - activeCount
            return (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setSlideFilter("all")}
                    className={`rounded px-2.5 py-1 transition cursor-pointer ${
                      slideFilter === "all"
                        ? "bg-[#02275A] text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All ({slides.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlideFilter("active")}
                    className={`rounded px-2.5 py-1 transition cursor-pointer ${
                      slideFilter === "active"
                        ? "bg-[#02275A] text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Active on TV ({activeCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlideFilter("hidden")}
                    className={`rounded px-2.5 py-1 transition cursor-pointer ${
                      slideFilter === "hidden"
                        ? "bg-[#02275A] text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Hidden / Past Date ({hiddenCount})
                  </button>
                </div>
                {hiddenCount > 0 && (
                  <span className="text-xs text-slate-500">
                    {hiddenCount} slide{hiddenCount === 1 ? " is" : "s are"} hidden from TV rotation
                  </span>
                )}
              </div>
            )
          })()}

          <ul className={`${ui.card} divide-y divide-slate-100`}>
            {slides.map((slide, idx) => {
              const isExpiredByDate = isSlideExpiredByDate(slide)
              const isVisibleOnTv = isSlideVisibleOnTv(slide)
              if (slideFilter === "active" && !isVisibleOnTv) return null
              if (slideFilter === "hidden" && isVisibleOnTv) return null

              const isCurrent = state.activeSlideIndex === idx && isVisibleOnTv
              const isVid =
                slide.mediaType === "video" ||
                Boolean(
                  slide.url &&
                    (slide.url.match(/\.(mp4|webm|mov|ogg)$/i) ||
                      slide.url.startsWith("data:video/")),
                )

              return (
                <li
                  key={slide.id}
                  className={!isVisibleOnTv ? "bg-slate-50/70" : undefined}
                >
                  <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
                    <span className="w-5 flex-shrink-0 text-right text-sm text-slate-400">
                      {idx + 1}
                    </span>
                    <div
                      className={`relative h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-slate-900 ${
                        !isVisibleOnTv ? "opacity-50 grayscale" : ""
                      }`}
                    >
                      {isVid ? (
                        <>
                          <video
                            src={slide.url}
                            className="h-full w-full object-cover"
                            muted
                            preload="metadata"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Video className="w-4 h-4 text-white" />
                          </span>
                        </>
                      ) : (
                        <img
                          src={slide.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`truncate text-sm font-medium ${
                            !isVisibleOnTv
                              ? "text-slate-500 line-through"
                              : "text-slate-900"
                          }`}
                        >
                          {slide.title}
                        </span>
                        {isCurrent && (
                          <span className={`${ui.badge} bg-emerald-100 text-emerald-800`}>
                            On screen
                          </span>
                        )}
                        {slide.hidden && (
                          <span className={`${ui.badge} bg-slate-200 text-slate-700`}>
                            Hidden manually
                          </span>
                        )}
                        {isExpiredByDate && (
                          <span className={`${ui.badge} bg-amber-100 text-amber-800`}>
                            Auto-hidden (past {slide.hideAfterDate})
                          </span>
                        )}
                        {!isExpiredByDate && slide.hideAfterDate && (
                          <span className={`${ui.badge} bg-sky-100 text-sky-800 flex items-center gap-1`}>
                            <Clock className="w-3 h-3" />
                            Hide after {slide.hideAfterDate}
                          </span>
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 truncate text-sm text-slate-500">
                        {isVid ? (
                          <Video className="w-3.5 h-3.5 flex-shrink-0" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        )}
                        {slide.durationSeconds || (isVid ? 12 : 6)}s · {slide.category}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-0.5">
                      {isExpiredByDate ? (
                        <button
                          type="button"
                          onClick={() =>
                            engine.updateSlide(slide.id, {
                              hideAfterDate: undefined,
                              hideAfterISO: undefined,
                              hidden: false,
                            })
                          }
                          title="Clear past hide-after date and restore to TV rotation"
                          className="mr-1 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer"
                        >
                          Restore to TV
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => engine.setActiveSlide(idx, true)}
                          disabled={isCurrent || !isVisibleOnTv}
                          title="Show this slide on every screen now"
                          className="hidden sm:inline-flex mr-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-[#02275A] hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
                        >
                          Show now
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          engine.updateSlide(slide.id, {
                            hidden: !slide.hidden,
                          })
                        }
                        className={ui.iconBtn}
                        title={
                          slide.hidden
                            ? "Unhide slide on TV"
                            : "Hide slide from TV"
                        }
                        aria-label={
                          slide.hidden
                            ? "Unhide slide on TV"
                            : "Hide slide from TV"
                        }
                      >
                        {slide.hidden ? (
                          <EyeOff className="w-4 h-4 text-slate-500" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewSlideId(slide.id)
                          setSection("preview")
                        }}
                        className={ui.iconBtn}
                        title="Adjust framing on the TV"
                        aria-label="Adjust framing"
                      >
                        <Crop className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveSlide(idx, "up")}
                        className={ui.iconBtn}
                        title="Move up"
                        aria-label="Move up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === slides.length - 1}
                        onClick={() => handleMoveSlide(idx, "down")}
                        className={ui.iconBtn}
                        title="Move down"
                        aria-label="Move down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          editingSlideId === slide.id
                            ? setEditingSlideId(null)
                            : handleStartEditSlide(slide)
                        }
                        className={ui.iconBtn}
                        title="Edit"
                        aria-label="Edit slide"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSlide(slide.id)}
                        className={ui.iconBtnDanger}
                        title="Delete"
                        aria-label="Delete slide"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {editingSlideId === slide.id && (
                    <form
                      onSubmit={handleSaveEditSlide}
                      className="space-y-3 border-t border-slate-100 bg-slate-50 px-4 py-4"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={ui.label} htmlFor={`slide-title-${slide.id}`}>
                            Title
                          </label>
                          <input
                            id={`slide-title-${slide.id}`}
                            type="text"
                            required
                            value={editSlideTitle}
                            onChange={(e) => setEditSlideTitle(e.target.value)}
                            className={ui.input}
                          />
                        </div>
                        <div>
                          <label className={ui.label} htmlFor={`slide-subtitle-${slide.id}`}>
                            Subtitle
                          </label>
                          <input
                            id={`slide-subtitle-${slide.id}`}
                            type="text"
                            value={editSlideSubtitle}
                            onChange={(e) => setEditSlideSubtitle(e.target.value)}
                            className={ui.input}
                          />
                        </div>
                        <div>
                          <label className={ui.label} htmlFor={`slide-category-${slide.id}`}>
                            Category
                          </label>
                          <input
                            id={`slide-category-${slide.id}`}
                            type="text"
                            list="slide-category-options"
                            value={editSlideCategory}
                            onChange={(e) => setEditSlideCategory(e.target.value)}
                            className={ui.input}
                          />
                        </div>
                        <div>
                          <label className={ui.label} htmlFor={`slide-duration-${slide.id}`}>
                            Seconds on screen
                          </label>
                          <input
                            id={`slide-duration-${slide.id}`}
                            type="number"
                            min={3}
                            max={120}
                            value={editSlideDuration}
                            onChange={(e) => setEditSlideDuration(Number(e.target.value))}
                            className={`${ui.input} max-w-[8rem]`}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <div className="flex items-center justify-between">
                            <label className={ui.label} htmlFor={`slide-hide-after-${slide.id}`}>
                              Hide after date <span className="font-normal text-slate-500">(optional — auto-hides from TV after this day)</span>
                            </label>
                            {editSlideHideAfterDate && (
                              <button
                                type="button"
                                onClick={() => setEditSlideHideAfterDate("")}
                                className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                Clear date
                              </button>
                            )}
                          </div>
                          <EventDatePicker
                            id={`slide-hide-after-${slide.id}`}
                            value={editSlideHideAfterDate}
                            onChange={(val) => setEditSlideHideAfterDate(val)}
                            placeholder="No expiration (stay visible indefinitely)"
                            theme="light"
                          />
                        </div>
                      </div>
                      <div>
                        <label className={ui.label} htmlFor={`slide-caption-${slide.id}`}>
                          Caption
                        </label>
                        <textarea
                          id={`slide-caption-${slide.id}`}
                          rows={2}
                          value={editSlideCaption}
                          onChange={(e) => setEditSlideCaption(e.target.value)}
                          className={`${ui.input} resize-none`}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingSlideId(null)}
                          className={ui.btnSecondary}
                        >
                          Cancel
                        </button>
                        <button type="submit" className={ui.btnPrimary}>
                          Save changes
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      <datalist id="slide-category-options">
        {SLIDE_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  )

  // ---------------------------------------------------------------- Schedule
  const renderEventsSection = () => {
    const sortedEvents = sortEventsChronologically(state.events)
    const calendarCells = getCalendarGrid(
      scheduleViewYear,
      scheduleViewMonth,
      scheduleSelectedDate,
    )
    const multiDayEvents = sortedEvents.filter(
      (ev) => getEventDateSpan(ev).isMultiDay,
    )
    const filteredEvents = scheduleSelectedDate
      ? sortedEvents.filter((ev) => isEventOnDay(ev, scheduleSelectedDate))
      : sortedEvents

    return (
      <>
        {renderSectionHeader(
          "Schedule",
          "Calendar and single-day or multi-day schedule items displayed on the left side of the TV screen.",
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,text/calendar"
              onChange={handleIcsFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={ui.btnSecondary}
              title="Import schedule from a calendar (.ics) file"
            >
              <Upload className="w-4 h-4" />
              Import calendar
            </button>
            {!showAddEvent && (
              <button
                type="button"
                onClick={() => {
                  if (scheduleSelectedDate && !eventDate) {
                    setEventDate(formatEventDate(scheduleSelectedDate))
                  }
                  setShowAddEvent(true)
                }}
                className={ui.btnPrimary}
              >
                <Plus className="w-4 h-4" />
                Add to schedule
              </button>
            )}
          </>,
        )}

        {importMsg &&
          renderNotice(
            importMsg.type === "ok" ? "ok" : "error",
            importMsg.text,
            () => setImportMsg(null),
          )}

        {/* Interactive Schedule Calendar Overview */}
        <div className={`${ui.card} ${ui.cardBody} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[#02275A]" />
              <h2 className="text-sm font-semibold text-slate-900">
                {MONTH_NAMES_FULL[scheduleViewMonth]} {scheduleViewYear}
              </h2>
              {scheduleSelectedDate && (
                <button
                  type="button"
                  onClick={() => setScheduleSelectedDate(null)}
                  className="text-xs font-medium bg-[#02275A]/10 text-[#02275A] hover:bg-[#02275A]/20 px-2 py-0.5 rounded transition-colors cursor-pointer"
                >
                  Showing {formatEventDate(scheduleSelectedDate, "short")} · Clear filter
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  setScheduleViewYear(now.getFullYear())
                  setScheduleViewMonth(now.getMonth())
                  setScheduleSelectedDate(null)
                }}
                className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scheduleViewMonth === 0) {
                    setScheduleViewMonth(11)
                    setScheduleViewYear((y) => y - 1)
                  } else {
                    setScheduleViewMonth((m) => m - 1)
                  }
                }}
                className={ui.iconBtn}
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scheduleViewMonth === 11) {
                    setScheduleViewMonth(0)
                    setScheduleViewYear((y) => y + 1)
                  } else {
                    setScheduleViewMonth((m) => m + 1)
                  }
                }}
                className={ui.iconBtn}
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center border-b border-slate-100 pb-1">
            {DAY_NAMES_ABBR.map((d) => (
              <div
                key={d}
                className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, idx) => {
              const dayEvents = sortedEvents.filter((ev) =>
                isEventOnDay(ev, cell.date),
              )
              const cellMulti = multiDayEvents
                .map((ev) => ({
                  event: ev,
                  pos: getEventDayPosition(ev, cell.date),
                }))
                .filter(
                  (
                    item,
                  ): item is {
                    event: EventAnnouncement
                    pos: "start" | "middle" | "end" | "single"
                  } => item.pos !== null,
                )

              const isSelected = scheduleSelectedDate
                ? isSameDay(cell.date, scheduleSelectedDate)
                : false

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setScheduleSelectedDate(null)
                    } else {
                      setScheduleSelectedDate(cell.date)
                    }
                  }}
                  className={`min-h-[54px] p-1 rounded-md border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    !cell.isCurrentMonth
                      ? "bg-slate-50/50 border-transparent opacity-45"
                      : isSelected
                        ? "bg-[#02275A]/5 border-[#02275A] ring-1 ring-[#02275A]"
                        : cell.isToday
                          ? "bg-amber-50/40 border-[#02275A]/40"
                          : "bg-white border-slate-200/70 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                        cell.isToday
                          ? "bg-[#02275A] text-white"
                          : "text-slate-700"
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-[#02275A] bg-[#02275A]/10 px-1 rounded">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Multi-day & single-day event pills */}
                  <div className="w-full space-y-0.5 mt-1">
                    {cellMulti.slice(0, 2).map(({ event, pos }) => (
                      <div
                        key={event.id}
                        className={`text-[9px] leading-tight font-semibold truncate px-1 py-0.5 bg-purple-100 text-purple-900 border-purple-300 ${
                          pos === "start"
                            ? "rounded-l border-l-2"
                            : pos === "end"
                              ? "rounded-r border-r-2"
                              : ""
                        }`}
                      >
                        {pos === "start" || cell.date.getDay() === 0
                          ? event.title
                          : "\u00A0"}
                      </div>
                    ))}
                    {dayEvents
                      .filter((ev) => !getEventDateSpan(ev).isMultiDay)
                      .slice(0, 1)
                      .map((ev) => (
                        <div
                          key={ev.id}
                          className="text-[9px] leading-tight font-medium truncate px-1 py-0.5 rounded bg-blue-50 text-[#02275A]"
                        >
                          {ev.title}
                        </div>
                      ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {showAddEvent && (
          <form
            onSubmit={handleAddEventSubmit}
            className={`${ui.card} ${ui.cardBody} space-y-3`}
          >
            <h2 className={ui.sectionTitle}>New schedule item</h2>
            {renderEventFields(
              "new-event",
              {
                title: eventTitle,
                date: eventDate,
                endDate: eventEndDate,
                isMultiDay: eventIsMultiDay,
                time: eventTime,
                location: eventLocation,
                category: eventCategory,
                description: eventDescription,
                isToday: eventIsToday,
              },
              {
                title: setEventTitle,
                date: setEventDate,
                endDate: setEventEndDate,
                isMultiDay: setEventIsMultiDay,
                time: setEventTime,
                location: setEventLocation,
                category: setEventCategory,
                description: setEventDescription,
                isToday: setEventIsToday,
              },
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowAddEvent(false)}
                className={ui.btnSecondary}
              >
                Cancel
              </button>
              <button type="submit" className={ui.btnPrimary}>
                Add to schedule
              </button>
            </div>
          </form>
        )}

        {filteredEvents.length === 0 ? (
          <div className={ui.empty}>
            {scheduleSelectedDate
              ? `No events scheduled on ${formatEventDate(scheduleSelectedDate, "short")}.`
              : "No schedule items yet. Add one above, or import a calendar (.ics) file."}
          </div>
        ) : (
          <ul className={`${ui.card} divide-y divide-slate-100`}>
            {filteredEvents.map((ev) => {
              const span = getEventDateSpan(ev)
              const displayDate = getEventDisplayDate(ev)

              return editingEventId === ev.id ? (
                <li key={ev.id}>
                  <form
                    onSubmit={handleSaveEditEvent}
                    className="space-y-3 bg-slate-50 px-4 py-4"
                  >
                    {renderEventFields(
                      `edit-${ev.id}`,
                      {
                        title: editEventTitle,
                        date: editEventDate,
                        endDate: editEventEndDate,
                        isMultiDay: editEventIsMultiDay,
                        time: editEventTime,
                        location: editEventLocation,
                        category: editEventCategory,
                        description: editEventDescription,
                        isToday: editEventIsToday,
                      },
                      {
                        title: setEditEventTitle,
                        date: setEditEventDate,
                        endDate: setEditEventEndDate,
                        isMultiDay: setEditEventIsMultiDay,
                        time: setEditEventTime,
                        location: setEditEventLocation,
                        category: setEditEventCategory,
                        description: setEditEventDescription,
                        isToday: setEditEventIsToday,
                      },
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingEventId(null)}
                        className={ui.btnSecondary}
                      >
                        Cancel
                      </button>
                      <button type="submit" className={ui.btnPrimary}>
                        Save changes
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={ev.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {ev.title}
                      </span>
                      <span className={`${ui.badge} bg-slate-100 text-slate-700`}>
                        {ev.category}
                      </span>
                      {span.isMultiDay && (
                        <span
                          className={`${ui.badge} bg-purple-100 text-purple-800 inline-flex items-center gap-1`}
                        >
                          <CalendarRange className="w-3 h-3" />
                          Multi-day ({span.totalDays} days)
                        </span>
                      )}
                      {ev.isToday && (
                        <span className={`${ui.badge} bg-amber-100 text-amber-800`}>
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {[displayDate, ev.time, ev.location]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {ev.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">
                        {ev.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        engine.updateEvent(ev.id, { isToday: !ev.isToday })
                      }
                      className="hidden sm:inline-flex mr-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-[#02275A] hover:bg-slate-100 cursor-pointer"
                      title='Show or hide this event under "Happening today"'
                    >
                      {ev.isToday ? "Unmark today" : "Mark as today"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditEvent(ev)}
                      className={ui.iconBtn}
                      title="Edit"
                      aria-label="Edit event"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${ev.title}"?`))
                          engine.removeEvent(ev.id)
                      }}
                      className={ui.iconBtnDanger}
                      title="Delete"
                      aria-label="Delete event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </>
    )
  }

  // ---------------------------------------------------------------- Labs
  const renderLabsSection = () => (
    <>
      {renderSectionHeader(
        "Labs & hours",
        "Room status, opening hours and classes shown on the right side of the TV screen.",
      )}

      {([126, 127] as const).map((id) => {
        const lab = state.labs[id]
        if (!lab) return null
        const effective = getEffectiveLabStatus(lab)
        const statuses: LabStatus[] = ["Open", "Closed", "Reserved"]

        return (
          <section key={id} className={`${ui.card} divide-y divide-slate-100`}>
            <div className={`${ui.cardBody} flex flex-wrap items-center justify-between gap-3`}>
              <h2 className={ui.sectionTitle}>{LAB_TITLES[id] || lab.name}</h2>
              <span className="text-sm text-slate-500">
                TV shows: <span className="font-medium text-slate-900">{effective}</span>
              </span>
            </div>

            <div className={`${ui.cardBody} space-y-2`}>
              <span className={ui.label}>Status</span>
              <div className="inline-flex" role="group" aria-label={`Lab ${id} status`}>
                {statuses.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => engine.updateLab(id, { status: st })}
                    aria-pressed={lab.status === st}
                    className={segment(lab.status === st)}
                  >
                    {st}
                  </button>
                ))}
              </div>
              {effective !== lab.status && (
                <p className={ui.hint}>
                  Showing "{effective}" right now because of the hours or class schedule
                  below.
                </p>
              )}
            </div>

            <div className={ui.cardBody}>
              <span className={ui.label}>Hours</span>
              <div className="divide-y divide-slate-100">
                <LabHoursIntervalPicker
                  label="Mon – Thu"
                  value={lab.hours.monThu}
                  onCommit={(v) =>
                    engine.updateLab(id, { hours: { ...lab.hours, monThu: v } })
                  }
                />
                <LabHoursIntervalPicker
                  label="Friday"
                  value={lab.hours.fri}
                  onCommit={(v) =>
                    engine.updateLab(id, { hours: { ...lab.hours, fri: v } })
                  }
                />
                <LabHoursIntervalPicker
                  label="Weekend"
                  value={lab.hours.weekend || "Closed"}
                  onCommit={(v) =>
                    engine.updateLab(id, { hours: { ...lab.hours, weekend: v } })
                  }
                />
              </div>
            </div>

            <div className={ui.cardBody}>
              <LabClassScheduleManager lab={lab} engine={engine} />
            </div>
          </section>
        )
      })}
    </>
  )

  // ---------------------------------------------------------------- Tutoring
  const renderTutoringSection = () => {
    const shifts = lab127?.tutorShifts || []
    const tutorMap: Record<string, TutorShift[]> = {}
    shifts.forEach((s) => {
      if (!tutorMap[s.tutorName]) tutorMap[s.tutorName] = []
      tutorMap[s.tutorName].push(s)
    })

    return (
      <>
        {renderSectionHeader(
          "Tutoring",
          "Peer tutors and their weekly hours in Lab 127.",
          !showAddTutor && (
            <button type="button" onClick={handleStartAddTutor} className={ui.btnPrimary}>
              <Plus className="w-4 h-4" />
              Add tutor
            </button>
          ),
        )}

        {showAddTutor && (
          <form
            onSubmit={handleSaveTutorSchedule}
            className={`${ui.card} ${ui.cardBody} space-y-4`}
          >
            <h2 className={ui.sectionTitle}>
              {editingTutorOriginalName ? `Edit ${editingTutorOriginalName}` : "New tutor"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={ui.label} htmlFor="tutor-name">
                  Name
                </label>
                <input
                  id="tutor-name"
                  type="text"
                  required
                  value={tutorName}
                  onChange={(e) => setTutorName(e.target.value)}
                  className={ui.input}
                />
              </div>
              <div>
                <label className={ui.label} htmlFor="tutor-course">
                  Course
                </label>
                <select
                  id="tutor-course"
                  value={tutorCourse}
                  onChange={(e) => setTutorCourse(e.target.value)}
                  className={`${ui.select} w-full`}
                >
                  {/* Keep a tutor's existing course selectable even if it was removed from the list */}
                  {(tutorCourses.includes(tutorCourse)
                    ? tutorCourses
                    : [tutorCourse, ...tutorCourses]
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className={`${ui.hint} mt-1`}>Used for all of this tutor's days.</p>
              </div>
            </div>

            <div>
              <span className={ui.label}>Weekly hours</span>
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {WEEKDAYS.map((day) => {
                  const entry = tutorDays[day]
                  return (
                    <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <label className="inline-flex w-32 items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(e) => {
                            const isChecked = e.target.checked
                            setTutorDays((prev) => ({
                              ...prev,
                              [day]: { ...prev[day], enabled: isChecked },
                            }))
                          }}
                          className="h-4 w-4 rounded border-slate-300 accent-[#02275A]"
                        />
                        {DAY_NAMES[day]}
                      </label>
                      {entry.enabled ? (
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
                          placeholder="2:00 PM – 4:00 PM"
                          aria-label={`${DAY_NAMES[day]} hours`}
                          className={`${ui.input} flex-1 min-w-[12rem]`}
                        />
                      ) : (
                        <span className="text-sm text-slate-400">Not tutoring</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className={`${ui.hint} mt-1`}>
                Split hours like "1:00 PM – 2:00 PM &amp; 3:00 PM – 6:00 PM".
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowAddTutor(false)
                  setEditingTutorOriginalName(null)
                }}
                className={ui.btnSecondary}
              >
                Cancel
              </button>
              <button type="submit" className={ui.btnPrimary}>
                Save tutor
              </button>
            </div>
          </form>
        )}

        {Object.keys(tutorMap).length === 0 ? (
          <div className={ui.empty}>No tutors yet.</div>
        ) : (
          <ul className={`${ui.card} divide-y divide-slate-100`}>
            {Object.entries(tutorMap).map(([tutor, tShifts]) => {
              const courses = Array.from(new Set(tShifts.map((s) => s.course)))
              return (
                <li key={tutor} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{tutor}</span>
                      {courses.map((c) => (
                        <span key={c} className={`${ui.badge} bg-slate-100 text-slate-700`}>
                          {c}
                        </span>
                      ))}
                    </div>
                    <dl className="mt-1 grid grid-cols-[3rem_1fr] gap-x-2 text-sm">
                      {WEEKDAYS.flatMap((d) =>
                        tShifts
                          .filter((s) => s.day === d)
                          .map((s) => (
                            <React.Fragment key={s.id}>
                              <dt className="text-slate-500">{s.day}</dt>
                              <dd className="text-slate-700">{s.time}</dd>
                            </React.Fragment>
                          )),
                      )}
                    </dl>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleStartEditTutor(tutor, tShifts)}
                      className={ui.iconBtn}
                      title="Edit"
                      aria-label={`Edit ${tutor}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTutor(tutor)}
                      className={ui.iconBtnDanger}
                      title="Remove"
                      aria-label={`Remove ${tutor}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {isAdmin && (
          <section className={`${ui.card} ${ui.cardBody} space-y-3`}>
            <div>
              <h2 className={ui.sectionTitle}>Courses</h2>
              <p className={ui.hint}>
                The courses tutors can be assigned to. Only admins can change this list.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {tutorCourses.map((c) => (
                <li
                  key={c}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-sm text-slate-800"
                >
                  {c}
                  {tutorCourses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCourse(c)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      title="Remove course"
                      aria-label={`Remove ${c}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddCourse} className="flex gap-2">
              <input
                type="text"
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="e.g. 301 or Discrete Math"
                aria-label="New course name"
                className={`${ui.input} max-w-xs`}
              />
              <button
                type="submit"
                disabled={!newCourseName.trim()}
                className={ui.btnSecondary}
              >
                <Plus className="w-4 h-4" />
                Add course
              </button>
            </form>
          </section>
        )}
      </>
    )
  }

  // ---------------------------------------------------------------- Alert
  const alertLevelStyles: Record<"info" | "warning" | "emergency", string> = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    emergency: "border-red-200 bg-red-50 text-red-900",
  }
  const alertLevelLabels: Record<"info" | "warning" | "emergency", string> = {
    info: "Info",
    warning: "Warning",
    emergency: "Emergency",
  }

  const renderAlertSection = () => (
    <>
      {renderSectionHeader(
        "Alert banner",
        "Show an urgent message across every TV screen until you remove it.",
      )}

      {state.urgentAlert?.active && (
        <div
          className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4 ${
            alertLevelStyles[state.urgentAlert.level]
          }`}
        >
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">
              Showing now · {alertLevelLabels[state.urgentAlert.level]}
            </p>
            <p className="mt-1 text-sm font-medium">{state.urgentAlert.message}</p>
          </div>
          <button type="button" onClick={handleDismissAlert} className={ui.btnDanger}>
            Remove banner
          </button>
        </div>
      )}

      <form onSubmit={handleBroadcastAlert} className={`${ui.card} ${ui.cardBody} space-y-4`}>
        <div>
          <label className={ui.label} htmlFor="alert-message">
            Message
          </label>
          <textarea
            id="alert-message"
            rows={3}
            value={alertText}
            onChange={(e) => setAlertText(e.target.value)}
            placeholder="Lab 126 is closed today for maintenance."
            className={`${ui.input} resize-none`}
          />
        </div>
        <div>
          <span className={ui.label}>Level</span>
          <div className="inline-flex" role="group" aria-label="Alert level">
            {(["info", "warning", "emergency"] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setAlertLevel(level)}
                aria-pressed={alertLevel === level}
                className={segment(alertLevel === level)}
              >
                {alertLevelLabels[level]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button type="submit" disabled={!alertText.trim()} className={ui.btnPrimary}>
            {state.urgentAlert?.active ? "Replace banner" : "Show on all screens"}
          </button>
        </div>
      </form>
    </>
  )

  // ---------------------------------------------------------------- Preview
  const renderPreviewSection = () => (
    <>
      {renderSectionHeader(
        "Preview & layout",
        "See the TV screen as it looks right now, and adjust how each photo is framed.",
      )}
      <TvPreviewPanel
        key={previewSlideId || "preview"}
        state={state}
        connectedClients={connectedClients}
        engine={engine}
        initialSlideId={previewSlideId}
      />
    </>
  )

  const sectionContent: Record<Section, () => React.ReactNode> = {
    slides: renderSlidesSection,
    preview: renderPreviewSection,
    events: renderEventsSection,
    labs: renderLabsSection,
    tutoring: renderTutoringSection,
    alert: renderAlertSection,
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans antialiased">
      <header className="flex h-14 flex-shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNavigateToTv}
            className={ui.btnSecondary}
            title="Open the TV display"
          >
            <Tv className="w-4 h-4" />
            <span className="hidden sm:inline">TV display</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminPortal(true)}
              className={ui.btnSecondary}
              title="Manage staff accounts and view activity"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Users &amp; activity</span>
            </button>
          )}

          <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-3">
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: authenticatedUser.avatarColor || "#02275A" }}
              aria-hidden="true"
            >
              {authenticatedUser.fullName.charAt(0) || "U"}
            </div>
            <div className="hidden md:block leading-tight">
              <div className="text-sm font-medium text-slate-900">
                {authenticatedUser.fullName}
              </div>
              <div className="text-xs text-slate-500">
                {authenticatedUser.role ?? "Pending approval"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className={ui.iconBtn}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav
          className="hidden md:flex w-56 flex-shrink-0 flex-col gap-0.5 border-r border-slate-200 bg-white p-3"
          aria-label="Sections"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium cursor-pointer ${
                  active
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 ${active ? "text-[#02275A]" : "text-slate-400"}`} />
                  {item.label}
                </span>
                {item.meta}
              </button>
            )
          })}
        </nav>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <nav
            className="md:hidden flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2"
            aria-label="Sections"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={section === item.id ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium cursor-pointer ${
                  section === item.id
                    ? "border-[#02275A] text-slate-900"
                    : "border-transparent text-slate-500"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div
            className={`mx-auto space-y-5 p-4 sm:p-6 ${
              section === "preview" ? "max-w-6xl" : "max-w-4xl"
            }`}
          >
            {sectionContent[section]()}
          </div>
        </main>
      </div>

      {/* Admin Portal Modal */}
      {authenticatedUser && (
        <AdminPortalModal
          currentUser={authenticatedUser}
          isOpen={showAdminPortal}
          onClose={() => setShowAdminPortal(false)}
          onUserChanged={async () => {
            const refreshed = await db.getUser(authenticatedUser.id)
            if (refreshed) setAuthenticatedUser(refreshed)
          }}
        />
      )}
    </div>
  )
}
