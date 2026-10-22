/**
 * User, Action Log, and Upload Repository Database Service.
 * Built for Hampton University Department of Computer Science Digital Signage.
 *
 * With Supabase configured:
 *   - Staff sign in with Supabase Auth (email + password); passwords never touch this code.
 *   - The signed-in user's `profiles` row drives role/permission checks.
 *   - Action logs and upload records live in the `action_logs` / `uploads` tables.
 *   - Creating/deleting accounts goes through the admin-only `/api/admin-users` function,
 *     which holds the service role key server-side.
 *
 * Without Supabase (local dev only), the original IndexedDB store is kept as a
 * single-browser fallback with a password-less local admin profile.
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
import { supabase, MEDIA_BUCKET } from "./supabaseClient"

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

const LOCAL_SESSION_KEY = "hampton_auth_user_id"
const DB_BROADCAST_CHANNEL = "hampton_cs_db_sync_channel"
const REMOTE_LIST_LIMIT = 500

/** Local fallback mode is only offered in dev builds that have no Supabase env vars. */
export const LOCAL_MODE_AVAILABLE = !supabase && import.meta.env.DEV

// ==========================================
// LOCAL FALLBACK SEED (no credentials — local dev only)
// ==========================================

export const LOCAL_ADMIN: SignageUser = {
  id: "usr_local_admin",
  username: "local-admin",
  fullName: "Local Dev Administrator",
  email: "local-admin@localhost",
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
  createdAt: 0,
  notes: "Offline/local-only profile used when Supabase is not configured.",
}

// ==========================================
// SUPABASE ROW MAPPING
// ==========================================

interface ProfileRow {
  id: string
  email: string | null
  full_name: string
  username: string | null
  role: UserRole | null
  permissions: string[] | null
  avatar_color: string | null
  department: string | null
  status: SignageUser["status"]
  notes: string | null
  last_login_at: string | null
  created_at: string
}

interface ActionLogRow {
  id: string
  timestamp: string
  user_id: string | null
  user_name: string
  user_role: string
  action_type: string
  category: ActionLogCategory
  summary: string
  details: Record<string, unknown> | string | null
  ip_or_device: string | null
  severity: ActionLogSeverity
}

interface UploadRow {
  id: string
  user_id: string | null
  user_name: string
  file_name: string
  file_size: number
  formatted_size: string
  file_type: string
  media_type: UploadRecord["mediaType"]
  storage_path: string | null
  public_url: string | null
  associated_slide_id: string | null
  associated_event_id: string | null
  status: UploadRecord["status"]
  tags: string[] | null
  uploaded_at: string
}

function toTime(value: string | null | undefined): number | undefined {
  return value ? new Date(value).getTime() : undefined
}

function profileToUser(row: ProfileRow): SignageUser {
  return {
    id: row.id,
    username: row.username || row.email?.split("@")[0] || "user",
    fullName: row.full_name || row.email || "Unnamed user",
    email: row.email || "",
    role: row.role,
    permissions: (row.permissions || []) as UserPermission[],
    department: row.department || "Department of Computer Science",
    avatarColor: row.avatar_color || undefined,
    status: row.status,
    createdAt: toTime(row.created_at) ?? 0,
    lastLoginAt: toTime(row.last_login_at),
    notes: row.notes || undefined,
  }
}

function rowToLog(row: ActionLogRow): ActionLog {
  return {
    id: row.id,
    timestamp: toTime(row.timestamp) ?? 0,
    userId: row.user_id || "",
    userName: row.user_name,
    userRole: row.user_role,
    actionType: row.action_type,
    category: row.category,
    summary: row.summary,
    details: row.details ?? undefined,
    ipOrDevice: row.ip_or_device || undefined,
    severity: row.severity,
  }
}

function rowToUpload(row: UploadRow): UploadRecord {
  return {
    id: row.id,
    userId: row.user_id || "",
    userName: row.user_name,
    fileName: row.file_name,
    fileSize: Number(row.file_size) || 0,
    formattedSize: row.formatted_size,
    fileType: row.file_type,
    mediaType: row.media_type,
    storageKey: row.storage_path || undefined,
    previewUrl: row.public_url || undefined,
    associatedSlideId: row.associated_slide_id || undefined,
    associatedEventId: row.associated_event_id || undefined,
    status: row.status,
    uploadedAt: toTime(row.uploaded_at) ?? 0,
    tags: row.tags || [],
  }
}

type SessionListener = (user: SignageUser | null) => void

// ==========================================
// DATABASE ENGINE IMPLEMENTATION
// ==========================================

export class UserDatabase {
  private static instance: UserDatabase | null = null
  private db: IDBDatabase | null = null
  private openPromise: Promise<IDBDatabase> | null = null
  private channel: BroadcastChannel | null = null
  private activeUserId: string = LOCAL_ADMIN.id
  private listeners: Set<() => void> = new Set()

  /** Signed-in staff profile (Supabase mode) or local session user (fallback). */
  private sessionUser: SignageUser | null = null
  private sessionListeners: Set<SessionListener> = new Set()

  private constructor() {
    this.initActiveUser()
    this.initBroadcastChannel()
    this.initAuthListener()
  }

  public static getInstance(): UserDatabase {
    if (!UserDatabase.instance) {
      UserDatabase.instance = new UserDatabase()
    }
    return UserDatabase.instance
  }

  public isRemote(): boolean {
    return supabase !== null
  }

  private initActiveUser() {
    if (typeof window !== "undefined" && !supabase) {
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

  /**
   * Keep `sessionUser` in step with Supabase Auth. An expired session that can't be
   * refreshed emits SIGNED_OUT, which sends /manage back to the login view.
   */
  private initAuthListener() {
    if (!supabase) return
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        this.setSessionUser(null)
      }
    })
  }

  private setSessionUser(user: SignageUser | null) {
    const changed = this.sessionUser !== user
    this.sessionUser = user
    if (changed) {
      this.sessionListeners.forEach((cb) => {
        try {
          cb(user)
        } catch (err) {
          console.error("Session listener error:", err)
        }
      })
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

  /** Called with the new user on sign-in and with null on sign-out / session expiry. */
  public onSessionChange(cb: SessionListener): () => void {
    this.sessionListeners.add(cb)
    return () => this.sessionListeners.delete(cb)
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

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  /**
   * Validates the profile behind a Supabase session. Throws a user-facing message and
   * signs out if the account isn't allowed into /manage.
   */
  private async loadSessionProfile(userId: string): Promise<SignageUser> {
    if (!supabase) throw new Error("Supabase is not configured.")
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    if (error || !data) {
      await supabase.auth.signOut()
      throw new Error(
        error
          ? `Could not load your staff profile: ${error.message}`
          : "No staff profile exists for this account. Ask an administrator to set one up.",
      )
    }

    const user = profileToUser(data as ProfileRow)
    if (user.status !== "active") {
      await supabase.auth.signOut()
      throw new Error("This account is inactive. Contact a signage administrator.")
    }
    if (!user.role) {
      await supabase.auth.signOut()
      throw new Error(
        "Your account is waiting for an administrator to assign a role before you can sign in.",
      )
    }
    return user
  }

  /** Sign in with Supabase Auth email + password. */
  public async signIn(email: string, password: string): Promise<SignageUser> {
    if (!supabase) throw new Error("Supabase is not configured for this deployment.")

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error || !data.user) {
      throw new Error(
        error?.message === "Invalid login credentials"
          ? "Invalid email or password."
          : error?.message || "Sign-in failed. Please retry.",
      )
    }

    const user = await this.loadSessionProfile(data.user.id)
    this.setSessionUser(user)
    await supabase.rpc("record_login")
    await this.logAction({
      actionType: "USER_LOGIN",
      category: "auth",
      summary: `${user.fullName} signed in to the Staff Portal`,
      severity: "info",
      customUser: user,
    })
    return user
  }

  /** Local dev only: enter /manage as the local admin when Supabase isn't configured. */
  public async signInLocal(): Promise<SignageUser> {
    if (!LOCAL_MODE_AVAILABLE) {
      throw new Error("Local mode is only available in development builds.")
    }
    const users = await this.getUsers()
    const user = users.find((u) => u.id === this.activeUserId) || users[0] || LOCAL_ADMIN
    this.activeUserId = user.id
    sessionStorage.setItem(LOCAL_SESSION_KEY, user.id)
    localStorage.setItem(LS_KEYS.ACTIVE_USER_ID, user.id)
    this.setSessionUser(user)
    return user
  }

  /** Restore an existing session on page load. Returns null if there isn't a valid one. */
  public async restoreSession(): Promise<SignageUser | null> {
    if (supabase) {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        this.setSessionUser(null)
        return null
      }
      try {
        const user = await this.loadSessionProfile(data.session.user.id)
        this.setSessionUser(user)
        return user
      } catch {
        this.setSessionUser(null)
        return null
      }
    }

    if (!LOCAL_MODE_AVAILABLE) return null
    const storedId = sessionStorage.getItem(LOCAL_SESSION_KEY)
    if (!storedId) return null
    const user = await this.getUser(storedId)
    if (user && user.status === "active") {
      this.activeUserId = user.id
      this.setSessionUser(user)
      return user
    }
    return null
  }

  public async signOut(): Promise<void> {
    const user = this.sessionUser
    if (user) {
      await this.logAction({
        actionType: "USER_LOGOUT",
        category: "auth",
        summary: `${user.fullName} signed out of the Staff Portal`,
        severity: "info",
        customUser: user,
      }).catch(() => null)
    }
    if (supabase) {
      await supabase.auth.signOut()
    } else if (typeof window !== "undefined") {
      sessionStorage.removeItem(LOCAL_SESSION_KEY)
    }
    this.setSessionUser(null)
  }

  /** The signed-in staff member, or null (e.g. on anonymous TV displays). */
  public getSessionUser(): SignageUser | null {
    return this.sessionUser
  }

  /** True when this browser holds a staff session that may write shared state. */
  public canWriteRemote(): boolean {
    return supabase !== null && this.sessionUser !== null
  }

  private async getAccessToken(): Promise<string> {
    if (!supabase) throw new Error("Supabase is not configured.")
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error("Your session has expired. Please sign in again.")
    return token
  }

  /** Calls the admin-only Vercel Function that holds the service role key. */
  private async callAdminApi<T>(method: "POST" | "DELETE", body: unknown): Promise<T> {
    const token = await this.getAccessToken()
    const res = await fetch("/api/admin-users", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        (payload as { error?: string }).error ||
          `Admin request failed (HTTP ${res.status}). Create the account in the Supabase dashboard instead.`,
      )
    }
    return payload as T
  }

  // ==========================================
  // LOCAL INDEXEDDB (fallback only)
  // ==========================================

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
   * Seed the local database with the password-less local admin, and strip any
   * credentials stored by older versions of this app.
   */
  private async ensureSeedData(): Promise<void> {
    try {
      const users = await this.getAllRecords<SignageUser & { password?: string; pinCode?: string }>(
        STORES.USERS,
      )
      if (users.length === 0) {
        await this.putRecord(STORES.USERS, LOCAL_ADMIN)
        return
      }
      for (const u of users) {
        if (u.username === "admin" || "password" in u || "pinCode" in u) {
          await this.deleteRecord(STORES.USERS, u.id)
          if (u.username !== "admin") {
            const { password: _p, pinCode: _c, ...clean } = u
            await this.putRecord(STORES.USERS, clean)
          }
        }
      }
      if (!users.some((u) => u.id === LOCAL_ADMIN.id)) {
        await this.putRecord(STORES.USERS, LOCAL_ADMIN)
      }
    } catch (err) {
      console.warn("UserDatabase seeding fallback:", err)
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

  private localStorageKey(storeName: string): string {
    return storeName === STORES.USERS
      ? LS_KEYS.USERS_BACKUP
      : storeName === STORES.LOGS
        ? LS_KEYS.LOGS_BACKUP
        : LS_KEYS.UPLOADS_BACKUP
  }

  private getFromLocalStorage<T>(storeName: string): T[] {
    if (typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(this.localStorageKey(storeName))
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  private putToLocalStorage<T>(storeName: string, record: T): void {
    if (typeof window === "undefined") return
    const list = this.getFromLocalStorage<T & { id: string }>(storeName)
    const rec = record as T & { id: string }
    const idx = list.findIndex((item) => item.id === rec.id)
    if (idx >= 0) {
      list[idx] = rec
    } else {
      list.push(rec)
    }
    localStorage.setItem(this.localStorageKey(storeName), JSON.stringify(list))
  }

  private deleteFromLocalStorage(storeName: string, id: string): void {
    if (typeof window === "undefined") return
    const list = this.getFromLocalStorage<{ id: string }>(storeName)
    const filtered = list.filter((item) => item.id !== id)
    localStorage.setItem(this.localStorageKey(storeName), JSON.stringify(filtered))
  }

  // ==========================================
  // ACTIVE USER
  // ==========================================

  /** The user that actions are attributed to: the session user, or null when signed out. */
  public async getActiveUser(): Promise<SignageUser | null> {
    if (supabase) return this.sessionUser
    if (this.sessionUser) return this.sessionUser
    const users = await this.getUsers()
    return users.find((u) => u.id === this.activeUserId) || users[0] || null
  }

  // ==========================================
  // USERS MANAGEMENT
  // ==========================================

  public async getUsers(): Promise<SignageUser[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name", { ascending: true })
      if (error) throw new Error(`Could not load users: ${error.message}`)
      return (data as ProfileRow[]).map(profileToUser)
    }

    const list = await this.getAllRecords<SignageUser>(STORES.USERS)
    if (!list || list.length === 0) return [LOCAL_ADMIN]
    return list.sort((a, b) => a.fullName.localeCompare(b.fullName))
  }

  public async getUser(id: string): Promise<SignageUser | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle()
      if (error || !data) return null
      const user = profileToUser(data as ProfileRow)
      if (this.sessionUser?.id === id) this.sessionUser = user
      return user
    }
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

  public async createUser(data: {
    fullName: string
    username: string
    email: string
    role: UserRole
    permissions?: UserPermission[]
    password?: string
    department?: string
    notes?: string
    avatarColor?: string
  }): Promise<SignageUser> {
    const assignedPermissions =
      data.permissions && data.permissions.length > 0
        ? data.permissions
        : this.getDefaultPermissionsForRole(data.role)

    let newUser: SignageUser

    if (supabase) {
      const password = data.password?.trim() || ""
      if (password.length < 8) {
        throw new Error("Set an initial password of at least 8 characters.")
      }
      const result = await this.callAdminApi<{ profile: ProfileRow }>("POST", {
        email: data.email.trim().toLowerCase(),
        password,
        fullName: data.fullName.trim(),
        username: data.username.trim().toLowerCase(),
        role: data.role,
        permissions: assignedPermissions,
        department: data.department || "Department of Computer Science",
        avatarColor: data.avatarColor || this.getRandomColor(),
        notes: data.notes?.trim() || null,
      })
      newUser = profileToUser(result.profile)
    } else {
      newUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        username: data.username.trim().toLowerCase(),
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        role: data.role,
        permissions: assignedPermissions,
        department: data.department || "Department of Computer Science",
        avatarColor: data.avatarColor || this.getRandomColor(),
        status: "active",
        createdAt: Date.now(),
        notes: data.notes?.trim(),
      }
      await this.putRecord(STORES.USERS, newUser)
    }

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
    let updatedUser: SignageUser

    if (supabase) {
      const patch: Partial<ProfileRow> = {}
      if (updates.fullName !== undefined) patch.full_name = updates.fullName
      if (updates.username !== undefined) patch.username = updates.username
      if (updates.role !== undefined) patch.role = updates.role
      if (updates.permissions !== undefined) patch.permissions = updates.permissions
      if (updates.avatarColor !== undefined) patch.avatar_color = updates.avatarColor
      if (updates.department !== undefined) patch.department = updates.department
      if (updates.status !== undefined) patch.status = updates.status
      if (updates.notes !== undefined) patch.notes = updates.notes

      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle()
      if (error) throw new Error(`Could not update user: ${error.message}`)
      if (!data) throw new Error("You don't have permission to update this user.")
      updatedUser = profileToUser(data as ProfileRow)
      if (this.sessionUser?.id === id) this.setSessionUser(updatedUser)
    } else {
      const user = await this.getUser(id)
      if (!user) throw new Error(`User ${id} not found`)
      updatedUser = { ...user, ...updates }
      await this.putRecord(STORES.USERS, updatedUser)
    }

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

    const currentId = this.sessionUser?.id ?? this.activeUserId
    if (user.id === currentId) {
      throw new Error("Cannot delete the currently active user account.")
    }

    if (supabase) {
      await this.callAdminApi<{ ok: true }>("DELETE", { id })
    } else {
      await this.deleteRecord(STORES.USERS, id)
    }

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
    let all: ActionLog[]
    if (supabase) {
      if (!this.sessionUser) return []
      const { data, error } = await supabase
        .from("action_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(filters?.limit && filters.limit > 0 ? filters.limit : REMOTE_LIST_LIMIT)
      if (error) throw new Error(`Could not load action logs: ${error.message}`)
      all = (data as ActionLogRow[]).map(rowToLog)
    } else {
      all = await this.getAllRecords<ActionLog>(STORES.LOGS)
    }
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

  /**
   * Records an audit entry. In Supabase mode this is skipped (returns null) when no staff
   * member is signed in, e.g. on anonymous TV displays.
   */
  public async logAction(entry: {
    actionType: string
    category: ActionLogCategory
    summary: string
    details?: Record<string, unknown> | string
    severity?: ActionLogSeverity
    ipOrDevice?: string
    customUser?: SignageUser
  }): Promise<ActionLog | null> {
    const user = entry.customUser || (await this.getActiveUser())
    if (!user) return null

    const log: ActionLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      userId: user.id,
      userName: user.fullName,
      userRole: user.role ?? "Pending",
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

    if (supabase) {
      if (!this.sessionUser) return null
      const { data, error } = await supabase
        .from("action_logs")
        .insert({
          user_id: this.sessionUser.id,
          user_name: log.userName,
          user_role: log.userRole,
          action_type: log.actionType,
          category: log.category,
          summary: log.summary,
          details: log.details ?? null,
          ip_or_device: log.ipOrDevice ?? null,
          severity: log.severity,
        })
        .select("*")
        .single()
      if (error) {
        console.warn("Could not write action log:", error.message)
        return null
      }
      this.broadcastChange()
      return rowToLog(data as ActionLogRow)
    }

    await this.putRecord(STORES.LOGS, log)
    this.broadcastChange()
    return log
  }

  public async clearLogs(): Promise<void> {
    if (supabase) {
      const { error } = await supabase
        .from("action_logs")
        .delete()
        .not("id", "is", null)
      if (error) throw new Error(`Could not clear logs: ${error.message}`)
    } else {
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
    let all: UploadRecord[]
    if (supabase) {
      if (!this.sessionUser) return []
      const { data, error } = await supabase
        .from("uploads")
        .select("*")
        .neq("status", "deleted")
        .order("uploaded_at", { ascending: false })
        .limit(REMOTE_LIST_LIMIT)
      if (error) throw new Error(`Could not load uploads: ${error.message}`)
      all = (data as UploadRow[]).map(rowToUpload)
    } else {
      all = await this.getAllRecords<UploadRecord>(STORES.UPLOADS)
    }
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
    if (!user) throw new Error("Sign in to upload media.")
    const detectedType =
      data.mediaType ||
      (data.fileType.startsWith("video/")
        ? "video"
        : data.fileType.startsWith("image/")
          ? "image"
          : data.fileName.endsWith(".ics")
            ? "ics"
            : "document")

    let record: UploadRecord = {
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

    if (supabase) {
      if (!this.sessionUser) throw new Error("Your session has expired. Please sign in again.")
      const { data: row, error } = await supabase
        .from("uploads")
        .insert({
          user_id: this.sessionUser.id,
          user_name: record.userName,
          file_name: record.fileName,
          file_size: record.fileSize,
          formatted_size: record.formattedSize,
          file_type: record.fileType,
          media_type: record.mediaType,
          storage_path: record.storageKey ?? null,
          public_url: record.previewUrl ?? null,
          associated_slide_id: record.associatedSlideId ?? null,
          associated_event_id: record.associatedEventId ?? null,
          status: record.status,
          tags: record.tags,
        })
        .select("*")
        .single()
      if (error) throw new Error(`Could not record upload: ${error.message}`)
      record = rowToUpload(row as UploadRow)
    } else {
      await this.putRecord(STORES.UPLOADS, record)
    }

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

  /** Mark the upload behind a removed slide as deleted (its Storage object is already gone). */
  public async markSlideUploadDeleted(slideId: string): Promise<void> {
    if (!supabase || !this.sessionUser) return
    const { error } = await supabase
      .from("uploads")
      .update({ status: "deleted" })
      .eq("associated_slide_id", slideId)
    if (error) console.warn("Could not update upload record:", error.message)
    this.broadcastChange()
  }

  /** Delete an upload record and, in Supabase mode, its object in Storage. */
  public async deleteUpload(id: string): Promise<boolean> {
    const uploads = await this.getUploads()
    const target = uploads.find((u) => u.id === id)
    if (!target) return false

    if (supabase) {
      if (target.storageKey) {
        const { error: storageError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .remove([target.storageKey])
        if (storageError) {
          throw new Error(`Could not delete file from storage: ${storageError.message}`)
        }
      }
      const { error } = await supabase.from("uploads").delete().eq("id", id)
      if (error) throw new Error(`Could not delete upload record: ${error.message}`)
    } else {
      await this.deleteRecord(STORES.UPLOADS, id)
    }

    await this.logAction({
      actionType: "MEDIA_DELETED",
      category: "media",
      summary: `Removed upload "${target.fileName}"`,
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

  /** Wipes the local fallback database. No-op in Supabase mode. */
  public async resetDatabaseToDefaults(): Promise<void> {
    if (supabase) return

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
