import React from "react"
import {
  Wifi,
  Users,
  Radio,
  Sliders,
  ExternalLink,
  Tv,
  CheckCircle2,
} from "lucide-react"
import type { ConnectedClient } from "../types/signage"

interface HeaderProps {
  connectedClients: ConnectedClient[]
  isTvMode?: boolean
  onOpenSyncModal?: () => void
  onOpenControllerModal?: () => void
  onSendPulse?: () => void
  pulseActive?: boolean
}

export default function Header({
  connectedClients,
  isTvMode = true,
  onOpenSyncModal,
  onOpenControllerModal,
  onSendPulse,
  pulseActive = false,
}: HeaderProps) {
  const clientCount = connectedClients.length

  return (
    <header className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 md:px-8 bg-[#02275A] h-20 sm:h-24 md:h-28 z-20 select-none">
      {/* Left spacer keeps the title centered when admin buttons exist */}
      {!isTvMode ? <div className="hidden sm:block w-28 flex-shrink-0" /> : null}

      {/* Center: Main Title from Figma Mockup */}
      <div className="flex flex-col items-center justify-center text-center px-2 flex-1 w-full">
        <h1
          className="text-white font-black tracking-wider uppercase truncate max-w-full leading-tight"
          style={{
            fontSize: "clamp(24px, 3.6vw, 54px)",
            letterSpacing: "0.14em",
            textShadow: "0 3px 14px rgba(0,0,0,0.6)",
          }}
        >
          Department of Computer Science
        </h1>
      </div>

      {/* Right: Clean status on TV, or Admin options on manage */}
      {!isTvMode ? (
        <div className="flex items-center justify-end gap-3 w-28 flex-shrink-0">
          <div className="flex items-center gap-2">
            {onOpenSyncModal && (
              <button
                onClick={onOpenSyncModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>{clientCount} Clients</span>
              </button>
            )}

            {onSendPulse && (
              <button
                onClick={onSendPulse}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pulse TV</span>
              </button>
            )}
          </div>
        </div>
      ) : null}
    </header>
  )
}
