/**
 * Single shared Supabase client for the browser.
 *
 * Only the project URL and the anon/publishable key are available here (see vite.config.ts).
 * When either is missing (e.g. local dev without env vars) the client is `null` and the app
 * falls back to the original IndexedDB/localStorage behaviour.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ""
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ""

/** Public Storage bucket holding uploaded slide photos and videos. */
export const MEDIA_BUCKET = "signage-media"

/** Hard upload limit, matching the bucket's file_size_limit (Supabase Free max). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

export function isSupabaseConfigured(): boolean {
  return supabase !== null
}

export default supabase
