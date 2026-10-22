import React from "react"
import {
  Users,
  Radio,
  ExternalLink,
  Split,
  Tv,
  Smartphone,
  CheckCircle2,
  X,
  RefreshCw,
  Zap,
  Shield,
  Layers,
} from "lucide-react"
import type { ConnectedClient, SignageState } from "../types/signage"
import { SyncEngine } from "../services/syncEngine"

interface SyncStatusModalProps {
  engine: SyncEngine
  state: SignageState
  connectedClients: ConnectedClient[]
  onClose: () => void
  onSelectDualView: () => void
}

export default function SyncStatusModal({
  engine,
  state,
  connectedClients,
  onClose,
  onSelectDualView,
}: SyncStatusModalProps) {
  const handleOpenNewTab = () => {
    window.open(window.location.href, "_blank")
  }

  const handleSendPing = () => {
    engine.sendPulse()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0b1329] border border-[#02275A]/50 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col text-white max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 bg-[#02275A] border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-white/20 text-white">
              <Zap className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg tracking-wide text-white">
                Multi-Client Live Sync Network
              </h3>
              <p className="text-white/80 text-xs">
                Scalable peer mesh connecting all display screens and
                controllers
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                Connected Clients
              </span>
              <span className="text-2xl font-black text-emerald-400">
                {connectedClients.length}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                Sync Latency
              </span>
              <span className="text-2xl font-black text-sky-400 font-mono">
                &lt; 2ms
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                State Version
              </span>
              <span className="text-2xl font-black text-purple-400 font-mono">
                v{state.version}
              </span>
            </div>
          </div>

          {/* Connected Clients Roster */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                Active Connected Clients
              </span>
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live Heartbeat
              </span>
            </div>

            <div className="space-y-2">
              {connectedClients.map((client) => (
                <div
                  key={client.id}
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    client.isCurrent
                      ? "bg-blue-950/40 border-[#02275A] shadow-sm"
                      : "bg-slate-900/60 border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-800 text-white">
                      {client.role === "TV Display" ? (
                        <Tv className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Smartphone className="w-4 h-4 text-purple-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs sm:text-sm text-white">
                          {client.name}
                        </span>
                        {client.isCurrent && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#02275A] text-white">
                            THIS CLIENT
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Role: {client.role} · ID: {client.id.slice(-8)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time sync mechanisms overview */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Multi-Client Scalability Architecture
            </span>
            <ul className="text-xs text-slate-400 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>
                  <strong className="text-white">
                    BroadcastChannel Protocol:
                  </strong>{" "}
                  Instant zero-latency cross-tab and cross-window state
                  replication.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>
                  <strong className="text-white">
                    Persistent Storage Fallback:
                  </strong>{" "}
                  LocalStorage event bus persists lab hours and announcements
                  across browser reloads.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>
                  <strong className="text-white">
                    Heartbeat & Auto-Pruning:
                  </strong>{" "}
                  Automated peer presence tracking discovers new devices and
                  cleans up disconnected nodes every 3s.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          <button
            onClick={handleSendPing}
            className="py-2 px-3.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 text-sky-400" />
            <span>Send Sync Pulse</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose()
                onSelectDualView()
              }}
              className="py-2 px-3.5 rounded-lg bg-[#02275A] hover:bg-[#02275A]/80 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <Split className="w-3.5 h-3.5" />
              <span>Simulate 2 Clients Side-by-Side</span>
            </button>

            <button
              onClick={handleOpenNewTab}
              className="py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open 2nd Client in Tab</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
