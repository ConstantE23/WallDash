import React from "react"
import Header from "./Header"
import EventAnnouncements from "./EventAnnouncements"
import CenterDisplay from "./CenterDisplay"
import RightPanel from "./RightPanel"
import type { SignageState, ConnectedClient } from "../types/signage"

interface TvScreenProps {
  state: SignageState
  connectedClients: ConnectedClient[]
  onSlideChange: (index: number) => void
  onTogglePause: (paused: boolean) => void
  onDismissAlert?: () => void
}

/**
 * The lobby TV layout: header plus events, slideshow and labs columns.
 * Fills its parent, so App renders it full-screen and /manage renders it scaled.
 */
export default function TvScreen({
  state,
  connectedClients,
  onSlideChange,
  onTogglePause,
  onDismissAlert,
}: TvScreenProps) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-[#02275A] text-slate-800 antialiased font-sans select-none">
      {/* Pristine University Header (No admin buttons visible on TV) */}
      <Header connectedClients={connectedClients} isTvMode={true} />

      {/* 3-Column TV Signage Body */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row bg-[#F3F8FC] overflow-hidden">
        {/* Left Column: Event Announcements with Autonomous Autoscroll for TV */}
        <div className="w-full md:w-[24%] lg:w-[22%] h-full flex-shrink-0">
          <EventAnnouncements events={state.events} isTvMode={true} />
        </div>

        {/* Center Column: Large Rounded TV Display Screen */}
        <div className="flex-1 min-w-0 h-full">
          <CenterDisplay
            slides={state.slides}
            activeSlideIndex={state.activeSlideIndex}
            isPaused={state.isCarouselPaused}
            urgentAlert={state.urgentAlert}
            onSlideChange={onSlideChange}
            onTogglePause={onTogglePause}
            onDismissAlert={onDismissAlert}
          />
        </div>

        {/* Right Column: Clock, Lab 126 & 127 Live Hours & Status (Clean TV Mode) */}
        <div className="w-full md:w-[24%] lg:w-[22%] h-full flex-shrink-0">
          <RightPanel labs={state.labs} events={state.events} isTvMode={true} />
        </div>
      </div>
    </div>
  )
}
