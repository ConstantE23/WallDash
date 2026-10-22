/**
 * Database Connection & Backend Service
 * Hampton University Computer Science Digital Signage
 *
 * Reads and writes the shared signage state in Supabase (`public.signage_state`, single
 * row id = 1). Configuration comes from build-time env vars (see vite.config.ts); when
 * they're missing the app runs in "local_fallback" mode on IndexedDB/localStorage only.
 */

import type { SignageState } from "../types/signage"
import { supabase, SUPABASE_URL } from "./supabaseClient"

export type DatabaseConnectionType = "supabase" | "indexeddb"
export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "local_fallback"

export interface DatabaseConnectionConfig {
  type: DatabaseConnectionType
  url: string
  autoSync: boolean
}

const SIGNAGE_STATE_ROW_ID = 1

class DatabaseConnectionService {
  private static instance: DatabaseConnectionService | null = null
  private config: DatabaseConnectionConfig
  private status: ConnectionStatus = "disconnected"
  private lastTestedAt: number | null = null
  private lastError: string | null = null
  private listeners: Set<(status: ConnectionStatus) => void> = new Set()

  private constructor() {
    this.config = supabase
      ? { type: "supabase", url: SUPABASE_URL, autoSync: true }
      : { type: "indexeddb", url: "", autoSync: false }
    this.checkInitialConnection()
  }

  public static getInstance(): DatabaseConnectionService {
    if (!DatabaseConnectionService.instance) {
      DatabaseConnectionService.instance = new DatabaseConnectionService()
    }
    return DatabaseConnectionService.instance
  }

  public getConfig(): DatabaseConnectionConfig {
    return { ...this.config }
  }

  public isRemote(): boolean {
    return supabase !== null
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
    if (this.status === newStatus) return
    this.status = newStatus
    this.listeners.forEach((cb) => {
      try {
        cb(newStatus)
      } catch (err) {
        console.error("Status listener error:", err)
      }
    })
  }

  /** Record the outcome of a real request so the status badge reflects reality. */
  private markResult(error: string | null) {
    this.lastTestedAt = Date.now()
    this.lastError = error
    this.notifyStatus(error ? "disconnected" : "connected")
  }

  /**
   * Performs a live health check by reading the signage_state row.
   */
  public async testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    if (!supabase) {
      this.notifyStatus("local_fallback")
      return {
        success: false,
        message:
          "Supabase is not configured for this build. Running on this browser's local storage only.",
      }
    }

    this.notifyStatus("connecting")
    const startTime = performance.now()
    const { error } = await supabase
      .from("signage_state")
      .select("id")
      .eq("id", SIGNAGE_STATE_ROW_ID)
      .maybeSingle()
    const latencyMs = Math.round(performance.now() - startTime)

    if (error) {
      this.markResult(error.message)
      return { success: false, message: `Supabase connection failed: ${error.message}` }
    }
    this.markResult(null)
    return {
      success: true,
      message: `Connected to Supabase (${latencyMs}ms response).`,
      latencyMs,
    }
  }

  private async checkInitialConnection() {
    if (supabase) {
      await this.testConnection()
    } else {
      this.notifyStatus("local_fallback")
    }
  }

  /**
   * Fetches the shared signage state. Returns null if Supabase isn't configured,
   * the row doesn't exist yet, or the request fails.
   */
  public async fetchSignageState(): Promise<SignageState | null> {
    if (!supabase) return null

    const { data, error } = await supabase
      .from("signage_state")
      .select("state")
      .eq("id", SIGNAGE_STATE_ROW_ID)
      .maybeSingle()

    if (error) {
      console.warn("Could not fetch signage state from Supabase:", error.message)
      this.markResult(error.message)
      return null
    }
    this.markResult(null)
    return (data?.state as SignageState | undefined) ?? null
  }

  /**
   * Saves the shared signage state. Only signed-in staff pass RLS; callers should not
   * attempt this from anonymous TV displays.
   */
  public async saveSignageState(state: SignageState): Promise<{ ok: boolean; error?: string }> {
    if (!supabase) return { ok: false, error: "Supabase is not configured." }

    const { error } = await supabase
      .from("signage_state")
      .upsert({ id: SIGNAGE_STATE_ROW_ID, state })

    if (error) {
      console.warn("Could not persist signage state to Supabase:", error.message)
      this.markResult(error.message)
      return { ok: false, error: error.message }
    }
    this.markResult(null)
    return { ok: true }
  }
}

export function getDatabaseConnection(): DatabaseConnectionService {
  return DatabaseConnectionService.getInstance()
}
