import React, { useState } from "react"
import {
  Lock,
  Mail,
  KeyRound,
  Tv,
  ArrowRight,
  AlertCircle,
  GraduationCap,
  Sparkles,
} from "lucide-react"
import { getUserDatabase, LOCAL_MODE_AVAILABLE } from "../services/userDatabase"
import { isSupabaseConfigured } from "../services/supabaseClient"
import type { SignageUser } from "../types/signage"

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
    <div className="min-h-screen w-screen bg-[#070e1e] flex flex-col justify-between select-none font-sans text-white relative overflow-y-auto">
      {/* Background Accent Gradients */}
      <div className="absolute inset-0 bg-radial from-[#02275A]/40 via-transparent to-transparent pointer-events-none" />

      {/* Top University Banner */}
      <header className="flex-shrink-0 bg-[#02275A] border-b border-[#02275A]/60 px-6 py-4 flex items-center justify-between shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-black text-sm sm:text-base uppercase tracking-wider">
              Hampton University
            </h1>
            <p className="text-sky-200/90 text-xs font-semibold">
              Department of Computer Science · Signage Administration
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToTv}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all border border-white/20 cursor-pointer shadow-sm"
        >
          <Tv className="w-4 h-4 text-emerald-400" />
          <span>Public TV Display</span>
        </button>
      </header>

      {/* Central Login Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10">
        <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl space-y-6">
          <div className="text-center space-y-1.5">
            <div className="w-14 h-14 rounded-2xl bg-[#02275A] text-white flex items-center justify-center mx-auto shadow-xl border border-sky-400/20 mb-3">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              Staff Portal Login
            </h2>
            <p className="text-xs text-slate-400">
              Sign in with authorized faculty or staff credentials to manage lab schedules, events, and TV slides.
            </p>
          </div>

          {notice && !errorMsg && (
            <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {!supabaseReady && !LOCAL_MODE_AVAILABLE && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>
                Sign-in is unavailable: Supabase is not configured for this deployment.
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. jdoe@hamptonu.edu"
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm text-white placeholder-slate-500 transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your account password"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm text-white placeholder-slate-500 transition-all font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !supabaseReady}
              className="w-full py-3 px-4 rounded-xl bg-[#02275A] hover:bg-[#03367d] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-[#02275A]/30 transition-all cursor-pointer active:scale-[0.98] border border-sky-400/30 disabled:opacity-50"
            >
              {isLoading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In to Controller</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Local dev fallback (only when Supabase isn't configured in a dev build) */}
          {LOCAL_MODE_AVAILABLE && (
            <div className="border-t border-slate-800/80 pt-5 space-y-3">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Supabase not configured · Local dev mode</span>
              </span>
              <button
                onClick={handleLocalLogin}
                disabled={isLoading}
                className="w-full p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between text-left transition-all cursor-pointer group disabled:opacity-50"
              >
                <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors">
                  Continue as local administrator (this browser only)
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-500 flex-shrink-0">
        Hampton University Department of Computer Science · Wigwam Hall
      </footer>
    </div>
  )
}
