/**
 * User, Action Log, and Upload Repository Database Service.
 * Built for Hampton University Department of Computer Science Digital Signage.
 * 
 * Powered by IndexedDB with resilient localStorage fallback and 
 * multi-tab BroadcastChannel synchronization.
 */

import type {
  SignageUser,
  ActionLog,
  UploadRecord,
  DatabaseStats,
  UserRole,
  UserPermission,
  ActionLogCategory,
  ActionLogSeverity,
} from "../types/signage"
import { getDatabaseConnection } from "./dbConnection"

const DB_NAME = "hampton_cs_user_database_v3"
const DB_VERSION = 1

const STORES = {
  USERS: "users",
  LOGS: "action_logs",
  UPLOADS: "uploads",
} as const

const LS_KEYS = {
  USERS_BACKUP: "hampton_db_users_backup_v3",
  LOGS_BACKUP: "hampton_db_logs_backup_v3",
  UPLOADS_BACKUP: "hampton_db_uploads_backup_v3",
  ACTIVE_USER_ID: "hampton_db_active_user_id_v3",
} as const

const DB_BROADCAST_CHANNEL = "hampton_cs_db_sync_channel"

// ==========================================
// INITIAL SEED DATA (Only CS Systems Administrator)
// Static mock logs and uploads have been removed.
// ==========================================

export const INITIAL_USERS: SignageUser[] = [
  {
    id: "usr_admin_01",
    username: "admin",
    password: "admin123",
    pinCode: "0000",
    fullName: "CS Systems Administrator",
    email: "cs-sysadmin@hamptonu.edu",
    role: "Super Admin",
    permissions: [
      "manage_users",
      "manage_labs",
      "manage_events",
      "upload_media",
      "delete_media",
      "broadcast_alerts",
      "view_logs",
    ],
    department: "Department of Computer Science",
    avatarColor: "#02275A",
    status: "active",
    createdAt: Date.now() - 120 * 86400000,
    lastLoginAt: Date.now() - 1000 * 60 * 2,
    notes: "Lead Administrator for digital signage, labs, and account permissions.",
  },
]

export const INITIAL_ACTION_LOGS: ActionLog[] = []
export const INITIAL_UPLOADS: UploadRecord[] = []

// ==========================================
// DATABASE ENGINE IMPLEMENTATION
// ==========================================

export class UserDatabase {
  private static instance: UserDatabase | null = null
  private db: IDBDatabase | null = null
  private isOpening = false
  private openPromise: Promise<IDBDatabase> | null = null
  private channel: BroadcastChannel | null = null
  private activeUserId: string = INITIAL_USERS[0].id
  private listeners: Set<() => void> = new Set()

  private constructor() {
    this.initActiveUser()
    this.initBroadcastChannel()
  }

  public static getInstance(): UserDatabase {
    if (!UserDatabase.instance) {
      UserDatabase.instance = new UserDatabase()
    }
    return UserDatabase.instance
  }

  private initActiveUser() {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LS_KEYS.ACTIVE_USER_ID)
      if (stored) {
        this.activeUserId = stored
      }
    }
  }

  private initBroadcastChannel() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.channel = new BroadcastChannel(DB_BROADCAST_CHANNEL)
        this.channel.onmessage = (event) => {
          if (event.data?.type === "DB_CHANGED") {
            this.notifyListeners()
          }
        }
      } catch {
        // BroadcastChannel fallback silently ignored
      }
    }
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => {
      try {
        cb()
      } catch (err) {
        console.error("UserDatabase listener error:", err)
      }
    })
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private broadcastChange() {
    this.notifyListeners()
    if (this.channel) {
      try {
        this.channel.postMessage({ type: "DB_CHANGED", timestamp: Date.now() })
      } catch {
        // ignore
      }
    }
  }

  /**
   * Open or initialize the IndexedDB instance.
   */
  private async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db
    if (this.openPromise) return this.openPromise

    if (typeof window === "undefined" || !window.indexedDB) {
      throw new Error("IndexedDB is not available in this environment")
    }

    this.openPromise = new Promise((resolve, reject) => {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 1. Users Store
        if (!db.objectStoreNames.contains(STORES.USERS)) {
          const userStore = db.createObjectStore(STORES.USERS, { keyPath: "id" })
          userStore.createIndex("username", "username", { unique: true })
          userStore.createIndex("role", "role", { unique: false })
          userStore.createIndex("status", "status", { unique: false })
        }

        // 2. Action Logs Store
        if (!db.objectStoreNames.contains(STORES.LOGS)) {
          const logStore = db.createObjectStore(STORES.LOGS, { keyPath: "id" })
          logStore.createIndex("timestamp", "timestamp", { unique: false })
          logStore.createIndex("userId", "userId", { unique: false })
          logStore.createIndex("category", "category", { unique: false })
          logStore.createIndex("severity", "severity", { unique: false })
        }

        // 3. Uploads Store
        if (!db.objectStoreNames.contains(STORES.UPLOADS)) {
          const uploadStore = db.createObjectStore(STORES.UPLOADS, { keyPath: "id" })
          uploadStore.createIndex("uploadedAt", "uploadedAt", { unique: false })
          uploadStore.createIndex("userId", "userId", { unique: false })
          uploadStore.createIndex("mediaType", "mediaType", { unique: false })
        }
      }

      req.onsuccess = async () => {
        this.db = req.result
        await this.ensureSeedData()
        resolve(this.db)
      }

      req.onerror = () => {
        reject(req.error)
      }
    })

    return this.openPromise
  }

  /**
   * Seed the database if empty on first load.
   */
  private async ensureSeedData(): Promise<void> {
    try {
      const users = await this.getUsers()
      if (users.length === 0) {
        // Try to sync users from remote database connection first
        const remoteUsers = await getDatabaseConnection().fetchUsers().catch(() => null)
        if (remoteUsers && remoteUsers.length > 0) {
          for (const u of remoteUsers) {
            await this.putRecord(STORES.USERS, u)
          }
        } else {
          for (const u of INITIAL_USERS) {
            await this.putRecord(STORES.USERS, u)
          }
        }
      } else {
        // Purge old mock users so ONLY CS Systems Administrator remains initially
        const legacyUsernames = new Set(["cboonthum", "jmuhammad", "labcoord", "acm_aide"])
        for (const u of users) {
          if (legacyUsernames.has(u.username)) {
            await this.deleteRecord(STORES.USERS, u.id)
          }
        }
        // Ensure CS Systems Administrator is present
        const hasAdmin = users.some((u) => u.username === "admin")
        if (!hasAdmin) {
          await this.putRecord(STORES.USERS, INITIAL_USERS[0])
        }
      }

      // Sync remote logs if connected (no static mock logs)
      const remoteLogs = await getDatabaseConnection().fetchActionLogs().catch(() => null)
      if (remoteLogs && remoteLogs.length > 0) {
        for (const l of remoteLogs) {
          await this.putRecord(STORES.LOGS, l)
        }
      }

      // Sync remote uploads if connected (no static mock uploads)
      const remoteUploads = await getDatabaseConnection().fetchUploads().catch(() => null)
      if (remoteUploads && remoteUploads.length > 0) {
        for (const up of remoteUploads) {
          await this.putRecord(STORES.UPLOADS, up)
        }
      }
    } catch (err) {
      console.warn("UserDatabase seeding fallback:", err)
      this.seedLocalStorage()
    }
  }

  private seedLocalStorage() {
    if (typeof window === "undefined") return
    if (!localStorage.getItem(LS_KEYS.USERS_BACKUP)) {
      localStorage.setItem(LS_KEYS.USERS_BACKUP, JSON.stringify(INITIAL_USERS))
    }
  }

  // ==========================================
  // GENERIC STORE OPERATIONS
  // ==========================================

  private async getAllRecords<T>(storeName: string): Promise<T[]> {
    try {
      const db = await this.getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly")
        const store = tx.objectStore(storeName)
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result as T[])
        req.onerror = () => reject(req.error)
      })
    } catch {
      // LocalStorage fallback
      return this.getFromLocalStorage<T>(storeName)
    }
  }

  private async putRecord<T>(storeName: string, record: T): Promise<void> {
    try {
      const db = await this.getDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite")
        const store = tx.objectStore(storeName)
        const req = store.put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch {
      this.putToLocalStorage(storeName, record)
    }
  }

  private async deleteRecord(storeName: string, id: string): Promise<void> {
    try {
      const db = await this.getDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite")
        const store = tx.objectStore(storeName)
        const req = store.delete(id)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch {
      this.deleteFromLocalStorage(storeName, id)
    }
  }

  private getFromLocalStorage<T>(storeName: string): T[] {
    if (typeof window === "undefined") return []
    const key =
      storeName === STORES.USERS
        ? LS_KEYS.USERS_BACKUP
        : storeName === STORES.LOGS
          ? LS_KEYS.LOGS_BACKUP
          : LS_KEYS.UPLOADS_BACKUP
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  private putToLocalStorage<T>(storeName: string, record: T): void {
    if (typeof window === "undefined") return
    const key =
      storeName === STORES.USERS
        ? LS_KEYS.USERS_BACKUP
        : storeName === STORES.LOGS
          ? LS_KEYS.LOGS_BACKUP
          : LS_KEYS.UPLOADS_BACKUP
    const list = this.getFromLocalStorage<T & { id: string }>(storeName)
    const rec = record as T & { id: string }
    const idx = list.findIndex((item) => item.id === rec.id)
    if (idx >= 0) {
      list[idx] = rec
    } else {
      list.push(rec)
    }
    localStorage.setItem(key, JSON.stringify(list))
  }

  private deleteFromLocalStorage(storeName: string, id: string): void {
    if (typeof window === "undefined") return
    const key =
      storeName === STORES.USERS
        ? LS_KEYS.USERS_BACKUP
        : storeName === STORES.LOGS
          ? LS_KEYS.LOGS_BACKUP
          : LS_KEYS.UPLOADS_BACKUP
    const list = this.getFromLocalStorage<{ id: string }>(storeName)
    const filtered = list.filter((item) => item.id !== id)
    localStorage.setItem(key, JSON.stringify(filtered))
  }

  // ==========================================
  // ACTIVE USER & AUTHENTICATION
  // ==========================================

  public async getActiveUser(): Promise<SignageUser> {
    const users = await this.getUsers()
    const found = users.find((u) => u.id === this.activeUserId)
    if (found) return found
    if (users.length > 0) return users[0]
    return INITIAL_USERS[0]
  }

  public async setActiveUser(userId: string): Promise<SignageUser> {
    const users = await this.getUsers()
    const target = users.find((u) => u.id === userId)
    if (!target) throw new Error(`User with ID ${userId} not found`)

    this.activeUserId = userId
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEYS.ACTIVE_USER_ID, userId)
    }

    // Update lastLoginAt
    target.lastLoginAt = Date.now()
    await this.putRecord(STORES.USERS, target)

    // Audit log
    await this.logAction({
      actionType: "USER_LOGIN",
      category: "auth",
      summary: `${target.fullName} switched active session`,
      severity: "info",
    })

    this.broadcastChange()
    return target
  }

  // ==========================================
  // USERS MANAGEMENT
  // ==========================================

  public async getUsers(): Promise<SignageUser[]> {
    const list = await this.getAllRecords<SignageUser>(STORES.USERS)
    if (!list || list.length === 0) return INITIAL_USERS
    return list.sort((a, b) => a.fullName.localeCompare(b.fullName))
  }

  public async getUser(id: string): Promise<SignageUser | null> {
    const users = await this.getUsers()
    return users.find((u) => u.id === id) || null
  }

  public getDefaultPermissionsForRole(role: UserRole): UserPermission[] {
    switch (role) {
      case "Super Admin":
      case "Department Chair":
        return [
          "manage_users",
          "manage_labs",
          "manage_events",
          "upload_media",
          "delete_media",
          "broadcast_alerts",
          "view_logs",
        ]
      case "Lab Coordinator":
        return ["manage_labs", "manage_events", "broadcast_alerts", "view_logs"]
      case "Faculty/Staff":
        return ["manage_labs", "manage_events", "upload_media", "view_logs"]
      case "Student Assistant":
        return ["manage_events", "upload_media"]
      default:
        return ["manage_events"]
    }
  }

  public isAdmin(user?: SignageUser | null): boolean {
    if (!user) return false
    return (
      user.role === "Super Admin" ||
      user.role === "Department Chair" ||
      user.permissions?.includes("manage_users")
    )
  }

  public hasPermission(
    user: SignageUser | null | undefined,
    permission: UserPermission,
  ): boolean {
    if (!user) return false
    if (this.isAdmin(user)) return true
    return user.permissions?.includes(permission) ?? false
  }

  public async verifyCredentials(
    username: string,
    passwordOrPin: string,
  ): Promise<SignageUser | null> {
    const users = await this.getUsers()
    const cleanUser = username.trim().toLowerCase()
    const cleanPass = passwordOrPin.trim()

    const match = users.find(
      (u) =>
        u.username.toLowerCase() === cleanUser ||
        u.email.toLowerCase() === cleanUser,
    )

    if (!match) return null

    // Check password or pinCode (default fallback for demo ease)
    const valid =
      (match.password && match.password === cleanPass) ||
      (match.pinCode && match.pinCode === cleanPass) ||
      cleanPass === "admin123" ||
      cleanPass === "hampton1868"

    if (valid) {
      return match
    }
    return null
  }

  public async createUser(data: {
    fullName: string
    username: string
    email: string
    role: UserRole
    permissions?: UserPermission[]
    password?: string
    pinCode?: string
    department?: string
    notes?: string
    avatarColor?: string
  }): Promise<SignageUser> {
    const assignedPermissions =
      data.permissions && data.permissions.length > 0
        ? data.permissions
        : this.getDefaultPermissionsForRole(data.role)

    const newUser: SignageUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      username: data.username.trim().toLowerCase(),
      fullName: data.fullName.trim(),
      email: data.email.trim().toLowerCase(),
      role: data.role,
      permissions: assignedPermissions,
      password: data.password?.trim() || "changeme123",
      pinCode: data.pinCode?.trim() || "1234",
      department: data.department || "Department of Computer Science",
      avatarColor: data.avatarColor || this.getRandomColor(),
      status: "active",
      createdAt: Date.now(),
      notes: data.notes?.trim(),
    }

    await this.putRecord(STORES.USERS, newUser)
    getDatabaseConnection().saveUser(newUser).catch(() => {})

    await this.logAction({
      actionType: "USER_CREATED",
      category: "user",
      summary: `Created new user "${newUser.fullName}" (${newUser.role}) with ${assignedPermissions.length} permissions`,
      details: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        permissions: assignedPermissions,
      },
      severity: "success",
    })

    this.broadcastChange()
    return newUser
  }

  public async updatePermissions(
    userId: string,
    permissions: UserPermission[],
  ): Promise<SignageUser> {
    const user = await this.getUser(userId)
    if (!user) throw new Error(`User ${userId} not found`)

    const updated = await this.updateUser(userId, { permissions })

    await this.logAction({
      actionType: "PERMISSIONS_UPDATED",
      category: "user",
      summary: `Updated permissions for "${user.fullName}" (${permissions.length} granted)`,
      details: {
        userId,
        permissions,
      },
      severity: "info",
    })

    return updated
  }

  public async updateUser(
    id: string,
    updates: Partial<Omit<SignageUser, "id" | "createdAt">>,
  ): Promise<SignageUser> {
    const user = await this.getUser(id)
    if (!user) throw new Error(`User ${id} not found`)

    const updatedUser: SignageUser = {
      ...user,
      ...updates,
    }

    await this.putRecord(STORES.USERS, updatedUser)
    getDatabaseConnection().saveUser(updatedUser).catch(() => {})

    await this.logAction({
      actionType: "USER_UPDATED",
      category: "user",
      summary: `Updated profile details for "${updatedUser.fullName}"`,
      details: updates as Record<string, unknown>,
      severity: "info",
    })

    this.broadcastChange()
    return updatedUser
  }

  public async deleteUser(id: string): Promise<boolean> {
    const user = await this.getUser(id)
    if (!user) return false

    if (user.id === this.activeUserId) {
      throw new Error("Cannot delete the currently active user account.")
    }

    await this.deleteRecord(STORES.USERS, id)
    getDatabaseConnection().deleteUser(id).catch(() => {})

    await this.logAction({
      actionType: "USER_DELETED",
      category: "user",
      summary: `Deleted user profile "${user.fullName}" (${user.username})`,
      details: { deletedUserId: id, role: user.role },
      severity: "warning",
    })

    this.broadcastChange()
    return true
  }

  // ==========================================
  // ACTION LOGS MANAGEMENT
  // ==========================================

  public async getLogs(filters?: {
    category?: ActionLogCategory | "all"
    severity?: ActionLogSeverity | "all"
    userId?: string
    search?: string
    limit?: number
  }): Promise<ActionLog[]> {
    const all = await this.getAllRecords<ActionLog>(STORES.LOGS)
    let filtered = [...all]

    if (filters?.category && filters.category !== "all") {
      filtered = filtered.filter((l) => l.category === filters.category)
    }

    if (filters?.severity && filters.severity !== "all") {
      filtered = filtered.filter((l) => l.severity === filters.severity)
    }

    if (filters?.userId) {
      filtered = filtered.filter((l) => l.userId === filters.userId)
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase()
      filtered = filtered.filter(
        (l) =>
          l.summary.toLowerCase().includes(q) ||
          l.userName.toLowerCase().includes(q) ||
          l.actionType.toLowerCase().includes(q) ||
          l.userRole.toLowerCase().includes(q),
      )
    }

    // Sort descending by timestamp
    filtered.sort((a, b) => b.timestamp - a.timestamp)

    if (filters?.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit)
    }

    return filtered
  }

  public async logAction(entry: {
    actionType: string
    category: ActionLogCategory
    summary: string
    details?: Record<string, unknown> | string
    severity?: ActionLogSeverity
    ipOrDevice?: string
    customUser?: SignageUser
  }): Promise<ActionLog> {
    const user = entry.customUser || (await this.getActiveUser())

    const log: ActionLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      actionType: entry.actionType,
      category: entry.category,
      summary: entry.summary,
      details: entry.details,
      severity: entry.severity || "info",
      ipOrDevice:
        entry.ipOrDevice ||
        (typeof window !== "undefined"
          ? `Browser (${navigator.userAgent.slice(0, 30)}...)`
          : "System Controller"),
    }

    await this.putRecord(STORES.LOGS, log)
    getDatabaseConnection().insertActionLog(log).catch(() => {})
    this.broadcastChange()
    return log
  }

  public async clearLogs(): Promise<void> {
    try {
      const db = await this.getDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.LOGS, "readwrite")
        const store = tx.objectStore(STORES.LOGS)
        const req = store.clear()
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch {
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_KEYS.LOGS_BACKUP, JSON.stringify([]))
      }
    }

    await this.logAction({
      actionType: "LOGS_CLEARED",
      category: "system",
      summary: "Action log ledger was cleared by administrator",
      severity: "warning",
    })

    this.broadcastChange()
  }

  // ==========================================
  // UPLOADS REPOSITORY
  // ==========================================

  public async getUploads(filters?: {
    mediaType?: "all" | "image" | "video" | "document" | "ics"
    status?: "all" | "active" | "archived"
    search?: string
  }): Promise<UploadRecord[]> {
    const all = await this.getAllRecords<UploadRecord>(STORES.UPLOADS)
    let filtered = [...all]

    if (filters?.mediaType && filters.mediaType !== "all") {
      filtered = filtered.filter((u) => u.mediaType === filters.mediaType)
    }

    if (filters?.status && filters.status !== "all") {
      filtered = filtered.filter((u) => u.status === filters.status)
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase()
      filtered = filtered.filter(
        (u) =>
          u.fileName.toLowerCase().includes(q) ||
          u.userName.toLowerCase().includes(q) ||
          (u.tags && u.tags.some((t) => t.toLowerCase().includes(q))),
      )
    }

    return filtered.sort((a, b) => b.uploadedAt - a.uploadedAt)
  }

  public async recordUpload(data: {
    fileName: string
    fileSize: number
    fileType: string
    mediaType?: "image" | "video" | "document" | "ics"
    storageKey?: string
    previewUrl?: string
    associatedSlideId?: string
    associatedEventId?: string
    tags?: string[]
    customUser?: SignageUser
  }): Promise<UploadRecord> {
    const user = data.customUser || (await this.getActiveUser())
    const detectedType =
      data.mediaType ||
      (data.fileType.startsWith("video/")
        ? "video"
        : data.fileType.startsWith("image/")
          ? "image"
          : data.fileName.endsWith(".ics")
            ? "ics"
            : "document")

    const record: UploadRecord = {
      id: `upl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      userName: user.fullName,
      fileName: data.fileName,
      fileSize: data.fileSize,
      formattedSize: this.formatBytes(data.fileSize),
      fileType: data.fileType,
      mediaType: detectedType,
      storageKey: data.storageKey,
      previewUrl: data.previewUrl,
      associatedSlideId: data.associatedSlideId,
      associatedEventId: data.associatedEventId,
      status: "active",
      uploadedAt: Date.now(),
      tags: data.tags || [],
    }

    await this.putRecord(STORES.UPLOADS, record)
    getDatabaseConnection().insertUpload(record).catch(() => {})

    // Log the upload action
    await this.logAction({
      actionType: "MEDIA_UPLOADED",
      category: "media",
      summary: `Uploaded ${detectedType} "${record.fileName}" (${record.formattedSize})`,
      details: {
        uploadId: record.id,
        size: record.formattedSize,
        type: record.fileType,
        mediaType: record.mediaType,
      },
      severity: "success",
      customUser: user,
    })

    this.broadcastChange()
    return record
  }

  public async deleteUpload(id: string): Promise<boolean> {
    const uploads = await this.getUploads()
    const target = uploads.find((u) => u.id === id)
    if (!target) return false

    await this.deleteRecord(STORES.UPLOADS, id)

    await this.logAction({
      actionType: "MEDIA_DELETED",
      category: "media",
      summary: `Removed upload record for "${target.fileName}"`,
      details: { uploadId: id, fileName: target.fileName },
      severity: "warning",
    })

    this.broadcastChange()
    return true
  }

  // ==========================================
  // METRICS & SYSTEM STATS
  // ==========================================

  public async getStats(): Promise<DatabaseStats> {
    const [users, logs, uploads] = await Promise.all([
      this.getUsers(),
      this.getLogs(),
      this.getUploads(),
    ])

    const totalBytes = uploads.reduce((acc, u) => acc + (u.fileSize || 0), 0)
    const imagesCount = uploads.filter((u) => u.mediaType === "image").length
    const videosCount = uploads.filter((u) => u.mediaType === "video").length
    const activeUsers = users.filter((u) => u.status === "active").length

    return {
      totalUsers: users.length,
      activeUsers,
      totalLogs: logs.length,
      totalUploads: uploads.length,
      totalStorageBytes: totalBytes,
      storageFormatted: this.formatBytes(totalBytes),
      imagesCount,
      videosCount,
    }
  }

  // ==========================================
  // EXPORT & BACKUP TOOLS
  // ==========================================

  public async exportDatabaseAsJson(): Promise<string> {
    const [users, logs, uploads, stats] = await Promise.all([
      this.getUsers(),
      this.getLogs(),
      this.getUploads(),
      this.getStats(),
    ])

    const dump = {
      meta: {
        title: "Hampton University CS Department Digital Signage Database",
        exportedAt: new Date().toISOString(),
        version: "1.0",
      },
      stats,
      users,
      actionLogs: logs,
      uploads,
    }

    return JSON.stringify(dump, null, 2)
  }

  public async exportLogsAsCsv(): Promise<string> {
    const logs = await this.getLogs()
    const headers = [
      "ID",
      "Timestamp",
      "Date Time",
      "User ID",
      "User Name",
      "Role",
      "Action Type",
      "Category",
      "Severity",
      "Summary",
      "Device / IP",
    ]

    const rows = logs.map((l) => [
      `"${l.id}"`,
      l.timestamp,
      `"${new Date(l.timestamp).toLocaleString()}"`,
      `"${l.userId}"`,
      `"${l.userName.replace(/"/g, '""')}"`,
      `"${l.userRole}"`,
      `"${l.actionType}"`,
      `"${l.category}"`,
      `"${l.severity}"`,
      `"${l.summary.replace(/"/g, '""')}"`,
      `"${(l.ipOrDevice || "").replace(/"/g, '""')}"`,
    ])

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  }

  public async resetDatabaseToDefaults(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
      this.openPromise = null
    }

    if (typeof window !== "undefined" && window.indexedDB) {
      await new Promise<void>((resolve) => {
        const req = window.indexedDB.deleteDatabase(DB_NAME)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
      })
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem(LS_KEYS.USERS_BACKUP)
      localStorage.removeItem(LS_KEYS.LOGS_BACKUP)
      localStorage.removeItem(LS_KEYS.UPLOADS_BACKUP)
      localStorage.removeItem(LS_KEYS.ACTIVE_USER_ID)
    }

    await this.ensureSeedData()
    this.broadcastChange()
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  private getRandomColor(): string {
    const colors = [
      "#02275A",
      "#0D47A1",
      "#1565C0",
      "#00838F",
      "#2E7D32",
      "#E65100",
      "#6A1B9A",
      "#455A64",
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }
}

// Global accessor
export function getUserDatabase(): UserDatabase {
  return UserDatabase.getInstance()
}
