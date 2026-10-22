import React, { useState, useEffect } from "react"
import TvScreen from "./components/TvScreen"
import ManagePage from "./components/ManagePage"
import { getSyncEngine } from "./services/syncEngine"
import type { SignageState, ConnectedClient } from "./types/signage"
import { Radio } from "lucide-react"

function checkIsManageRoute(): boolean {
  if (typeof window === "undefined") return false
  const path = window.location.pathname.toLowerCase()
  const hash = window.location.hash.toLowerCase()
  const search = window.location.search.toLowerCase()

  return (
    path === "/manage" ||
    path.startsWith("/manage/") ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    hash === "#/manage" ||
    hash.startsWith("#/manage") ||
    hash === "#/admin" ||
    hash.startsWith("#/admin") ||
    search.includes("manage") ||
    search.includes("admin")
  )
}

export default function App() {
  const engine = getSyncEngine()
  const [isManagePage, setIsManagePage] = useState<boolean>(() =>
    checkIsManageRoute(),
  )
  const [state, setState] = useState<SignageState>(engine.getState())
  const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>(
    engine.getConnectedClients(),
  )
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    // Listen for browser URL changes (e.g. forward/back, hash change)
    const handleUrlChange = () => {
      setIsManagePage(checkIsManageRoute())
    }

    window.addEventListener("popstate", handleUrlChange)
    window.addEventListener("hashchange", handleUrlChange)

    // Keyboard shortcut (Alt+M) for department admins to quickly toggle to /manage
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey || e.metaKey) && (e.key === "m" || e.key === "M")) {
        e.preventDefault()
        navigateTo(isManagePage ? "/" : "/manage")
      }
    }
    window.addEventListener("keydown", handleKeyDown)

    // Sync engine subscriptions
    const unsubState = engine.onStateChange((newState, action) => {
      setState(newState)
      if (action && action.byClient !== engine.getClientName()) {
        triggerToast(`${action.byClient}: ${action.description}`)
      }
    })

    const unsubClients = engine.onClientsChange((clients) => {
      setConnectedClients(clients)
    })

    const unsubPulse = engine.onPulse((sender) => {
      triggerToast(`📡 Pulse ping received from ${sender}`)
    })

    const unsubNotification = engine.onNotification((msg) => {
      triggerToast(msg)
    })

    return () => {
      window.removeEventListener("popstate", handleUrlChange)
      window.removeEventListener("hashchange", handleUrlChange)
      window.removeEventListener("keydown", handleKeyDown)
      unsubState()
      unsubClients()
      unsubPulse()
      unsubNotification()
    }
  }, [engine, isManagePage])

  const navigateTo = (path: string) => {
    try {
      window.history.pushState(null, "", path)
    } catch {
      window.location.hash = path
    }
    setIsManagePage(checkIsManageRoute())
  }

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev))
    }, 3500)
  }

  // If on /manage route, render the dedicated Staff Management Console
  if (isManagePage) {
    return (
      <ManagePage
        engine={engine}
        state={state}
        connectedClients={connectedClients}
        onNavigateToTv={() => navigateTo("/")}
      />
    )
  }

  // Otherwise, render the clean TV Display (Lobby Dashboard)
  return (
    <div className="w-screen h-screen overflow-hidden">
      <TvScreen
        state={state}
        connectedClients={connectedClients}
        onSlideChange={(index) => engine.setActiveSlide(index)}
        onTogglePause={(paused) => engine.toggleCarouselPause(paused)}
        onDismissAlert={() => engine.setUrgentAlert(null)}
      />

      {/* Discrete subtle live sync toast if a remote admin changes a room status */}
      {toastMessage && (
        <div className="fixed bottom-3 right-3 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-[#02275A]/50 text-white text-[11px] font-semibold shadow-lg backdrop-blur-sm pointer-events-none transition-all">
          <Radio className="w-3 h-3 text-sky-400 animate-pulse" />
          <span className="truncate max-w-xs">{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
