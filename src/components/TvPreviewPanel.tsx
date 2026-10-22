import React, { useEffect, useRef, useState } from "react"
import { Video } from "lucide-react"
import type { ConnectedClient, SignageState, SlideItem } from "../types/signage"
import type { SyncEngine } from "../services/syncEngine"
import TvScreen from "./TvScreen"
import { ui, segment } from "./manageStyles"
import {
  getSlideLayout,
  layoutToSlideFields,
  ZOOM_MAX,
  ZOOM_MIN,
  type SlideLayout,
} from "../utils/slideLayout"

// The TV layout is rendered at this size and scaled down to fit the panel.
const TV_WIDTH = 1920
const TV_HEIGHT = 1080

const DEFAULT_LAYOUT: SlideLayout = {
  fit: "cover",
  focalX: 50,
  focalY: 50,
  zoom: 1,
  background: "blur",
  showCaption: true,
}

function isVideoSlide(slide: SlideItem): boolean {
  return (
    slide.mediaType === "video" ||
    Boolean(slide.url && slide.url.match(/\.(mp4|webm|mov|ogg)$/i))
  )
}

function sameLayout(a: SlideLayout | null, b: SlideLayout | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

interface TvPreviewPanelProps {
  state: SignageState
  connectedClients: ConnectedClient[]
  engine: SyncEngine
  /** Slide to select when the panel opens. */
  initialSlideId?: string | null
}

export default function TvPreviewPanel({
  state,
  connectedClients,
  engine,
  initialSlideId,
}: TvPreviewPanelProps) {
  const slides = state.slides || []
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSlideId || slides[state.activeSlideIndex]?.id || slides[0]?.id || null,
  )
  const selectedIndex = Math.max(
    0,
    slides.findIndex((s) => s.id === selectedId),
  )
  const selected: SlideItem | undefined = slides[selectedIndex]
  const savedLayout = selected ? getSlideLayout(selected) : null

  const [draft, setDraft] = useState<SlideLayout | null>(savedLayout)
  const [savedNotice, setSavedNotice] = useState(false)

  // Start from the saved layout whenever a different slide is picked.
  useEffect(() => {
    setDraft(selected ? getSlideLayout(selected) : null)
    setSavedNotice(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const isDirty = !!draft && !sameLayout(draft, savedLayout)

  const update = (changes: Partial<SlideLayout>) => {
    setSavedNotice(false)
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  const handleSave = () => {
    if (!selected || !draft) return
    engine.updateSlide(selected.id, layoutToSlideFields(draft))
    setSavedNotice(true)
  }

  const selectSlide = (id: string) => {
    if (isDirty && !confirm("Discard your unsaved layout changes?")) return
    setSelectedId(id)
  }

  // Scale the full-size TV layout to the panel width.
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / TV_WIDTH)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The preview shows the selected slide with the draft applied, paused.
  const previewState: SignageState = {
    ...state,
    slides: slides.map((s) =>
      s.id === selected?.id && draft ? { ...s, ...layoutToSlideFields(draft) } : s,
    ),
    activeSlideIndex: selectedIndex,
    isCarouselPaused: true,
  }

  // Focus point picker: click position as % of the media's rendered box.
  const handlePickFocus = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    update({
      focalX: Math.round(((e.clientX - rect.left) / rect.width) * 100),
      focalY: Math.round(((e.clientY - rect.top) / rect.height) * 100),
    })
  }

  return (
    <>
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-black"
        style={{ height: TV_HEIGHT * scale }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: TV_WIDTH,
            height: TV_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <TvScreen
            state={previewState}
            connectedClients={connectedClients}
            onSlideChange={(i) => slides[i] && selectSlide(slides[i].id)}
            onTogglePause={() => {}}
          />
        </div>
      </div>
      <p className={ui.hint}>
        Shown at TV size (1920 × 1080), scaled to fit. The slideshow is paused here so you
        can work on one slide.
      </p>

      {slides.length === 0 ? (
        <div className={ui.empty}>Upload a slide to adjust how it appears on the TV.</div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Slides">
            {slides.map((slide, idx) => {
              const isSelected = slide.id === selected?.id
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectSlide(slide.id)}
                  className={`w-32 flex-shrink-0 overflow-hidden rounded-md border bg-white text-left cursor-pointer ${
                    isSelected
                      ? "border-[#02275A] ring-2 ring-[#02275A]/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="relative h-16 bg-slate-900">
                    {isVideoSlide(slide) ? (
                      <>
                        <video
                          src={slide.url}
                          muted
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                        <Video className="absolute bottom-1 right-1 w-3.5 h-3.5 text-white" />
                      </>
                    ) : (
                      <img src={slide.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="truncate px-2 py-1 text-xs text-slate-700">
                    {idx + 1}. {slide.title}
                  </div>
                </button>
              )
            })}
          </div>

          {selected && draft && (
            <section className={`${ui.card} divide-y divide-slate-100`}>
              <div className={`${ui.cardBody} flex flex-wrap items-center justify-between gap-3`}>
                <div className="min-w-0">
                  <h2 className={`${ui.sectionTitle} truncate`}>{selected.title}</h2>
                  <p className={ui.hint}>
                    {isDirty
                      ? "Unsaved changes. The TVs still show the saved layout."
                      : savedNotice
                        ? "Saved. All screens now use this layout."
                        : "Changes preview above and go live when you save."}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => update(DEFAULT_LAYOUT)}
                    disabled={sameLayout(draft, DEFAULT_LAYOUT)}
                    className={ui.btnSecondary}
                  >
                    Reset to default
                  </button>
                  {isDirty && (
                    <button
                      type="button"
                      onClick={() => setDraft(savedLayout)}
                      className={ui.btnSecondary}
                    >
                      Discard
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty}
                    className={ui.btnPrimary}
                  >
                    Save layout
                  </button>
                </div>
              </div>

              <div className={`${ui.cardBody} grid gap-6 md:grid-cols-2`}>
                <div className="space-y-5">
                  <div>
                    <span className={ui.label}>Size</span>
                    <div className="inline-flex" role="group" aria-label="Size">
                      <button
                        type="button"
                        onClick={() => update({ fit: "cover" })}
                        aria-pressed={draft.fit === "cover"}
                        className={segment(draft.fit === "cover")}
                      >
                        Fill the screen
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ fit: "contain" })}
                        aria-pressed={draft.fit === "contain"}
                        className={segment(draft.fit === "contain")}
                      >
                        Show whole photo
                      </button>
                    </div>
                    <p className={`${ui.hint} mt-1`}>
                      {draft.fit === "cover"
                        ? "Fills the screen edge to edge; parts of the photo may be cropped."
                        : "Nothing is cropped; empty space appears around the photo."}
                    </p>
                  </div>

                  <div>
                    <label className={ui.label} htmlFor="layout-zoom">
                      Zoom <span className="font-normal text-slate-500">{Math.round(draft.zoom * 100)}%</span>
                    </label>
                    <input
                      id="layout-zoom"
                      type="range"
                      min={ZOOM_MIN * 100}
                      max={ZOOM_MAX * 100}
                      step={5}
                      value={Math.round(draft.zoom * 100)}
                      onChange={(e) => update({ zoom: Number(e.target.value) / 100 })}
                      className="w-full accent-[#02275A]"
                    />
                  </div>

                  {draft.fit === "contain" && !isVideoSlide(selected) && (
                    <div>
                      <span className={ui.label}>Space around the photo</span>
                      <div className="inline-flex" role="group" aria-label="Background">
                        <button
                          type="button"
                          onClick={() => update({ background: "blur" })}
                          aria-pressed={draft.background === "blur"}
                          className={segment(draft.background === "blur")}
                        >
                          Blurred photo
                        </button>
                        <button
                          type="button"
                          onClick={() => update({ background: "dark" })}
                          aria-pressed={draft.background === "dark"}
                          className={segment(draft.background === "dark")}
                        >
                          Black
                        </button>
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.showCaption}
                      onChange={(e) => update({ showCaption: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 accent-[#02275A]"
                    />
                    Show title and caption over the photo
                  </label>
                </div>

                <div>
                  <span className={ui.label}>Focus point</span>
                  <p className={`${ui.hint} mb-2`}>
                    Click the part that should always stay in view when the photo is cropped
                    or zoomed.
                  </p>
                  <div className="relative inline-block max-w-full cursor-crosshair overflow-hidden rounded border border-slate-200 bg-slate-100">
                    {isVideoSlide(selected) ? (
                      <video
                        src={selected.url}
                        muted
                        preload="metadata"
                        onClick={handlePickFocus}
                        className="block h-auto max-h-56 w-auto max-w-full"
                      />
                    ) : (
                      <img
                        src={selected.url}
                        alt="Click to set the focus point"
                        onClick={handlePickFocus}
                        draggable={false}
                        className="block h-auto max-h-56 w-auto max-w-full select-none"
                      />
                    )}
                    <span
                      className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(2,39,90,0.9)]"
                      style={{ left: `${draft.focalX}%`, top: `${draft.focalY}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <span className={ui.hint}>
                      {draft.focalX}% across, {draft.focalY}% down
                    </span>
                    {(draft.focalX !== 50 || draft.focalY !== 50) && (
                      <button
                        type="button"
                        onClick={() => update({ focalX: 50, focalY: 50 })}
                        className="text-xs font-medium text-[#02275A] hover:underline cursor-pointer"
                      >
                        Center
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
