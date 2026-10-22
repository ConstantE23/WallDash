import React, { useState, useEffect, useRef } from "react"
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  AlertTriangle,
  QrCode,
  ShieldCheck,
  Sparkles,
  Info,
  Video,
  Image as ImageIcon,
  Expand,
  Shrink,
} from "lucide-react"
import type { SlideItem, UrgentAlert } from "../types/signage"
import { INITIAL_SLIDES } from "../data/initialData"
import { getSlideLayout, getMediaStyle } from "../utils/slideLayout"

/**
 * Slide video that only plays while visible. The next slide's video preloads once
 * (preload="auto"); all others stay unloaded (preload="none") until they're up next.
 * Once loaded, the element keeps its buffer, so each screen downloads a clip once
 * and the browser HTTP cache (immutable, 1-year Cache-Control) serves any reload.
 */
function SlideVideo({
  src,
  isActive,
  shouldPreload,
  className,
  style,
}: {
  src: string
  isActive: boolean
  shouldPreload: boolean
  className: string
  style?: React.CSSProperties
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasRequested, setHasRequested] = useState(isActive || shouldPreload)

  useEffect(() => {
    if (isActive || shouldPreload) setHasRequested(true)
  }, [isActive, shouldPreload])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (isActive) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [isActive, hasRequested])

  return (
    <video
      ref={videoRef}
      src={src}
      preload={hasRequested ? "auto" : "none"}
      muted
      loop
      playsInline
      className={className}
      style={style}
    />
  )
}

interface CenterDisplayProps {
  slides?: SlideItem[]
  activeSlideIndex: number
  isPaused: boolean
  urgentAlert: UrgentAlert | null
  onSlideChange: (index: number) => void
  onTogglePause: (paused: boolean) => void
  onDismissAlert?: () => void
}

export default function CenterDisplay({
  slides = INITIAL_SLIDES,
  activeSlideIndex,
  isPaused,
  urgentAlert,
  onSlideChange,
  onTogglePause,
  onDismissAlert,
}: CenterDisplayProps) {
  const [progress, setProgress] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [fitMode, setFitMode] = useState<"cover" | "contain">("cover")
  const containerRef = useRef<HTMLDivElement>(null)
  const TICK_INTERVAL = 100

  // Keep latest callback/index/duration in refs so parent re-renders
  // never restart the slide timer prematurely.
  const onSlideChangeRef = useRef(onSlideChange)
  const activeIndexRef = useRef(activeSlideIndex)
  onSlideChangeRef.current = onSlideChange
  activeIndexRef.current = activeSlideIndex

  const currentDuration =
    ((slides[activeSlideIndex]?.durationSeconds || 6) * 1000)

  useEffect(() => {
    if (isPaused || slides.length === 0) {
      setProgress(0)
      return
    }

    const start = Date.now()
    setProgress(0)
    let advanced = false

    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      if (elapsed >= currentDuration) {
        if (!advanced) {
          advanced = true
          if (slides.length > 0) {
            onSlideChangeRef.current((activeIndexRef.current + 1) % slides.length)
          }
        }
        return
      }
      setProgress((elapsed / currentDuration) * 100)
    }, TICK_INTERVAL)

    return () => clearInterval(interval)
  }, [activeSlideIndex, isPaused, slides.length, currentDuration])

  const handlePrev = () => {
    if (slides.length === 0) return
    const prevIndex = (activeSlideIndex - 1 + slides.length) % slides.length
    onSlideChange(prevIndex)
  }

  const handleNext = () => {
    if (slides.length === 0) return
    const nextIndex = (activeSlideIndex + 1) % slides.length
    onSlideChange(nextIndex)
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  const currentSlide = slides[activeSlideIndex] || slides[0]

  return (
    <main
      ref={containerRef}
      className="flex-1 flex flex-col min-w-0 h-full bg-[#02275A] relative overflow-hidden"
    >
      {/* Center Subheader bar matching the left & right columns */}
      <div className="flex items-center justify-between px-4 sm:px-6 bg-[#02275A] h-12 md:h-14 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-white/95" />
          <span className="text-white uppercase tracking-widest font-extrabold text-xs md:text-sm">
            Campus Media & Highlights
          </span>
        </div>
        <div className="flex items-center gap-2 text-white/90 text-xs font-semibold">
          <span className="px-2 py-0.5 rounded bg-black/20 text-[10px] font-mono font-bold">
            {activeSlideIndex + 1} / {slides.length}
          </span>
        </div>
      </div>

      {/* Outer Mockup TV Frame (The big rounded screen matching Screenshot_2026-09-10_at_12.00.59_PM.png) */}
      <div className="flex-1 min-h-0 p-1.5 sm:p-2.5 flex flex-col">
        <div className="relative flex-1 w-full h-full rounded-2xl md:rounded-3xl overflow-hidden bg-slate-900 border-2 sm:border-4 border-slate-700/60 shadow-2xl flex flex-col group">
        {/* Urgent Campus Alert Banner (if active) */}
        {urgentAlert && urgentAlert.active && (
          <div
            className={`flex-shrink-0 z-30 px-4 py-2.5 flex items-center justify-between text-white font-medium shadow-lg transition-all animate-pulse-glow ${
              urgentAlert.level === "emergency"
                ? "bg-red-600 border-b-2 border-red-300"
                : urgentAlert.level === "warning"
                  ? "bg-amber-600 border-b-2 border-amber-300"
                  : "bg-[#02275A] border-b-2 border-sky-300"
            }`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="p-1 rounded-full bg-white/20 flex-shrink-0">
                <AlertTriangle className="w-4 h-4 animate-bounce" />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase tracking-widest font-extrabold opacity-90">
                  {urgentAlert.level === "emergency"
                    ? "EMERGENCY BROADCAST"
                    : urgentAlert.level === "warning"
                      ? "DEPARTMENT NOTICE"
                      : "CAMPUS ANNOUNCEMENT"}
                </span>
                <span className="text-xs md:text-sm font-bold truncate">
                  {urgentAlert.message}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded text-white/90 hidden md:inline">
                From: {urgentAlert.sender}
              </span>
              {onDismissAlert && (
                <button
                  onClick={onDismissAlert}
                  className="text-xs px-2 py-1 bg-black/20 hover:bg-black/40 rounded text-white cursor-pointer transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}


        {/* Center Main Media Viewport */}
        <div className="relative flex-1 w-full h-full bg-[#0a0f1d] flex items-center justify-center overflow-hidden">
          {slides.length === 0 ? (
            /* Dynamic Hampton CS Welcome Screen when no slides are uploaded yet */
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-gradient-to-br from-[#02275A] via-[#041a3a] to-[#010e24] overflow-hidden">
              {/* Subtle decorative grid background */}
              <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
              <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#02275A]/40 blur-3xl pointer-events-none" />

              <div className="relative z-10 max-w-xl mx-auto flex flex-col items-center space-y-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-2xl backdrop-blur-md">
                  <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-sky-300" />
                </div>

                <div className="space-y-1">
                  <span className="px-3 py-1 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/30 text-[10px] sm:text-xs font-black uppercase tracking-wider">
                    Department of Computer Science
                  </span>
                  <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-white tracking-wide pt-2">
                    Hampton University
                  </h1>
                  <p className="text-xs sm:text-sm text-sky-200/80 font-medium">
                    Science & Technology Hall · Labs 126 & 127
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-xs sm:text-sm text-slate-300 max-w-md shadow-inner backdrop-blur-sm">
                  <p className="font-semibold text-white">Live Database Connected</p>
                  <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
                    No active media slides in rotation. Upload photos, flyers, or videos via the Staff Management Controller to display on this screen.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {slides.map((slide, idx) => {
                const isVideo =
                  slide.mediaType === "video" ||
                  Boolean(
                    slide.url &&
                      (slide.url.match(/\.(mp4|webm|mov|ogg)$/i) ||
                        slide.url.startsWith("data:video/")),
                  )

                const layout = getSlideLayout(slide, fitMode)
                const mediaStyle = getMediaStyle(layout)

                return (
                  <div
                    key={slide.id}
                    className={`absolute inset-0 flex items-center justify-center overflow-hidden transition-opacity duration-700 ease-in-out ${
                      layout.background === "dark" ? "bg-black" : ""
                    } ${
                      idx === activeSlideIndex
                        ? "opacity-100 z-10"
                        : "opacity-0 z-0 pointer-events-none"
                    }`}
                  >
                    {!isVideo && layout.background === "blur" ? (
                      <img
                        src={slide.url}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-105 select-none pointer-events-none"
                      />
                    ) : null}

                    {isVideo ? (
                      <SlideVideo
                        src={slide.url}
                        isActive={idx === activeSlideIndex}
                        shouldPreload={
                          slides.length > 1 &&
                          idx === (activeSlideIndex + 1) % slides.length
                        }
                        className="relative z-10 w-full h-full select-none pointer-events-none"
                        style={mediaStyle}
                      />
                    ) : (
                      <img
                        src={slide.url}
                        alt={slide.title}
                        className="relative z-10 w-full h-full select-none"
                        style={mediaStyle}
                      />
                    )}
                  </div>
                )
              })}

              {/* Navigation Arrows */}
              <button
                onClick={handlePrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 md:p-3 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer active:scale-95 shadow-lg backdrop-blur-sm"
                title="Previous Slide"
              >
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
              </button>

              <button
                onClick={handleNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 md:p-3 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer active:scale-95 shadow-lg backdrop-blur-sm"
                title="Next Slide"
              >
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
              </button>

              {/* Slide Caption & Title Overlay at Bottom */}
              {currentSlide && currentSlide.showCaption !== false && (
                <div className="absolute bottom-0 left-0 right-0 z-20 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col gap-1 text-white">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider bg-[#02275A] text-white px-2 py-0.5 rounded shadow-sm">
                      {currentSlide.category}
                    </span>
                    <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider bg-black/40 border border-white/20 text-white px-1.5 py-0.5 rounded flex items-center gap-1">
                      {currentSlide.mediaType === "video" ||
                      (currentSlide.url &&
                        currentSlide.url.match(/\.(mp4|webm|mov|ogg)$/i)) ? (
                        <>
                          <Video className="w-3 h-3 text-red-400" />
                          <span>Video</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-3 h-3 text-sky-400" />
                          <span>Photo</span>
                        </>
                      )}
                    </span>
                    <span className="text-white/60 text-[10px] md:text-xs font-mono">
                      Slide {activeSlideIndex + 1} of {slides.length}
                    </span>
                  </div>

                  <h2 className="text-sm sm:text-lg md:text-xl font-extrabold tracking-wide text-white drop-shadow-md">
                    {currentSlide.title}
                  </h2>

                  <p className="text-xs sm:text-sm text-gray-200 font-medium drop-shadow-sm line-clamp-2 max-w-2xl">
                    {currentSlide.subtitle}
                    {currentSlide.caption ? ` · ${currentSlide.caption}` : ""}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Screen Interactive Controls & Synchronized Progress Bar */}
        <div className="flex-shrink-0 z-20 bg-slate-950/90 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between gap-4">
          {/* Play / Pause Toggle Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTogglePause(!isPaused)}
              className="p-1.5 rounded-md bg-[#02275A] hover:bg-[#02275A]/80 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
              title={isPaused ? "Resume live slideshow" : "Pause slideshow"}
            >
              {isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">Play</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">Pause</span>
                </>
              )}
            </button>

            <span className="text-xs text-slate-400 font-medium hidden md:inline">
              {isPaused ? "Paused across clients" : "Auto-advancing 6s"}
            </span>
          </div>

          {/* Synchronized Progress Track */}
          <div className="flex-1 max-w-md mx-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#02275A] to-sky-500 transition-all duration-75 ease-linear rounded-full"
              style={{ width: `${isPaused ? 0 : progress}%` }}
            />
          </div>

          {/* Slide Indicator Dots & Display Controls */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => onSlideChange(idx)}
                  className={`transition-all duration-300 rounded-full cursor-pointer ${
                    idx === activeSlideIndex
                      ? "w-6 h-2 bg-[#02275A] shadow-sm shadow-[#02275A]"
                      : "w-2 h-2 bg-slate-600 hover:bg-slate-400"
                  }`}
                  title={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
              <button
                onClick={() => setFitMode(fitMode === "cover" ? "contain" : "cover")}
                title={
                  fitMode === "cover"
                    ? "Fill Mode (Taking up full space). Click to Fit."
                    : "Fit Mode. Click to Fill space."
                }
                className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[11px]"
              >
                {fitMode === "cover" ? (
                  <>
                    <Expand className="w-3.5 h-3.5 text-sky-400" />
                    <span className="hidden xl:inline font-bold">Fill</span>
                  </>
                ) : (
                  <>
                    <Shrink className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden xl:inline font-bold">Fit</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setShowQrModal(true)}
                title="Show QR code for flyer & controller"
                className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={toggleFullscreen}
                title="Toggle Fullscreen TV Signage Mode"
                className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* QR Code Quick Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
            <h3 className="text-[#02275A] font-extrabold text-base tracking-wide">
              Scan to Connect / Admin Controller
            </h3>
            <p className="text-gray-600 text-xs mt-1 mb-4">
              Open the interactive controller on your phone to toggle lab
              statuses and announcements in real-time.
            </p>

            {/* Render flyer QR code or mock scanner */}
            <div className="p-3 bg-white border-2 border-[#02275A] rounded-xl shadow-inner mb-4">
              <img
                src={slides[0].url}
                alt="Cyber QR Flyer"
                className="w-48 h-48 object-contain rounded-lg"
              />
            </div>

            <div className="flex gap-2 w-full">
              <button
                onClick={() => setShowQrModal(false)}
                className="flex-1 py-2 px-4 rounded-lg bg-[#02275A] hover:bg-[#02275A]/80 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
