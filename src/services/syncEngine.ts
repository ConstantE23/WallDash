import type {
  SignageState,
  ConnectedClient,
  SyncMessage,
  LabInfo,
  EventAnnouncement,
  UrgentAlert,
  SlideItem,
  TutorShift,
  WeekDay,
  LabClassSession,
} from "../types/signage"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { INITIAL_STATE, INITIAL_SLIDES, getTutorCourses } from "../data/initialData"
import {
  saveMedia,
  getMediaUrl,
  uploadSlideMedia,
  deleteSlideMedia,
} from "./mediaStorage"
import { getUserDatabase } from "./userDatabase"
import { getDatabaseConnection } from "./dbConnection"
import { supabase } from "./supabaseClient"
import type { ActionLogCategory } from "../types/signage"
import { isValidLabHours } from "../utils/labHours"

// localStorage key: shared state in fallback mode, offline cache of the last good
// Supabase state otherwise (so a screen keeps showing content if the network drops).
const STORAGE_STATE_KEY = "hampton_cs_sync_state_v1"
const CHANNEL_NAME = "hampton_cs_realtime_channel"
const REALTIME_STATE_CHANNEL = "walldash-signage-state"
const REALTIME_PRESENCE_CHANNEL = "walldash-presence"
const REMOTE_SAVE_DEBOUNCE_MS = 400

// Remote actions after which screens should follow the sender's active slide.
// For anything else each screen keeps rotating its own carousel position.
const SLIDE_FOLLOW_ACTIONS = new Set([
  "SET_SLIDE",
  "ADD_SLIDE",
  "RESET_SLIDES",
  "RESET_STATE",
])

type StateListener = (
  state: SignageState,
  actionMeta?: SignageState["lastAction"],
) => void
type ClientsListener = (clients: ConnectedClient[]) => void
type PulseListener = (senderName: string) => void
type NotificationListener = (
  message: string,
  type?: "info" | "success" | "alert",
) => void

export class SyncEngine {
  private clientId: string
  private clientName: string
  private clientRole: ConnectedClient["role"]
  private channel: BroadcastChannel | null = null
  private currentState: SignageState
  private connectedClients: Map<string, ConnectedClient> = new Map()

  private stateListeners: Set<StateListener> = new Set()
  private clientsListeners: Set<ClientsListener> = new Set()
  private pulseListeners: Set<PulseListener> = new Set()
  private notificationListeners: Set<NotificationListener> = new Set()

  private heartbeatTimer: number | null = null
  private pruneTimer: number | null = null
  private isDestroyed = false

  // Supabase realtime + debounced writes
  private stateChannel: RealtimeChannel | null = null
  private presenceChannel: RealtimeChannel | null = null
  private presenceClients: Map<string, ConnectedClient> = new Map()
  private pendingRemoteState: SignageState | null = null
  private remoteSaveTimer: number | null = null

  constructor(
    customClientId?: string,
    customClientName?: string,
    customRole: ConnectedClient["role"] = "TV Display",
  ) {
    this.clientId =
      customClientId || `client_${Math.random().toString(36).substring(2, 9)}`
    this.clientRole = customRole
    this.clientName =
      customClientName ||
      (this.clientRole === "TV Display"
        ? `Lobby Screen #${this.clientId.slice(-4).toUpperCase()}`
        : `Staff Station #${this.clientId.slice(-4).toUpperCase()}`)

    // Load initial state from storage, falling back to clean baseline
    const loaded = this.loadStoredState()
    this.currentState = loaded || INITIAL_STATE
    if (!this.currentState.slides) {
      this.currentState.slides = []
    }

    this.initChannel()
    this.initStorageListener()
    this.startHeartbeat()

    // Register self in clients map
    this.updateSelfInClients()
    this.broadcastHeartbeat()
    this.requestStateFromPeers()
    this.rehydrateMedia()
    this.syncRemoteDatabase()
    this.initRealtime()
  }

  /**
   * Load the shared state from Supabase. On failure the localStorage cache stays in use.
   */
  private async syncRemoteDatabase() {
    if (!supabase) return
    try {
      const remoteState = await getDatabaseConnection().fetchSignageState()
      if (remoteState && remoteState.labs) {
        this.applyServerState(remoteState, true)
      }
    } catch (err) {
      console.warn("Could not sync remote state on init:", err)
    }
  }

  /**
   * Subscribe to signage_state changes so every screen updates within seconds, and use
   * Realtime Presence for the connected-clients list.
   */
  private initRealtime() {
    if (!supabase) return

    this.stateChannel = supabase
      .channel(REALTIME_STATE_CHANNEL)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signage_state", filter: "id=eq.1" },
        (payload) => {
          const next = (payload.new as { state?: SignageState } | null)?.state
          if (next && next.labs) {
            this.applyServerState(next)
          } else {
            // Payload too large or missing: fall back to a fresh read.
            this.syncRemoteDatabase()
          }
        },
      )
      .subscribe((status) => {
        // Re-read after (re)connecting so changes missed while offline are picked up.
        if (status === "SUBSCRIBED") this.syncRemoteDatabase()
      })

    this.presenceChannel = supabase.channel(REALTIME_PRESENCE_CHANNEL, {
      config: { presence: { key: this.clientId } },
    })
    this.presenceChannel
      .on("presence", { event: "sync" }, () => {
        const presence = this.presenceChannel?.presenceState<{
          id: string
          name: string
          role: ConnectedClient["role"]
        }>()
        this.presenceClients.clear()
        for (const metas of Object.values(presence || {})) {
          const meta = metas[0]
          if (meta && meta.id !== this.clientId) {
            this.presenceClients.set(meta.id, {
              id: meta.id,
              name: meta.name,
              role: meta.role,
              lastSeen: Date.now(),
            })
          }
        }
        this.notifyClientsListeners()
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") this.trackPresence()
      })

    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.syncRemoteDatabase())
    }
  }

  private trackPresence() {
    this.presenceChannel
      ?.track({ id: this.clientId, name: this.clientName, role: this.clientRole })
      .catch(() => {})
  }

  /**
   * Apply state that came from Supabase (initial load, realtime, or reconnect).
   * Each screen keeps its own carousel position unless the change was a slide jump.
   */
  private applyServerState(remote: SignageState, isInitialLoad = false) {
    const isOwnEcho =
      remote.lastAction?.clientId === this.clientId &&
      remote.version <= this.currentState.version
    if (isOwnEcho && !isInitialLoad) return
    // Don't clobber local edits that haven't been written yet.
    if (this.pendingRemoteState) return

    const slides = remote.slides || []
    const followSlide =
      isInitialLoad || SLIDE_FOLLOW_ACTIONS.has(remote.lastAction?.type || "")
    const activeSlideIndex = followSlide
      ? remote.activeSlideIndex
      : this.currentState.activeSlideIndex
    const next: SignageState = {
      ...remote,
      slides,
      activeSlideIndex: Math.min(
        Math.max(0, activeSlideIndex || 0),
        Math.max(0, slides.length - 1),
      ),
    }

    const announce =
      !isInitialLoad && remote.lastAction?.clientId !== this.clientId
    this.currentState = next
    this.saveStoredState(next)
    this.notifyStateListeners(next, announce ? next.lastAction : undefined)
  }

  public getClientId(): string {
    return this.clientId
  }

  public getClientName(): string {
    return this.clientName
  }

  public getClientRole(): ConnectedClient["role"] {
    return this.clientRole
  }

  public setClientRole(newRole: ConnectedClient["role"], newName?: string) {
    this.clientRole = newRole
    if (newName) this.clientName = newName
    this.updateSelfInClients()
    this.broadcastHeartbeat()
    this.trackPresence()
  }

  public getState(): SignageState {
    return this.currentState
  }

  public getConnectedClients(): ConnectedClient[] {
    // Same-browser tabs (BroadcastChannel) plus other devices (Supabase Presence).
    const merged = new Map(this.presenceClients)
    for (const [id, client] of this.connectedClients) merged.set(id, client)
    const list = Array.from(merged.values())
    return list.map((c) => ({
      ...c,
      isCurrent: c.id === this.clientId,
    }))
  }

  private loadStoredState(): SignageState | null {
    try {
      const saved = localStorage.getItem(STORAGE_STATE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (!parsed.slides) {
          parsed.slides = []
        }
        if (parsed.labs) {
          for (const key of Object.keys(parsed.labs)) {
            const l = parsed.labs[key]
            if (l && (l.status === "Tutoring" || !l.status)) {
              l.status = "Open"
            }
          }
        }
        return parsed
      }
    } catch {
      // Fallback
    }
    return null
  }

  // Fallback mode only: regenerate object URLs for media stored in this browser's IndexedDB.
  private async rehydrateMedia() {
    if (!this.currentState.slides || this.currentState.slides.length === 0)
      return
    let changed = false
    const restoredSlides = await Promise.all(
      this.currentState.slides.map(async (slide) => {
        if (slide.hasStoredBlob && !slide.storagePath) {
          const freshUrl = await getMediaUrl(slide.id)
          if (freshUrl && freshUrl !== slide.url) {
            changed = true
            return { ...slide, url: freshUrl }
          }
        }
        return slide
      }),
    )

    if (changed) {
      this.currentState = {
        ...this.currentState,
        slides: restoredSlides,
      }
      this.notifyStateListeners(this.currentState)
    }
  }

  private saveStoredState(state: SignageState) {
    try {
      // Avoid localStorage quota crash by omitting giant base64/blob strings for media that lives in IndexedDB
      const safeSlides = (state.slides || []).map((s) => ({
        ...s,
        url: s.hasStoredBlob
          ? "" // Restored from IndexedDB on refresh
          : s.url && s.url.startsWith("blob:")
            ? ""
            : s.url && s.url.length > 50000
              ? ""
              : s.url,
      }))
      const safeState = { ...state, slides: safeSlides }
      localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(safeState))
    } catch {
      // Ignore quota errors
    }
  }

  private initChannel() {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME)
        this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
          this.handleIncomingMessage(event.data)
        }
      } catch (err) {
        console.warn(
          "BroadcastChannel not supported or restricted, falling back to storage sync",
          err,
        )
      }
    }
  }

  private initStorageListener() {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_STATE_KEY && event.newValue) {
          try {
            const newState: SignageState = JSON.parse(event.newValue)
            if (
              newState.version > this.currentState.version ||
              newState.lastAction?.timestamp >
                this.currentState.lastAction?.timestamp
            ) {
              this.applyRemoteState(newState)
            }
          } catch {
            // parse error
          }
        }
      })

      window.addEventListener("beforeunload", () => {
        this.destroy()
      })
    }
  }

  private handleIncomingMessage(msg: SyncMessage) {
    if (this.isDestroyed) return

    switch (msg.type) {
      case "STATE_UPDATE": {
        if (msg.senderId !== this.clientId) {
          if (msg.state.version >= this.currentState.version) {
            this.applyRemoteState(msg.state)
            this.notifyNotification(
              `Sync: ${msg.state.lastAction?.description || "State updated"} by ${msg.state.lastAction?.byClient || "Client"}`,
              "info",
            )
          }
        }
        break
      }

      case "REQUEST_STATE": {
        if (msg.senderId !== this.clientId) {
          // Reply with current state so the newcomer is fully up to date
          this.postMessage({
            type: "STATE_UPDATE",
            state: this.currentState,
            senderId: this.clientId,
          })
        }
        break
      }

      case "CLIENT_HEARTBEAT": {
        if (msg.client.id !== this.clientId) {
          this.connectedClients.set(msg.client.id, {
            ...msg.client,
            lastSeen: Date.now(),
          })
          this.notifyClientsListeners()
        }
        break
      }

      case "CLIENT_DISCONNECT": {
        if (msg.clientId !== this.clientId) {
          this.connectedClients.delete(msg.clientId)
          this.notifyClientsListeners()
        }
        break
      }

      case "PING_PULSE": {
        if (msg.senderId !== this.clientId) {
          this.pulseListeners.forEach((fn) => fn(msg.senderName))
          this.notifyNotification(
            `📡 Pulse ping received from ${msg.senderName}!`,
            "success",
          )
        }
        break
      }

      case "MEDIA_SLIDE_BROADCAST": {
        if (msg.senderId !== this.clientId) {
          const slide = { ...msg.slide }
          const applyBroadcast = async () => {
            if (msg.blob) {
              const url = await saveMedia(
                slide.id,
                msg.blob,
                slide.fileName || "media",
              )
              slide.url = url
              slide.hasStoredBlob = true
            }
            const existingIdx = this.currentState.slides.findIndex(
              (s) => s.id === slide.id,
            )
            const newSlides =
              existingIdx >= 0
                ? this.currentState.slides.map((s, idx) =>
                    idx === existingIdx ? slide : s,
                  )
                : [...this.currentState.slides, slide]

            const newState: SignageState = {
              ...this.currentState,
              version: this.currentState.version + 1,
              slides: newSlides,
              lastAction: {
                type: "ADD_SLIDE",
                byClient: "Remote Peer",
                clientRole: "Staff Station",
                timestamp: Date.now(),
                description: `Received new ${slide.mediaType || "media"}: "${slide.title}"`,
              },
            }
            this.applyRemoteState(newState)
          }
          applyBroadcast()
        }
        break
      }
    }
  }

  private postMessage(msg: SyncMessage) {
    if (this.channel) {
      try {
        this.channel.postMessage(msg)
      } catch {
        // channel error
      }
    }
  }

  private applyRemoteState(newState: SignageState) {
    this.currentState = newState
    this.saveStoredState(newState)
    this.notifyStateListeners(newState, newState.lastAction)
  }

  private updateSelfInClients() {
    this.connectedClients.set(this.clientId, {
      id: this.clientId,
      name: this.clientName,
      role: this.clientRole,
      lastSeen: Date.now(),
      isCurrent: true,
    })
    this.notifyClientsListeners()
  }

  private broadcastHeartbeat() {
    this.updateSelfInClients()
    this.postMessage({
      type: "CLIENT_HEARTBEAT",
      client: {
        id: this.clientId,
        name: this.clientName,
        role: this.clientRole,
        lastSeen: Date.now(),
      },
    })
  }

  private startHeartbeat() {
    this.heartbeatTimer = window.setInterval(() => {
      this.broadcastHeartbeat()
    }, 2500)

    this.pruneTimer = window.setInterval(() => {
      const now = Date.now()
      let changed = false
      for (const [id, client] of this.connectedClients.entries()) {
        if (id !== this.clientId && now - client.lastSeen > 7000) {
          this.connectedClients.delete(id)
          changed = true
        }
      }
      if (changed) {
        this.notifyClientsListeners()
      }
    }, 3000)
  }

  private requestStateFromPeers() {
    this.postMessage({
      type: "REQUEST_STATE",
      senderId: this.clientId,
    })
  }

  // State Mutation Methods
  public updateLab(labId: number, changes: Partial<LabInfo>) {
    const existingLab = this.currentState.labs[labId]
    if (!existingLab) return

    // Refuse malformed hours; Supabase enforces the same rule (0002_validate_lab_hours.sql).
    if (changes.hours) {
      const previous = existingLab.hours as Record<string, string | undefined>
      const bad = Object.entries(changes.hours).find(
        ([key, h]) =>
          h !== previous[key] && (typeof h !== "string" || !isValidLabHours(h)),
      )
      if (bad) {
        console.warn(`Rejected invalid lab hours for ${labId}.${bad[0]}:`, bad[1])
        this.notifyNotification(`Invalid hours "${bad[1]}" were not saved.`, "alert")
        return
      }
    }

    const updatedLab: LabInfo = {
      ...existingLab,
      ...changes,
      lastUpdated: Date.now(),
      updatedBy: this.clientName,
    }

    const actionDesc = changes.status
      ? `${updatedLab.name} status set to "${changes.status}"`
      : `${updatedLab.name} details updated`

    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      labs: {
        ...this.currentState.labs,
        [labId]: updatedLab,
      },
      lastAction: {
        type: "UPDATE_LAB",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: actionDesc,
      },
    }

    this.commitState(newState)
  }

  public addTutorShift(labId: number, shift: Omit<TutorShift, "id">) {
    const currentLab = this.currentState.labs[labId]
    if (!currentLab) return
    const newShift: TutorShift = {
      ...shift,
      id: `shift-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    }
    const shifts = [...(currentLab.tutorShifts || []), newShift]
    this.updateLab(labId, { tutorShifts: shifts })
  }

  public removeTutorShift(labId: number, shiftId: string) {
    const currentLab = this.currentState.labs[labId]
    if (!currentLab) return
    const shifts = (currentLab.tutorShifts || []).filter(
      (s) => s.id !== shiftId,
    )
    this.updateLab(labId, { tutorShifts: shifts })
  }

  public addClassSession(labId: number, session: Omit<LabClassSession, "id">) {
    const currentLab = this.currentState.labs[labId]
    if (!currentLab) return
    const newSession: LabClassSession = {
      ...session,
      id: `class-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    }
    const classes = [...(currentLab.classes || []), newSession]
    this.updateLab(labId, { classes })
  }

  public removeClassSession(labId: number, classId: string) {
    const currentLab = this.currentState.labs[labId]
    if (!currentLab) return
    const classes = (currentLab.classes || []).filter((c) => c.id !== classId)
    this.updateLab(labId, { classes })
  }

  public updateClassSession(labId: number, updatedSession: LabClassSession) {
    const currentLab = this.currentState.labs[labId]
    if (!currentLab) return
    const classes = (currentLab.classes || []).map((c) =>
      c.id === updatedSession.id ? updatedSession : c,
    )
    this.updateLab(labId, { classes })
  }

  public saveTutorSchedule(
    labId: number,
    tutorName: string,
    shifts: { day: WeekDay; course: string; time: string }[],
    previousTutorName?: string,
  ) {
    const currentLab = this.currentState.labs[labId]
    if (!currentLab) return
    const nameToMatch = (previousTutorName || tutorName).trim().toLowerCase()
    const remainingShifts = (currentLab.tutorShifts || []).filter(
      (s) => s.tutorName.trim().toLowerCase() !== nameToMatch,
    )
    const addedShifts: TutorShift[] = shifts
      .filter((s) => s.time.trim().length > 0)
      .map((s, i) => ({
        id: `shift-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
        tutorName: tutorName.trim(),
        course: s.course.trim(),
        day: s.day,
        time: s.time.trim(),
      }))
    this.updateLab(labId, { tutorShifts: [...remainingShifts, ...addedShifts] })
  }

  public removeTutor(labId: number, tutorName: string) {
    const currentLab = this.currentState.labs[labId]
    if (!currentLab) return
    const nameToMatch = tutorName.trim().toLowerCase()
    const remaining = (currentLab.tutorShifts || []).filter(
      (s) => s.tutorName.trim().toLowerCase() !== nameToMatch,
    )
    this.updateLab(labId, { tutorShifts: remaining })
  }

  public addEvents(incoming: Omit<EventAnnouncement, "id">[]) {
    if (incoming.length === 0) return

    const uids = new Set(incoming.map((e) => e.uid).filter(Boolean) as string[])
    const kept = this.currentState.events.filter(
      (e) => !(e.uid && uids.has(e.uid)),
    )
    const added: EventAnnouncement[] = incoming.map((e, i) => ({
      ...e,
      id: `ev-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
    }))

    const merged = [...added, ...kept].sort((a, b) => {
      const ta = a.startISO ? new Date(a.startISO).getTime() : Infinity
      const tb = b.startISO ? new Date(b.startISO).getTime() : Infinity
      return ta - tb
    })

    this.commitState({
      ...this.currentState,
      version: this.currentState.version + 1,
      events: merged,
      lastAction: {
        type: "IMPORT_EVENTS",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Imported ${added.length} event${
          added.length === 1 ? "" : "s"
        } from calendar file`,
      },
    })
  }

  public addEvent(event: Omit<EventAnnouncement, "id">) {
    const newEvent: EventAnnouncement = {
      ...event,
      id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    }

    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      events: [newEvent, ...this.currentState.events],
      lastAction: {
        type: "ADD_EVENT",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Added event "${newEvent.title}"`,
      },
    }

    this.commitState(newState)
  }

  public removeEvent(eventId: string) {
    const target = this.currentState.events.find((e) => e.id === eventId)
    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      events: this.currentState.events.filter((e) => e.id !== eventId),
      lastAction: {
        type: "REMOVE_EVENT",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Removed event "${target?.title || eventId}"`,
      },
    }

    this.commitState(newState)
  }

  public updateEvent(eventId: string, changes: Partial<EventAnnouncement>) {
    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      events: this.currentState.events.map((e) =>
        e.id === eventId ? { ...e, ...changes } : e,
      ),
      lastAction: {
        type: "UPDATE_EVENT",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Updated event details`,
      },
    }

    this.commitState(newState)
  }

  public setUrgentAlert(
    alert: Omit<UrgentAlert, "id" | "timestamp" | "sender"> | null,
  ) {
    const urgentAlert: UrgentAlert | null = alert
      ? {
          ...alert,
          id: `alert-${Date.now()}`,
          timestamp: Date.now(),
          sender: this.clientName,
        }
      : null

    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      urgentAlert,
      lastAction: {
        type: "SET_ALERT",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: alert?.active
          ? `Broadcasted alert: "${alert.message.slice(0, 30)}..."`
          : "Dismissed urgent alert",
      },
    }

    this.commitState(newState)
  }

  /**
   * Change the visible slide. Carousel auto-advance stays local to each screen; pass
   * `persist = true` when staff deliberately jump every screen to a slide.
   */
  public setActiveSlide(index: number, persist = false) {
    if (this.currentState.activeSlideIndex === index) return

    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      activeSlideIndex: index,
      lastAction: {
        type: "SET_SLIDE",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Advanced to slide #${index + 1}`,
      },
    }

    this.commitState(newState, { remote: persist, log: persist })
  }

  public toggleCarouselPause(isPaused: boolean) {
    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      isCarouselPaused: isPaused,
      lastAction: {
        type: "PAUSE_CAROUSEL",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: isPaused ? "Paused carousel" : "Resumed carousel",
      },
    }

    this.commitState(newState)
  }

  /**
   * Add a slide. Pass already-uploaded media via `slideData.url`/`storagePath` (and the
   * `id` used for the upload path), or pass `mediaBlob` to have it uploaded here.
   */
  public async addSlide(
    slideData: Omit<SlideItem, "id"> & { id?: string },
    mediaBlob?: Blob,
  ): Promise<string> {
    const id =
      slideData.id || `slide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    let url = slideData.url
    let storagePath = slideData.storagePath
    let hasStoredBlob = slideData.hasStoredBlob || false

    if (mediaBlob) {
      const uploaded = await uploadSlideMedia(
        id,
        mediaBlob,
        slideData.fileName || "upload",
      )
      url = uploaded.url
      storagePath = uploaded.storagePath
      hasStoredBlob = uploaded.hasStoredBlob || false
    }

    const newSlide: SlideItem = {
      ...slideData,
      id,
      url,
      storagePath,
      hasStoredBlob,
      mediaType:
        slideData.mediaType ||
        (slideData.fileName?.match(/\.(mp4|webm|mov|ogg)$/i)
          ? "video"
          : "image"),
      mediaFit: slideData.mediaFit || "cover",
      durationSeconds:
        slideData.durationSeconds || (slideData.mediaType === "video" ? 12 : 6),
    }

    const newSlides = [...this.currentState.slides, newSlide]
    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      slides: newSlides,
      activeSlideIndex: newSlides.length - 1, // Jump to new slide
      lastAction: {
        type: "ADD_SLIDE",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Added ${newSlide.mediaType}: "${newSlide.title}"`,
      },
    }

    this.commitState(newState)

    // Broadcast binary media to peer tabs
    if (mediaBlob) {
      // Record upload in user database
      try {
        const userDb = getUserDatabase()
        userDb
          .recordUpload({
            fileName: slideData.fileName || `${newSlide.title}.jpg`,
            fileSize: mediaBlob.size,
            fileType: mediaBlob.type || "image/jpeg",
            mediaType: newSlide.mediaType,
            storageKey: storagePath || id,
            previewUrl: url,
            associatedSlideId: id,
            tags: [newSlide.category.toLowerCase(), "slide-media"],
          })
          .catch(() => {})
      } catch {
        // ignore
      }
    }

    return id
  }

  public async removeSlide(slideId: string): Promise<void> {
    const target = this.currentState.slides.find((s) => s.id === slideId)
    if (!target) return

    try {
      await deleteSlideMedia(target)
      if (target.storagePath) {
        await getUserDatabase().markSlideUploadDeleted(slideId)
      }
    } catch (err) {
      // Still remove the slide from rotation; the orphaned file can be removed from the
      // Admin Portal uploads tab or the Supabase dashboard.
      console.warn("Could not delete slide media:", err)
      this.notifyNotification(
        err instanceof Error ? err.message : "Could not delete slide media.",
        "alert",
      )
    }

    const newSlides = this.currentState.slides.filter((s) => s.id !== slideId)
    const safeActiveIndex = Math.min(
      this.currentState.activeSlideIndex,
      Math.max(0, newSlides.length - 1),
    )

    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      slides: newSlides,
      activeSlideIndex: safeActiveIndex,
      lastAction: {
        type: "REMOVE_SLIDE",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Removed slide "${target.title}"`,
      },
    }

    this.commitState(newState)
  }

  public updateSlide(slideId: string, changes: Partial<SlideItem>) {
    const target = this.currentState.slides.find((s) => s.id === slideId)
    if (!target) return

    const newSlides = this.currentState.slides.map((s) =>
      s.id === slideId ? { ...s, ...changes } : s,
    )

    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      slides: newSlides,
      lastAction: {
        type: "UPDATE_SLIDE",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Updated slide "${target.title}"`,
      },
    }

    this.commitState(newState)
  }

  public reorderSlides(newOrder: SlideItem[]) {
    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      slides: newOrder,
      lastAction: {
        type: "REORDER_SLIDES",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: "Reordered slide rotation sequence",
      },
    }

    this.commitState(newState)
  }

  public addTutorCourse(name: string) {
    const course = name.trim()
    const courses = getTutorCourses(this.currentState)
    if (!course || courses.some((c) => c.toLowerCase() === course.toLowerCase())) return

    this.commitState({
      ...this.currentState,
      version: this.currentState.version + 1,
      tutorCourses: [...courses, course],
      lastAction: {
        type: "UPDATE_TUTOR_COURSES",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Added tutoring course "${course}"`,
      },
    })
  }

  public removeTutorCourse(name: string) {
    const courses = getTutorCourses(this.currentState)
    const remaining = courses.filter((c) => c !== name)
    if (remaining.length === courses.length || remaining.length === 0) return

    this.commitState({
      ...this.currentState,
      version: this.currentState.version + 1,
      tutorCourses: remaining,
      lastAction: {
        type: "UPDATE_TUTOR_COURSES",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: `Removed tutoring course "${name}"`,
      },
    })
  }

  public resetSlidesToDefault() {
    const newState: SignageState = {
      ...this.currentState,
      version: this.currentState.version + 1,
      slides: INITIAL_SLIDES,
      activeSlideIndex: 0,
      lastAction: {
        type: "RESET_SLIDES",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: "Reset slides to default campus flyers",
      },
    }

    this.commitState(newState)
  }

  public sendPulse() {
    this.postMessage({
      type: "PING_PULSE",
      senderId: this.clientId,
      senderName: this.clientName,
    })
    this.pulseListeners.forEach((fn) => fn(this.clientName))
    this.notifyNotification(
      `📡 Sent sync pulse from ${this.clientName}`,
      "success",
    )
  }

  public resetToDefaults() {
    const newState: SignageState = {
      ...INITIAL_STATE,
      version: this.currentState.version + 1,
      lastAction: {
        type: "RESET_STATE",
        byClient: this.clientName,
        clientRole: this.clientRole,
        timestamp: Date.now(),
        description: "Reset display state to defaults",
      },
    }
    this.commitState(newState)
  }

  private commitState(
    newState: SignageState,
    options: { remote?: boolean; log?: boolean } = {},
  ) {
    const { remote = true, log = true } = options
    if (newState.lastAction) {
      newState = {
        ...newState,
        lastAction: { ...newState.lastAction, clientId: this.clientId },
      }
    }
    this.currentState = newState
    this.saveStoredState(newState)
    // Only signed-in staff write shared state; TV displays are read-only.
    if (remote && getUserDatabase().canWriteRemote()) {
      this.scheduleRemoteSave(newState)
    }
    this.postMessage({
      type: "STATE_UPDATE",
      state: newState,
      senderId: this.clientId,
    })
    this.notifyStateListeners(newState, newState.lastAction)

    // Automatically record action into the persistent audit log database
    if (log && newState.lastAction) {
      try {
        const userDb = getUserDatabase()
        const actionType = newState.lastAction.type
        const cat: ActionLogCategory =
          actionType.includes("LAB") ||
          actionType.includes("CLASS") ||
          actionType.includes("TUTOR")
            ? "lab"
            : actionType.includes("EVENT")
              ? "event"
              : actionType.includes("SLIDE") || actionType.includes("MEDIA")
                ? "media"
                : actionType.includes("ALERT")
                  ? "alert"
                  : "system"

        userDb
          .logAction({
            actionType,
            category: cat,
            summary: newState.lastAction.description,
            severity: actionType.includes("ALERT") ? "alert" : "info",
            ipOrDevice: `${this.clientName} (${this.clientRole})`,
          })
          .catch(() => {})
      } catch {
        // Safe failover
      }
    }
  }

  /** Debounce rapid edits (typing, reordering) into one Supabase write. */
  private scheduleRemoteSave(state: SignageState) {
    this.pendingRemoteState = state
    if (this.remoteSaveTimer) clearTimeout(this.remoteSaveTimer)
    this.remoteSaveTimer = window.setTimeout(
      () => this.flushRemoteSave(),
      REMOTE_SAVE_DEBOUNCE_MS,
    )
  }

  private async flushRemoteSave() {
    if (this.remoteSaveTimer) {
      clearTimeout(this.remoteSaveTimer)
      this.remoteSaveTimer = null
    }
    const state = this.pendingRemoteState
    if (!state) return

    // Never put browser-local media (blob:/IndexedDB) or inline base64 into shared state.
    const shareable: SignageState = {
      ...state,
      slides: (state.slides || []).filter(
        (s) =>
          !(s.hasStoredBlob && !s.storagePath) &&
          !s.url.startsWith("blob:") &&
          !s.url.startsWith("data:"),
      ),
    }

    const result = await getDatabaseConnection().saveSignageState(shareable)
    if (this.pendingRemoteState === state) this.pendingRemoteState = null
    if (!result.ok) {
      this.notifyNotification(
        `Could not save to Supabase: ${result.error || "unknown error"}`,
        "alert",
      )
    }
  }

  // Listener registrations
  public onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.currentState)
    return () => this.stateListeners.delete(listener)
  }

  public onClientsChange(listener: ClientsListener): () => void {
    this.clientsListeners.add(listener)
    listener(this.getConnectedClients())
    return () => this.clientsListeners.delete(listener)
  }

  public onPulse(listener: PulseListener): () => void {
    this.pulseListeners.add(listener)
    return () => this.pulseListeners.delete(listener)
  }

  public onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener)
    return () => this.notificationListeners.delete(listener)
  }

  private notifyStateListeners(
    state: SignageState,
    actionMeta?: SignageState["lastAction"],
  ) {
    this.stateListeners.forEach((fn) => fn(state, actionMeta))
  }

  private notifyClientsListeners() {
    const clients = this.getConnectedClients()
    this.clientsListeners.forEach((fn) => fn(clients))
  }

  private notifyNotification(
    msg: string,
    type: "info" | "success" | "alert" = "info",
  ) {
    this.notificationListeners.forEach((fn) => fn(msg, type))
  }

  public destroy() {
    if (this.isDestroyed) return
    this.isDestroyed = true
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.pruneTimer) clearInterval(this.pruneTimer)
    if (this.pendingRemoteState) this.flushRemoteSave()

    if (supabase) {
      if (this.stateChannel) supabase.removeChannel(this.stateChannel)
      if (this.presenceChannel) supabase.removeChannel(this.presenceChannel)
      this.stateChannel = null
      this.presenceChannel = null
    }

    this.postMessage({
      type: "CLIENT_DISCONNECT",
      clientId: this.clientId,
    })

    if (this.channel) {
      try {
        this.channel.close()
      } catch {
        // ignore
      }
      this.channel = null
    }

    this.stateListeners.clear()
    this.clientsListeners.clear()
    this.pulseListeners.clear()
    this.notificationListeners.clear()
  }
}

// Global singleton instance for single-client tabs
let defaultInstance: SyncEngine | null = null

export function getSyncEngine(): SyncEngine {
  if (!defaultInstance) {
    defaultInstance = new SyncEngine()
  }
  return defaultInstance
}
