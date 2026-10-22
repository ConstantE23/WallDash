/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (mapped in vite.config.ts from VITE_/NEXT_PUBLIC_/plain SUPABASE_URL). */
  readonly VITE_SUPABASE_URL: string
  /** Supabase anon / publishable key. Safe to expose; RLS protects the data. */
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
