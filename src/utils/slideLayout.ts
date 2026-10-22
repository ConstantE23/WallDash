import type React from "react"
import type { SlideItem } from "../types/signage"

/** How a slide's photo/video is framed inside the TV's center screen. */
export interface SlideLayout {
  /** "cover" fills the screen (cropping), "contain" shows the whole photo. */
  fit: "cover" | "contain"
  /** Focus point in % of the media (0–100); kept visible when cropping or zooming. */
  focalX: number
  focalY: number
  /** 1 = 100%. */
  zoom: number
  /** What fills the empty space around a fitted photo. */
  background: "blur" | "dark"
  /** Show the title/caption overlay along the bottom. */
  showCaption: boolean
}

export const ZOOM_MIN = 1
export const ZOOM_MAX = 3

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function getSlideLayout(
  slide: SlideItem,
  fallbackFit: "cover" | "contain" = "cover",
): SlideLayout {
  return {
    fit: slide.mediaFit || fallbackFit,
    focalX: clamp(slide.focalX ?? 50, 0, 100),
    focalY: clamp(slide.focalY ?? 50, 0, 100),
    zoom: clamp(slide.zoom ?? 1, ZOOM_MIN, ZOOM_MAX),
    background: slide.background || "blur",
    showCaption: slide.showCaption !== false,
  }
}

/** Slide fields to save for a layout. */
export function layoutToSlideFields(layout: SlideLayout): Partial<SlideItem> {
  return {
    mediaFit: layout.fit,
    focalX: Math.round(layout.focalX),
    focalY: Math.round(layout.focalY),
    zoom: Math.round(layout.zoom * 100) / 100,
    background: layout.background,
    showCaption: layout.showCaption,
  }
}

export function getMediaStyle(layout: SlideLayout): React.CSSProperties {
  const origin = `${layout.focalX}% ${layout.focalY}%`
  return {
    objectFit: layout.fit,
    objectPosition: origin,
    transform: layout.zoom !== 1 ? `scale(${layout.zoom})` : undefined,
    transformOrigin: origin,
  }
}
