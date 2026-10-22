import React, { useState, useEffect, useRef } from "react"
import {
  Tv,
  Smartphone,
  ArrowRightLeft,
  Users,
  Radio,
  Sparkles,
  ExternalLink,
  Info,
  CheckCircle2,
} from "lucide-react"
import { SyncEngine } from "../services/syncEngine"
import type { SignageState, ConnectedClient } from "../types/signage"
import EventAnnouncements from "./EventAnnouncements"
import CenterDisplay from "./CenterDisplay"
import RightPanel from "./RightPanel"
import AdminControllerPanel from "./AdminControllerPanel"

export default function DualClientView() {
  // Client 1: Lobby Wall TV
  const [engineClient1] = useState(
    () =>
      new SyncEngine(
        "client_display_kiosk_1",
        "Lobby Wall TV #1",
        "TV Display",
      ),
  )
  const [state1, setState1] = useState<SignageState>(engineClient1.getState())
  const [clients1, setClients1] = useState<ConnectedClient[]>(
    engineClient1.getConnectedClients(),
  )

  // Client 2: Staff Mobile Controller
  const [engineClient2] = useState(
    () =>
      new SyncEngine(
        "client_staff_mobile_2",
        "Staff Mobile Controller #2",
        "Staff Controller",
      ),
  )
  const [state2, setState2] = useState<SignageState>(engineClient2.getState())
  const [clients2, setClients2] = useState<ConnectedClient[]>(
    engineClient2.getConnectedClients(),
  )

  // Visual pulse indicator for live sync data packets
  const [syncPulseAnimation, setSyncPulseAnimation] = useState(false)
  const [lastActionText, setLastActionText] = useState(
    "Both clients connected to live mesh bus.",
  )

  useEffect(() => {
    // Subscribe Client 1
    const unsubState1 = engineClient1.onStateChange((newState, action) => {
      setState1(newState)
      if (action) {
        setLastActionText(`${action.byClient}: ${action.description}`)
        triggerSyncAnimation()
      }
    })
    const unsubClients1 = engineClient1.onClientsChange((c) => setClients1(c))

    // Subscribe Client 2
    const unsubState2 = engineClient2.onStateChange((newState, action) => {
      setState2(newState)
      if (action) {
        setLastActionText(`${action.byClient}: ${action.description}`)
        triggerSyncAnimation()
      }
    })
    const unsubClients2 = engineClient2.onClientsChange((c) => setClients2(c))

    const unsubPulse1 = engineClient1.onPulse(() => triggerSyncAnimation())
    const unsubPulse2 = engineClient2.onPulse(() => triggerSyncAnimation())

    return () => {
      unsubState1()
      unsubClients1()
      unsubState2()
      unsubClients2()
      unsubPulse1()
      unsubPulse2()
      engineClient1.destroy()
      engineClient2.destroy()
    }
  }, [engineClient1, engineClient2])

  const triggerSyncAnimation = () => {
    setSyncPulseAnimation(true)
    setTimeout(() => setSyncPulseAnimation(false), 900)
  }

  const openNewTab = () => {
    window.open(window.location.href, "_blank")
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#010e24] overflow-hidden select-none">
      {/* Top Banner explaining the 2-Client Scalability Architecture */}
      <div className="flex-shrink-0 bg-[#02275A] px-4 py-2 border-b border-white/20 flex flex-wrap items-center justify-between gap-2 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center p-1.5 rounded-md bg-white/20 text-white">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-black text-xs md:text-sm tracking-wide">
                MULTI-CLIENT LIVE SYNCHRONIZATION SIMULATOR
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-white shadow-xs">
                2 CLIENTS ACTIVE
              </span>
            </div>
            <p className="text-white/80 text-[10px] md:text-xs">
              Interact with Client 2 on the right (toggle lab status, broadcast
              alert, or jump slide) to see Client 1 update in real time with
              zero delay.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Sync Bus Status */}
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              syncPulseAnimation
                ? "bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-400/50 scale-105"
                : "bg-black/30 text-emerald-300 border border-emerald-500/40"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-mono text-[11px] truncate max-w-[200px]">
              {lastActionText}
            </span>
          </div>

          <button
            onClick={openNewTab}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 cursor-pointer transition-all"
            title="Open an additional real client in another browser tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open 3rd Client in New Tab</span>
          </button>
        </div>
      </div>

      {/* Split Screen Container: Left (Client 1) and Right (Client 2) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* ================= LEFT CLIENT: TV DISPLAY KIOSK ================= */}
        <div className="flex-1 flex flex-col min-w-0 border-b-2 lg:border-b-0 lg:border-r-2 border-[#02275A]/40 overflow-hidden relative">
          {/* Client 1 Header Badge */}
          <div className="flex-shrink-0 h-9 bg-slate-900 border-b border-white/10 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-sky-400" />
              <span className="text-white font-extrabold text-xs tracking-wider uppercase">
                Client #1 · Lobby Wall TV (Display Mode)
              </span>
              <span className="text-[10px] bg-[#02275A] text-white px-1.5 py-0.2 rounded font-mono">
                ID: {engineClient1.getClientId().slice(-6)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Receiving Real-time Sync</span>
            </div>
          </div>

          {/* Client 1 Display Content */}
          <div className="flex-1 min-h-0 flex flex-col bg-[#F3F8FC] overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 bg-[#02275A] h-14 px-4 flex items-center justify-center">
              <span className="text-white font-black text-sm sm:text-base md:text-lg tracking-wider uppercase truncate">
                Department of Computer Science
              </span>
            </div>

            {/* Mockup 3-Column Body */}
            <div className="flex flex-1 min-h-0">
              {/* Left Column: Announcements */}
              <div className="w-[30%] min-w-[160px] h-full flex-shrink-0">
                <EventAnnouncements
                  events={state1.events}
                  onOpenAddModal={() => engineClient1.sendPulse()}
                />
              </div>

              {/* Center Column: Big Rounded Screen */}
              <div className="flex-1 min-w-0 h-full">
                <CenterDisplay
                  activeSlideIndex={state1.activeSlideIndex}
                  isPaused={state1.isCarouselPaused}
                  urgentAlert={state1.urgentAlert}
                  onSlideChange={(idx) => engineClient1.setActiveSlide(idx)}
                  onTogglePause={(p) => engineClient1.toggleCarouselPause(p)}
                  onDismissAlert={() => engineClient1.setUrgentAlert(null)}
                />
              </div>

              {/* Right Column: Day, Time, Labs */}
              <div className="w-[28%] min-w-[170px] h-full flex-shrink-0">
                <RightPanel
                  labs={state1.labs}
                  events={state1.events}
                  onToggleLabStatus={(id) => {
                    const lab = state1.labs[id]
                    if (lab) {
                      const next = lab.status === "Open" ? "Closed" : "Open"
                      engineClient1.updateLab(id, { status: next })
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT CLIENT: STAFF ADMIN CONTROLLER ================= */}
        <div className="w-full lg:w-[480px] xl:w-[540px] flex-shrink-0 flex flex-col bg-[#0b1329] overflow-hidden">
          {/* Client 2 Header Badge */}
          <div className="flex-shrink-0 h-9 bg-slate-900 border-b border-white/10 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-purple-400" />
              <span className="text-white font-extrabold text-xs tracking-wider uppercase">
                Client #2 · Staff Mobile / Tablet Controller
              </span>
              <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.2 rounded font-mono">
                ID: {engineClient2.getClientId().slice(-6)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-purple-300 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>Broadcasting Mutations</span>
            </div>
          </div>

          {/* Client 2 Controller Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <AdminControllerPanel
              engine={engineClient2}
              state={state2}
              connectedClients={clients2}
              isInline={true}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
