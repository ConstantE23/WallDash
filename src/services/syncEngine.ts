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
import { INITIAL_STATE, INITIAL_SLIDES } from "../data/initialData"
import { saveMedia, getMediaUrl, deleteMedia } from "./mediaStorage"
import { getUserDatabase } from "./userDatabase"
import { getDatabaseConnection } from "./dbConnection"
import type { ActionLogCategory } from "../types/signage"

const STORAGE_STATE_KEY = "hampton_cs_sync_state_v1"
const STORAGE_CLIENTS_KEY = "hampton_cs_sync_clients_v1"
const CHANNEL_NAME = "hampton_cs_realtime_channel"

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
  }

  private async syncRemoteDatabase() {
    try {
      const db = getDatabaseConnection()
      const remoteState = await db.fetchSignageState()
      if (remoteState && remoteState.labs) {
        this.currentState = {
          ...this.currentState,
          ...remoteState,
          version: (this.currentState.version || 1) + 1,
        }
        this.saveStoredState(this.currentState)
        this.notifyStateListeners(this.currentState)
      }
    } catch (err) {
      console.warn("Could not sync remote state on init:", err)
    }
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
  }

  public getState(): SignageState {
    return this.currentState
  }

  public getConnectedClients(): ConnectedClient[] {
    const list = Array.from(this.connectedClients.values())
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

  private async rehydrateMedia() {
    if (!this.currentState.slides || this.currentState.slides.length === 0)
      return
    let changed = false
    const restoredSlides = await Promise.all(
      this.currentState.slides.map(async (slide) => {
        if (slide.hasStoredBlob || !slide.url) {
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

  public setActiveSlide(index: number) {
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

    this.commitState(newState)
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

  public async addSlide(
    slideData: Omit<SlideItem, "id">,
    mediaBlob?: Blob,
  ): Promise<string> {
    const id = `slide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    let url = slideData.url
    let hasStoredBlob = false

    if (mediaBlob) {
      try {
        url = await saveMedia(id, mediaBlob, slideData.fileName || "upload")
        hasStoredBlob = true
      } catch (err) {
        console.warn("Failed to save media blob:", err)
      }
    }

    const newSlide: SlideItem = {
      ...slideData,
      id,
      url,
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
            storageKey: id,
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

    if (target.hasStoredBlob) {
      await deleteMedia(slideId)
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

  private commitState(newState: SignageState) {
    this.currentState = newState
    this.saveStoredState(newState)
    getDatabaseConnection().saveSignageState(newState).catch(() => {})
    this.postMessage({
      type: "STATE_UPDATE",
      state: newState,
      senderId: this.clientId,
    })
    this.notifyStateListeners(newState, newState.lastAction)

    // Automatically record action into the persistent audit log database
    if (newState.lastAction) {
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
    this.isDestroyed = true
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.pruneTimer) clearInterval(this.pruneTimer)

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
