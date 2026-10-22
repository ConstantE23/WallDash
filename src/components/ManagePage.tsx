import React, { useRef, useState, useEffect } from "react"
import {
  Tv,
  ExternalLink,
  Sliders,
  Users,
  CheckCircle2,
  RefreshCw,
  Send,
  AlertTriangle,
  Play,
  Pause,
  Plus,
  Trash2,
  Clock,
  MapPin,
  Split,
  Eye,
  Layers,
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
  X,
  LogOut,
  ShieldCheck,
  Lock,
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
import EventAnnouncements from "./EventAnnouncements"
import CenterDisplay from "./CenterDisplay"
import RightPanel from "./RightPanel"
import LabHoursIntervalPicker from "./LabHoursIntervalPicker"
import { getEffectiveLabStatus } from "../utils/labHours"
import LabClassScheduleManager from "./LabClassScheduleManager"
import { getUserDatabase } from "../services/userDatabase"
import { uploadSlideMedia, validateMediaFile } from "../services/mediaStorage"
import ManageLoginPage from "./ManageLoginPage"
import AdminPortalModal from "./AdminPortalModal"

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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/70">
      <span className="text-xs font-bold text-slate-300 w-24 flex-shrink-0">
        {label}:
      </span>
      <input
        type="text"
        value={currentVal}
        onChange={(e) => setCurrentVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="e.g. 8:00 AM – 10:00 PM"
        className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] font-mono"
      />
    </div>
  )
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
        if (!cancelled && user) setAuthenticatedUser(user)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsAuthChecking(false)
      })

    // Expired or revoked sessions send staff back to the login view
    const unsubSession = db.onSessionChange((user) => {
      if (user) {
        setAuthenticatedUser(user)
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
  const [alertText, setAlertText] = useState(
    state.urgentAlert?.message ||
      "ACM Hackathon kickoff tonight at 6:00 PM in Wigwam Hall!",
  )
  const [alertLevel, setAlertLevel] =
    useState<"info" | "warning" | "emergency">("info")

  // New Event form state
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [eventTitle, setEventTitle] = useState("")
  const [eventDate, setEventDate] = useState("FRI, OCT 10")
  const [eventTime, setEventTime] = useState("3:00 PM – 5:00 PM")
  const [eventLocation, setEventLocation] = useState("Wigwam, Rm 126")
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

  // Live TV Preview toggle
  const [showLivePreview, setShowLivePreview] = useState(false)

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
      })

      setMediaUploadSuccess(
        `Fed to database & published ${
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
      confirm("Are you sure you want to remove this slide from the TV display?")
    ) {
      await engine.removeSlide(slideId)
    }
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

  // Auth gate: Display loading or login page if not authenticated
  if (isAuthChecking) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#070e1e] text-white select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-400 font-mono">Verifying staff credentials...</span>
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

  return (
    <div className="w-screen h-screen flex flex-col bg-[#070e1e] text-white overflow-hidden select-none font-sans">
      <header className="flex-shrink-0 h-16 bg-[#02275A] border-b border-[#02275A]/40 px-4 sm:px-6 flex items-center justify-between shadow-lg">
        {/* Left Side: Hampton CS & Active User Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-md border border-white/20 flex-shrink-0"
              style={{ backgroundColor: authenticatedUser.avatarColor || "#02275A" }}
            >
              {authenticatedUser.fullName.charAt(0) || "U"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black text-white leading-tight">
                  {authenticatedUser.fullName}
                </span>
                {db.isAdmin(authenticatedUser) && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 shadow-xs">
                    Admin
                  </span>
                )}
              </div>
              <span className="text-[10px] text-sky-200/90 block font-mono leading-tight">
                {authenticatedUser.role ?? "Pending approval"} · @{authenticatedUser.username}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Admin Portal Button - ONLY appears if user is listed as an admin */}
          {db.isAdmin(authenticatedUser) && (
            <button
              onClick={() => setShowAdminPortal(true)}
              className="px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95 border border-amber-300"
              title="Open Admin Portal to create users and set specific permissions"
            >
              <ShieldCheck className="w-4 h-4 text-slate-950" />
              <span>Admin Portal</span>
            </button>
          )}

          <button
            onClick={() => setShowLivePreview(!showLivePreview)}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              showLivePreview
                ? "bg-[#02275A] text-white shadow-md border border-sky-400/30"
                : "bg-white/10 hover:bg-white/20 text-white border border-white/15"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {showLivePreview ? "Hide Preview" : "Show Preview"}
            </span>
          </button>

          <button
            onClick={onNavigateToTv}
            className="px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
          >
            <Tv className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">TV Screen</span>
          </button>

          <button
            onClick={handleSignOut}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-white/10 hover:bg-red-950/80 text-slate-300 hover:text-red-200 text-xs font-bold flex items-center gap-1.5 transition-all border border-white/15 hover:border-red-500/30 cursor-pointer"
            title="Sign out of Staff Portal"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Side: Controller Forms */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* Lab hours & live room status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {([126, 127] as const).map((id) => {
              const lab = state.labs[id]
              if (!lab) return null

              const title =
                id === 126
                  ? "Lab 126 · Computer Lab"
                  : "Lab 127 · Senior Design & Tutoring"
              const dot = id === 126 ? "bg-[#02275A]" : "bg-purple-500"
              const statuses: LabStatus[] = ["Open", "Closed", "Reserved"]
              const activeColor = (st: LabStatus) =>
                st === "Open"
                  ? "bg-emerald-600"
                  : st === "Closed"
                    ? "bg-red-600"
                    : "bg-amber-600"

              return (
                <div
                  key={id}
                  className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                      <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                        {title}
                      </h3>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-300">
                      Live on Board: {getEffectiveLabStatus(lab)}
                      {getEffectiveLabStatus(lab) !== lab.status && ` (Manual: ${lab.status})`}
                    </span>
                  </div>

                  {/* Room status */}
                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-2">
                      Room Status (updates TV instantly)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {statuses.map((st) => (
                        <button
                          key={st}
                          onClick={() => engine.updateLab(id, { status: st })}
                          className={`py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            lab.status === st
                              ? `${activeColor(st)} text-white shadow-lg`
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hours */}
                  <div className="pt-4 border-t border-slate-800/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-400 uppercase font-bold block">
                        Lab Hours (15-min intervals)
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Syncs live to TV board
                      </span>
                    </div>
                    <LabHoursIntervalPicker
                      label="Mon – Thu"
                      value={lab.hours.monThu}
                      onCommit={(v) =>
                        engine.updateLab(id, {
                          hours: { ...lab.hours, monThu: v },
                        })
                      }
                    />
                    <LabHoursIntervalPicker
                      label="Fri"
                      value={lab.hours.fri}
                      onCommit={(v) =>
                        engine.updateLab(id, {
                          hours: { ...lab.hours, fri: v },
                        })
                      }
                    />
                    <LabHoursIntervalPicker
                      label="Weekend"
                      value={lab.hours.weekend || "Closed"}
                      onCommit={(v) =>
                        engine.updateLab(id, {
                          hours: { ...lab.hours, weekend: v },
                        })
                      }
                    />

                    {id === 127 && (
                      <div className="pt-3 border-t border-slate-800/80 space-y-3">
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
                            className="p-3.5 bg-slate-900/95 rounded-xl border border-sky-500/40 space-y-3 animate-in fade-in duration-200"
                          >
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                              <div className="flex items-center gap-1.5">
                                <User className="w-4 h-4 text-sky-400" />
                                <span className="text-xs font-bold text-sky-300">
                                  {editingTutorOriginalName
                                    ? `Edit Schedule: ${editingTutorOriginalName}`
                                    : "Add Tutor & Weekly Hours"}
                                </span>
                              </div>
                              <span className="text-[9px] text-slate-400">
                                Pick times by day
                              </span>
                            </div>

                            {/* Tutor Info: Name & Default Course */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
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
                                    // Update days that still match old default
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
                                          updated[d] = {
                                            ...updated[d],
                                            course: c,
                                          }
                                        }
                                      })
                                      return updated
                                    })
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
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

                            {/* Times by Days (M–F) */}
                            <div className="space-y-2 pt-1">
                              <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                                Pick Times by Day (Mon – Fri)
                              </label>

                              {([
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                              ] as WeekDay[]).map((day) => {
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
                                    className={`p-2 rounded-lg border transition-all ${
                                      entry.enabled
                                        ? "bg-slate-800/90 border-sky-500/50"
                                        : "bg-slate-900/50 border-slate-800 opacity-70"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <label className="flex items-center gap-2 cursor-pointer select-none">
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
                                                  prev[day].course ||
                                                  tutorCourse,
                                              },
                                            }))
                                          }}
                                          className="rounded border-slate-700 text-[#02275A] focus:ring-0 cursor-pointer"
                                        />
                                        <span
                                          className={`text-xs font-bold ${
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
                                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-sky-300 font-bold focus:outline-none"
                                        >
                                          <option value="151 & 152">
                                            151 & 152
                                          </option>
                                          <option value="251">
                                            251
                                          </option>
                                        </select>
                                      ) : (
                                        <span className="text-[10px] text-slate-500 italic">
                                          Off
                                        </span>
                                      )}
                                    </div>

                                    {entry.enabled && (
                                      <div className="space-y-1.5 mt-1 pl-6">
                                        <input
                                          type="text"
                                          value={entry.time}
                                          onChange={(e) => {
                                            const val = e.target.value
                                            setTutorDays((prev) => ({
                                              ...prev,
                                              [day]: {
                                                ...prev[day],
                                                time: val,
                                              },
                                            }))
                                          }}
                                          placeholder="e.g. 11:50 AM – 1:00 PM or 1-2 then 3-6"
                                          className="w-full px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] font-mono"
                                        />

                                        {/* Quick time preset chips */}
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
                                              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 hover:bg-slate-700 text-slate-300 font-mono transition cursor-pointer"
                                            >
                                              {preset.length > 20
                                                ? preset.slice(0, 18) + "..."
                                                : preset}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                              <button
                                type="submit"
                                className="flex-1 py-1.5 rounded-lg bg-[#02275A] hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
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
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}

                        {/* Active Tutors List: Grouped by Tutor with all their days */}
                        <div className="space-y-2">
                          {(() => {
                            const shifts = lab.tutorShifts || []
                            if (shifts.length === 0) {
                              return (
                                <p className="text-[11px] text-slate-500 italic p-3 bg-slate-800/40 rounded-lg text-center">
                                  No tutors added yet. Click &quot;Add
                                  Tutor&quot; above to set up peer tutors and
                                  their days.
                                </p>
                              )
                            }

                            // Group shifts by tutor
                            const tutorMap: Record<string, TutorShift[]> = {}
                            shifts.forEach((s) => {
                              if (!tutorMap[s.tutorName]) {
                                tutorMap[s.tutorName] = []
                              }
                              tutorMap[s.tutorName].push(s)
                            })

                            return Object.entries(tutorMap).map(
                              ([tutor, tShifts]) => {
                                const courses = Array.from(
                                  new Set(tShifts.map((s) => s.course)),
                                )
                                return (
                                  <div
                                    key={tutor}
                                    className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70 space-y-2"
                                  >
                                    {/* Tutor Header with Edit & Delete */}
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-6 h-6 rounded-full bg-[#02275A]/30 text-sky-300 flex items-center justify-center font-bold text-xs border border-sky-400/40 flex-shrink-0">
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
                                                className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30"
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
                                          className="p-1.5 rounded-lg text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 transition cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                                        >
                                          <Pencil className="w-3 h-3" />
                                          <span className="hidden sm:inline">
                                            Edit
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDeleteTutor(tutor)
                                          }
                                          title="Delete Tutor"
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Days & Times for this tutor */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-slate-700/50">
                                      {tShifts.map((s) => (
                                        <div
                                          key={s.id}
                                          className="flex items-center justify-between px-2 py-1 rounded bg-slate-900/60 border border-slate-800 text-[10px]"
                                        >
                                          <span className="font-bold text-sky-300 bg-sky-500/20 px-1 rounded border border-sky-500/30 font-mono">
                                            {s.day}
                                          </span>
                                          <span className="text-white/90 font-mono text-[9.5px] truncate ml-1.5">
                                            {s.time}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              },
                            )
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Class Schedule for this lab */}
                    <LabClassScheduleManager lab={lab} engine={engine} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* 3. Urgent Alert Broadcast Form */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm sm:text-base text-white uppercase tracking-wider">
                  Urgent Campus Broadcast Banner (Overlays on TV)
                </h3>
              </div>
              {state.urgentAlert?.active && (
                <span className="text-xs bg-red-600 font-black px-2.5 py-0.5 rounded uppercase tracking-wider">
                  Currently Active on TV
                </span>
              )}
            </div>

            <form onSubmit={handleBroadcastAlert} className="space-y-3">
              <textarea
                rows={2}
                value={alertText}
                onChange={(e) => setAlertText(e.target.value)}
                placeholder="Type urgent announcement or notice to display on the TV..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-[#02275A] resize-none"
              />

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-bold uppercase">
                    Level:
                  </span>
                  {(["info", "warning", "emergency"] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setAlertLevel(level)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
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
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                    >
                      Dismiss from TV
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#02275A] hover:bg-[#02275A]/80 text-white text-xs font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Broadcast to TV Now</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* 4. Center Screen Slideshow Media Manager (Photos & Videos) */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-sky-400" />
                <h3 className="font-extrabold text-sm sm:text-base text-white uppercase tracking-wider">
                  TV Slideshow Media Manager ({(state.slides || []).length}{" "}
                  Items)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddMedia(!showAddMedia)}
                  className="py-1.5 px-3 rounded-xl bg-[#02275A] hover:bg-[#02275A]/80 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {showAddMedia ? "Close Uploader" : "Upload Photo or Video"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    engine.toggleCarouselPause(!state.isCarouselPaused)
                  }
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    state.isCarouselPaused
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-amber-600 hover:bg-amber-500 text-white"
                  }`}
                >
                  {state.isCarouselPaused ? (
                    <>
                      <Play className="w-3 h-3 fill-current" />
                      <span>Resume TV</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3 h-3 fill-current" />
                      <span>Pause TV</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Success banner */}
            {mediaUploadSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-600 text-emerald-200 text-xs flex items-center justify-between">
                <span>✓ {mediaUploadSuccess}</span>
                <button
                  type="button"
                  onClick={() => setMediaUploadSuccess(null)}
                  className="text-white/60 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Upload Photo / Video Form */}
            {showAddMedia && (
              <form
                onSubmit={handleMediaUploadSubmit}
                className="p-4 sm:p-5 rounded-xl bg-slate-800/90 border border-slate-700 space-y-4 shadow-inner"
              >
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Upload New Media Slide (Photos & Videos)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Supports JPG, PNG, WEBP, GIF, MP4, WebM, MOV · max 50 MB
                  </span>
                </div>

                {mediaUploadError && (
                  <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span>{mediaUploadError}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setMediaUploadError(null)}
                      className="text-white/60 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Dropzone / File Picker */}
                <div>
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
                    <div className="relative rounded-xl overflow-hidden bg-black/60 border border-slate-700 p-3 flex flex-col items-center gap-3">
                      {mediaType === "video" ? (
                        <video
                          src={mediaPreviewUrl}
                          controls
                          className="max-h-56 max-w-full rounded-lg bg-black"
                        />
                      ) : (
                        <img
                          src={mediaPreviewUrl}
                          alt="Upload preview"
                          className="max-h-56 max-w-full rounded-lg object-contain bg-black"
                        />
                      )}

                      <div className="flex items-center justify-between w-full text-xs text-slate-300 px-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded font-black text-[10px] uppercase ${
                              mediaType === "video"
                                ? "bg-red-600 text-white"
                                : "bg-sky-600 text-white"
                            }`}
                          >
                            {mediaType}
                          </span>
                          <span className="truncate max-w-xs">
                            {mediaFile?.name}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            (
                            {((mediaFile?.size || 0) / (1024 * 1024)).toFixed(
                              2,
                            )}{" "}
                            MB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => mediaFileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          Change File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => mediaFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        const file = e.dataTransfer.files?.[0]
                        if (file) handleSelectMediaFile(file)
                      }}
                      className="border-2 border-dashed border-slate-600 hover:border-[#02275A] bg-slate-900/60 hover:bg-slate-900/90 rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3"
                    >
                      <div className="p-3 rounded-full bg-[#02275A]/20 text-sky-400">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">
                          Click to select photo or video, or drag and drop here
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Photos (PNG, JPG, WEBP) or Videos (MP4, WebM, MOV)
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                      Slide Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ACM Hackathon Fall 2026"
                      value={mediaTitle}
                      onChange={(e) => setMediaTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                      Subtitle / Location / Date
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Saturday, Oct 17 · ST112"
                      value={mediaSubtitle}
                      onChange={(e) => setMediaSubtitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                      Category
                    </label>
                    <select
                      value={mediaCategory}
                      onChange={(e) => setMediaCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                    >
                      <option value="Campus Announcement">
                        Campus Announcement
                      </option>
                      <option value="Club Announcement">
                        Club Announcement
                      </option>
                      <option value="Department Spotlight">
                        Department Spotlight
                      </option>
                      <option value="Industry Partner">Industry Partner</option>
                      <option value="Campus Facilities">
                        Campus Facilities
                      </option>
                      <option value="Student Showcase">Student Showcase</option>
                      <option value="Career & Research">
                        Career & Research
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                      Display Duration on TV Screen
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={3}
                        max={120}
                        value={mediaDuration}
                        onChange={(e) =>
                          setMediaDuration(Number(e.target.value))
                        }
                        className="w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none font-mono"
                      />
                      <span className="text-xs text-slate-400">
                        seconds (recommended: 6-8s for photos, 12-20s for
                        videos)
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                    Description / Caption (Shown on TV banner)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief caption or instructions for students..."
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMedia(false)
                      setMediaFile(null)
                      setMediaPreviewUrl(null)
                      setMediaUploadError(null)
                    }}
                    disabled={isUploadingMedia}
                    className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !mediaFile || !mediaTitle.trim() || isUploadingMedia
                    }
                    className="px-5 py-2 rounded-xl bg-[#02275A] hover:bg-[#02275A]/80 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {isUploadingMedia
                        ? mediaUploadProgress !== null && mediaUploadProgress < 100
                          ? `Uploading... ${mediaUploadProgress}%`
                          : "Publishing..."
                        : "Publish to Live TV Slideshow"}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* Slides in Rotation List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold uppercase tracking-wider text-[11px]">
                  Current Slides in TV Rotation Sequence (
                  {(state.slides || []).length}):
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm("Reset slideshow to default Hampton CS flyers?")
                    ) {
                      engine.resetSlidesToDefault()
                    }
                  }}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Defaults</span>
                </button>
              </div>

              <div className="space-y-2">
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
                    <div key={slide.id} className="space-y-1.5">
                      <div
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isCurrent
                            ? "bg-blue-950/40 border-[#02275A] shadow-lg ring-1 ring-[#02275A]"
                            : "bg-slate-800/60 border-slate-750 hover:bg-slate-800"
                        }`}
                      >
                        {/* Left: Thumbnail & Details */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-black flex-shrink-0 border border-slate-700 flex items-center justify-center">
                            {isVid ? (
                              <div className="relative w-full h-full">
                                <video
                                  src={slide.url}
                                  className="w-full h-full object-cover"
                                  muted
                                  preload="metadata"
                                />
                                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                                  <Video className="w-4 h-4 text-white" />
                                </span>
                              </div>
                            ) : (
                              <img
                                src={slide.url}
                                alt={slide.title}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">
                                #{idx + 1}
                              </span>
                              <span
                                className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                  isVid
                                    ? "bg-red-900/60 text-red-200 border border-red-700/60"
                                    : "bg-sky-900/60 text-sky-200 border border-sky-700/60"
                                }`}
                              >
                                {isVid ? (
                                  <Video className="w-2.5 h-2.5" />
                                ) : (
                                  <ImageIcon className="w-2.5 h-2.5" />
                                )}
                                <span>{isVid ? "Video" : "Photo"}</span>
                              </span>
                              <span className="text-[10px] font-bold text-sky-400 bg-[#02275A]/20 px-1.5 py-0.5 rounded">
                                {slide.category}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {slide.durationSeconds || (isVid ? 12 : 6)}s
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500 text-white animate-pulse">
                                  Live on TV Now
                                </span>
                              )}
                            </div>
                            <h4 className="text-xs font-bold text-white truncate mt-1">
                              {slide.title}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate">
                              {slide.subtitle}
                            </p>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditSlide(slide)}
                            title="Edit title, subtitle, description, category, or duration"
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              editingSlideId === slide.id
                                ? "bg-sky-600 text-white"
                                : "bg-slate-700 hover:bg-sky-600 text-slate-300 hover:text-white"
                            }`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => engine.setActiveSlide(idx, true)}
                            title="Show this slide on the TV right now"
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              isCurrent
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-700 hover:bg-[#02275A] text-slate-200 hover:text-white"
                            }`}
                          >
                            {isCurrent ? "Showing" : "Show on TV"}
                          </button>

                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveSlide(idx, "up")}
                            title="Move slide earlier in rotation"
                            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={idx === (state.slides || []).length - 1}
                            onClick={() => handleMoveSlide(idx, "down")}
                            title="Move slide later in rotation"
                            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSlide(slide.id)}
                            title="Delete slide from TV"
                            className="p-1.5 rounded-lg bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inline Slide Edit Form */}
                      {editingSlideId === slide.id && (
                        <form
                          onSubmit={handleSaveEditSlide}
                          className="p-3.5 bg-slate-900/95 rounded-xl border border-sky-500/50 space-y-2.5 animate-in fade-in duration-200 mt-1"
                        >
                          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                            <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                              <Pencil className="w-3.5 h-3.5" />
                              <span>
                                Edit Slide #{idx + 1} Info & Description
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingSlideId(null)}
                              className="text-slate-400 hover:text-white cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                                Headline Title
                              </label>
                              <input
                                type="text"
                                required
                                value={editSlideTitle}
                                onChange={(e) =>
                                  setEditSlideTitle(e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                                Subtitle / Department
                              </label>
                              <input
                                type="text"
                                value={editSlideSubtitle}
                                onChange={(e) =>
                                  setEditSlideSubtitle(e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                                Category Badge
                              </label>
                              <input
                                type="text"
                                value={editSlideCategory}
                                onChange={(e) =>
                                  setEditSlideCategory(e.target.value)
                                }
                                placeholder="e.g. Club Announcement, Industry Partner"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                                Display Duration (Seconds)
                              </label>
                              <input
                                type="number"
                                min={3}
                                max={120}
                                value={editSlideDuration}
                                onChange={(e) =>
                                  setEditSlideDuration(Number(e.target.value))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                              Slide Description / Caption (Shown on TV)
                            </label>
                            <textarea
                              rows={2}
                              value={editSlideCaption}
                              onChange={(e) =>
                                setEditSlideCaption(e.target.value)
                              }
                              placeholder="Detailed caption or description shown across bottom of TV screen..."
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] resize-none"
                            />
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="submit"
                              className="py-1.5 px-4 rounded-lg bg-[#02275A] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow cursor-pointer transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Save Changes to TV</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSlideId(null)}
                              className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
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

          {/* 5. Event Announcements Management */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm sm:text-base text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" />
                Manage Event Announcements ({state.events.length})
              </h3>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ics,text/calendar"
                  onChange={handleIcsFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import .ics</span>
                </button>
                <button
                  onClick={() => setShowAddEvent(!showAddEvent)}
                  className="py-1.5 px-3 rounded-xl bg-[#02275A] hover:bg-[#02275A]/80 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {showAddEvent ? "Cancel" : "Add New Announcement"}
                  </span>
                </button>
              </div>
            </div>

            {importMsg && (
              <div
                className={`flex items-start justify-between gap-3 p-3 rounded-xl text-xs border ${
                  importMsg.type === "ok"
                    ? "bg-emerald-950/50 border-emerald-700 text-emerald-200"
                    : "bg-red-950/50 border-red-800 text-red-200"
                }`}
              >
                <span>{importMsg.text}</span>
                <button
                  onClick={() => setImportMsg(null)}
                  className="text-white/60 hover:text-white cursor-pointer flex-shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {showAddEvent && (
              <form
                onSubmit={handleAddEventSubmit}
                className="space-y-3 bg-slate-800/90 p-4 rounded-xl border border-slate-700"
              >
                <div>
                  <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                    Event Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ACM Coding Interview Workshop"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                      Date
                    </label>
                    <input
                      type="text"
                      required
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                      Time
                    </label>
                    <input
                      type="text"
                      required
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      required
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                      Category
                    </label>
                    <select
                      value={eventCategory}
                      onChange={(e) => setEventCategory(e.target.value as any)}
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
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
                  <label className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                    Event Description / Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Event details or agenda shown on TV announcement cards..."
                    value={eventDescription}
                    onChange={(e) => setEventDescription(e.target.value)}
                    className="w-full px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="eventTodayManage"
                    checked={eventIsToday}
                    onChange={(e) => setEventIsToday(e.target.checked)}
                    className="rounded text-[#02275A]"
                  />
                  <label
                    htmlFor="eventTodayManage"
                    className="text-xs text-white font-medium cursor-pointer"
                  >
                    Feature in &quot;Happening Today&quot; spotlight
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Publish Announcement (Instantly shows on TV autoscroll ticker)
                </button>
              </form>
            )}

            {/* Existing Announcements List with Edit, Delete & Set Today */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              {state.events.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-3 text-center bg-slate-800/40 rounded-xl">
                  No event announcements active. Click &quot;Add New
                  Announcement&quot; or import an .ics file above.
                </p>
              ) : (
                state.events.map((ev) => {
                  const isEditing = editingEventId === ev.id

                  if (isEditing) {
                    return (
                      <form
                        key={ev.id}
                        onSubmit={handleSaveEditEvent}
                        className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/60 shadow-lg space-y-2.5 animate-in fade-in duration-200"
                      >
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit Event Announcement</span>
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
                          <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                            Event Title
                          </label>
                          <input
                            type="text"
                            required
                            value={editEventTitle}
                            onChange={(e) => setEditEventTitle(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A]"
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
                              value={editEventDate}
                              onChange={(e) => setEditEventDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                              Time
                            </label>
                            <input
                              type="text"
                              required
                              value={editEventTime}
                              onChange={(e) => setEditEventTime(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none"
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
                              value={editEventLocation}
                              onChange={(e) =>
                                setEditEventLocation(e.target.value)
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                              Category
                            </label>
                            <select
                              value={editEventCategory}
                              onChange={(e) =>
                                setEditEventCategory(e.target.value as any)
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none"
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
                            Description / Summary
                          </label>
                          <textarea
                            rows={2}
                            value={editEventDescription}
                            onChange={(e) =>
                              setEditEventDescription(e.target.value)
                            }
                            placeholder="Brief description or agenda..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#02275A] resize-none"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id={`eventTodayEdit-${ev.id}`}
                            checked={editEventIsToday}
                            onChange={(e) =>
                              setEditEventIsToday(e.target.checked)
                            }
                            className="rounded text-[#02275A]"
                          />
                          <label
                            htmlFor={`eventTodayEdit-${ev.id}`}
                            className="text-xs text-white font-medium cursor-pointer"
                          >
                            Feature in &quot;Happening Today&quot; spotlight
                          </label>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="submit"
                            className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow cursor-pointer transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Save Event Changes</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingEventId(null)}
                            className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
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
                      className="p-3 rounded-xl bg-slate-800/90 border border-slate-700/60 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white truncate">
                            {ev.title}
                          </span>
                          <span className="text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-700 text-sky-300">
                            {ev.category}
                          </span>
                          {ev.isToday && (
                            <span className="text-[9px] font-bold bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded uppercase">
                              Today
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {ev.date} · {ev.time} · {ev.location}
                        </div>
                        {ev.description && (
                          <div className="text-[10px] text-slate-400/80 italic mt-0.5 truncate">
                            {ev.description}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleStartEditEvent(ev)}
                          title="Edit event details or description"
                          className="p-1.5 rounded-lg bg-slate-700 hover:bg-sky-600 text-slate-300 hover:text-white cursor-pointer transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            engine.updateEvent(ev.id, { isToday: !ev.isToday })
                          }
                          className="px-2 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-semibold cursor-pointer"
                        >
                          {ev.isToday ? "Unset Today" : "Set Today"}
                        </button>
                        <button
                          onClick={() => engine.removeEvent(ev.id)}
                          title="Delete announcement"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Optional Side-by-Side Live TV Preview */}
        {showLivePreview && (
          <div className="w-[50%] h-full border-l-2 border-[#02275A]/40 flex flex-col bg-[#02275A] overflow-hidden">
            <div className="flex-shrink-0 h-10 bg-slate-900 border-b border-white/10 px-4 flex items-center justify-between text-xs">
              <span className="font-bold text-sky-400 flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5" />
                Live TV Preview (Simulated Screen)
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                Receiving Live Sync
              </span>
            </div>

            <div className="flex-1 min-h-0 flex bg-[#F3F8FC]">
              {/* Left Column */}
              <div className="w-[30%] h-full">
                <EventAnnouncements events={state.events} isTvMode={true} />
              </div>
              {/* Center Screen */}
              <div className="flex-1 min-w-0 h-full">
                <CenterDisplay
                  activeSlideIndex={state.activeSlideIndex}
                  isPaused={state.isCarouselPaused}
                  urgentAlert={state.urgentAlert}
                  onSlideChange={(idx) => engine.setActiveSlide(idx)}
                  onTogglePause={(p) => engine.toggleCarouselPause(p)}
                />
              </div>
              {/* Right Column */}
              <div className="w-[28%] h-full">
                <RightPanel labs={state.labs} isTvMode={true} />
              </div>
            </div>
          </div>
        )}
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
