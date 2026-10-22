import React, { useState } from "react"
import { Tv } from "lucide-react"
import { getUserDatabase, LOCAL_MODE_AVAILABLE } from "../services/userDatabase"
import { isSupabaseConfigured } from "../services/supabaseClient"
import type { SignageUser } from "../types/signage"
import { ui } from "./manageStyles"

interface ManageLoginPageProps {
  onLoginSuccess: (user: SignageUser) => void
  onNavigateToTv: () => void
  /** Shown above the form, e.g. after a session expires. */
  notice?: string | null
}

export default function ManageLoginPage({
  onLoginSuccess,
  onNavigateToTv,
  notice,
}: ManageLoginPageProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const db = getUserDatabase()
  const supabaseReady = isSupabaseConfigured()

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setErrorMsg("Please enter both your email and password.")
      return
    }

    setIsLoading(true)
    setErrorMsg(null)

    try {
      const authenticated = await db.signIn(email, password)
      setPassword("")
      onLoginSuccess(authenticated)
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "An error occurred during authentication. Please retry.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleLocalLogin = async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      onLoginSuccess(await db.signInLocal())
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not start local mode.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-screen flex flex-col bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="flex h-14 flex-shrink-0 items-center justify-end border-b border-slate-200 bg-white px-4 sm:px-6">
        <button type="button" onClick={onNavigateToTv} className={ui.btnSecondary}>
          <Tv className="w-4 h-4" />
          <span className="hidden sm:inline">TV display</span>
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-semibold">Sign in to manage the TV screens</h1>
            <p className="mt-1 text-sm text-slate-500">
              Use your staff email and password.
            </p>
          </div>

          <div className={`${ui.card} p-5 space-y-4`}>
            {notice && !errorMsg && (
              <div className={ui.noticeWarn} role="status">
                {notice}
              </div>
            )}

            {!supabaseReady && !LOCAL_MODE_AVAILABLE && (
              <div className={ui.noticeError} role="alert">
                Sign-in is unavailable: Supabase is not configured for this deployment.
              </div>
            )}

            {errorMsg && (
              <div className={ui.noticeError} role="alert">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className={ui.label} htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className={ui.input}
                />
              </div>

              <div>
                <label className={ui.label} htmlFor="login-password">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className={ui.input}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !supabaseReady}
                className={`${ui.btnPrimary} w-full`}
              >
                {isLoading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* Local dev fallback (only when Supabase isn't configured in a dev build) */}
            {LOCAL_MODE_AVAILABLE && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className={ui.hint}>
                  Supabase isn't configured, so this dev build stores data in this browser only.
                </p>
                <button
                  type="button"
                  onClick={handleLocalLogin}
                  disabled={isLoading}
                  className={`${ui.btnSecondary} w-full`}
                >
                  Continue as local administrator
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-slate-500">
            Need an account? Ask a signage administrator.
          </p>
        </div>
      </main>

      <footer className="p-4 text-center text-xs text-slate-400">
        Hampton University Department of Computer Science
      </footer>
    </div>
  )
}
