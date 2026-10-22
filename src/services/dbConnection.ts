/**
 * Database Connection & Backend Service
 * Hampton University Computer Science Digital Signage
 * 
 * Manages live database connections to PostgreSQL, Supabase, or REST backends.
 * Replaces static/pre-defined mock implementations with dynamic database operations.
 */

import type {
  SignageState,
  SignageUser,
  ActionLog,
  UploadRecord,
  LabInfo,
  EventAnnouncement,
  SlideItem,
  UrgentAlert,
} from "../types/signage"

export type DatabaseConnectionType = "rest" | "supabase" | "postgres_api" | "indexeddb"
export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "local_fallback"

export interface DatabaseConnectionConfig {
  type: DatabaseConnectionType
  url: string
  apiKey?: string
  authToken?: string
  databaseName?: string
  autoSync: boolean
}

const STORAGE_KEY_DB_CONFIG = "hampton_db_connection_config_v1"

// Default initial config based on environment variables or dynamic local endpoint
const DEFAULT_CONFIG: DatabaseConnectionConfig = {
  type: (import.meta.env.VITE_DB_TYPE as DatabaseConnectionType) || "rest",
  url:
    import.meta.env.VITE_DATABASE_URL ||
    import.meta.env.VITE_API_URL ||
    "",
  apiKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  autoSync: true,
}

class DatabaseConnectionService {
  private static instance: DatabaseConnectionService | null = null
  private config: DatabaseConnectionConfig
  private status: ConnectionStatus = "disconnected"
  private lastTestedAt: number | null = null
  private lastError: string | null = null
  private listeners: Set<(status: ConnectionStatus) => void> = new Set()

  private constructor() {
    this.config = this.loadConfig()
    this.checkInitialConnection()
  }

  public static getInstance(): DatabaseConnectionService {
    if (!DatabaseConnectionService.instance) {
      DatabaseConnectionService.instance = new DatabaseConnectionService()
    }
    return DatabaseConnectionService.instance
  }

  private loadConfig(): DatabaseConnectionConfig {
    if (typeof window === "undefined") return DEFAULT_CONFIG
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DB_CONFIG)
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
      }
    } catch (err) {
      console.warn("Could not load database connection config from storage:", err)
    }
    return DEFAULT_CONFIG
  }

  public getConfig(): DatabaseConnectionConfig {
    return { ...this.config }
  }

  public setConfig(newConfig: Partial<DatabaseConnectionConfig>): void {
    this.config = { ...this.config, ...newConfig }
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_DB_CONFIG, JSON.stringify(this.config))
      } catch (err) {
        console.error("Failed to save DB config:", err)
      }
    }
    this.testConnection()
  }

  public getStatus(): ConnectionStatus {
    return this.status
  }

  public getLastError(): string | null {
    return this.lastError
  }

  public getLastTestedAt(): number | null {
    return this.lastTestedAt
  }

  public subscribeStatus(cb: (status: ConnectionStatus) => void): () => void {
    this.listeners.add(cb)
    cb(this.status)
    return () => this.listeners.delete(cb)
  }

  private notifyStatus(newStatus: ConnectionStatus) {
    this.status = newStatus
    this.listeners.forEach((cb) => {
      try {
        cb(newStatus)
      } catch (err) {
        console.error("Status listener error:", err)
      }
    })
  }

  /**
   * Performs a live health check against the configured database endpoint.
   */
  public async testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    this.notifyStatus("connecting")
    this.lastTestedAt = Date.now()
    const startTime = performance.now()

    if (!this.config.url) {
      this.lastError = "No Database URL configured."
      this.notifyStatus("disconnected")
      return {
        success: false,
        message: "No Database URL configured. Enter a PostgreSQL / Supabase / REST URL.",
      }
    }

    try {
      // Test the endpoint via standard health/ping or root check
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (this.config.apiKey) {
        headers["apikey"] = this.config.apiKey
        headers["Authorization"] = `Bearer ${this.config.apiKey}`
      }
      if (this.config.authToken) {
        headers["Authorization"] = `Bearer ${this.config.authToken}`
      }

      const pingUrl = this.config.url.replace(/\/+$/, "") + "/health"
      const res = await fetch(pingUrl, {
        method: "GET",
        headers,
      }).catch(async () => {
        // Fallback: ping root URL with HEAD/GET
        return fetch(this.config.url, { method: "HEAD", headers })
      })

      const latencyMs = Math.round(performance.now() - startTime)

      if (res.ok || res.status === 401 || res.status === 404 || res.status === 405) {
        // Server exists and responded
        this.lastError = null
        this.notifyStatus("connected")
        return {
          success: true,
          message: `Connected to database endpoint (${latencyMs}ms response).`,
          latencyMs,
        }
      } else {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.lastError = msg
      this.notifyStatus("disconnected")
      return {
        success: false,
        message: `Database connection failed: ${msg}`,
      }
    }
  }

  private async checkInitialConnection() {
    if (this.config.url) {
      await this.testConnection()
    } else {
      this.notifyStatus("disconnected")
    }
  }

  // ==========================================================================
  // DYNAMIC CRUD OPERATIONS (ROUTED TO DATABASE CONNECTION)
  // ==========================================================================

  /**
   * Fetches live Signage State (Labs, Events, Slides, Alerts) from the database connection.
   */
  public async fetchSignageState(): Promise<Partial<SignageState> | null> {
    if (!this.config.url) return null

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/signage/state`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        return data as Partial<SignageState>
      }
    } catch (err) {
      console.warn("Could not fetch signage state from remote DB:", err)
    }
    return null
  }

  /**
   * Saves updated Signage State to the database connection.
   */
  public async saveSignageState(state: Partial<SignageState>): Promise<boolean> {
    if (!this.config.url) return false

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/signage/state`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify(state),
      })
      return res.ok
    } catch (err) {
      console.warn("Could not persist state to remote DB:", err)
      return false
    }
  }

  /**
   * Fetches users from the database connection.
   */
  public async fetchUsers(): Promise<SignageUser[] | null> {
    if (!this.config.url) return null

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/users`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, { headers })
      if (res.ok) {
        return (await res.json()) as SignageUser[]
      }
    } catch (err) {
      console.warn("Could not fetch users from remote DB:", err)
    }
    return null
  }

  /**
   * Creates or updates a user in the database connection.
   */
  public async saveUser(user: SignageUser): Promise<boolean> {
    if (!this.config.url) return false

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/users`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(user),
      })
      return res.ok
    } catch (err) {
      console.warn("Could not save user to remote DB:", err)
      return false
    }
  }

  /**
   * Deletes a user in the database connection.
   */
  public async deleteUser(userId: string): Promise<boolean> {
    if (!this.config.url) return false

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/users/${encodeURIComponent(userId)}`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, { method: "DELETE", headers })
      return res.ok
    } catch (err) {
      console.warn("Could not delete user from remote DB:", err)
      return false
    }
  }

  /**
   * Fetches action audit logs from the database connection.
   */
  public async fetchActionLogs(): Promise<ActionLog[] | null> {
    if (!this.config.url) return null

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/logs`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, { headers })
      if (res.ok) {
        return (await res.json()) as ActionLog[]
      }
    } catch (err) {
      console.warn("Could not fetch logs from remote DB:", err)
    }
    return null
  }

  /**
   * Inserts an audit log entry into the database connection.
   */
  public async insertActionLog(log: ActionLog): Promise<boolean> {
    if (!this.config.url) return false

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/logs`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(log),
      })
      return res.ok
    } catch (err) {
      console.warn("Could not insert log into remote DB:", err)
      return false
    }
  }

  /**
   * Fetches upload records from the database connection.
   */
  public async fetchUploads(): Promise<UploadRecord[] | null> {
    if (!this.config.url) return null

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/uploads`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, { headers })
      if (res.ok) {
        return (await res.json()) as UploadRecord[]
      }
    } catch (err) {
      console.warn("Could not fetch uploads from remote DB:", err)
    }
    return null
  }

  /**
   * Records an upload in the database connection.
   */
  public async insertUpload(upload: UploadRecord): Promise<boolean> {
    if (!this.config.url) return false

    try {
      const url = `${this.config.url.replace(/\/+$/, "")}/api/uploads`
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (this.config.apiKey) headers["apikey"] = this.config.apiKey

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(upload),
      })
      return res.ok
    } catch (err) {
      console.warn("Could not record upload in remote DB:", err)
      return false
    }
  }
}

export function getDatabaseConnection(): DatabaseConnectionService {
  return DatabaseConnectionService.getInstance()
}
