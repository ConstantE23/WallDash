import React, { useState, useEffect } from "react"
import {
  Lock,
  User,
  KeyRound,
  ShieldCheck,
  Tv,
  ArrowRight,
  AlertCircle,
  GraduationCap,
  Sparkles,
  Users,
} from "lucide-react"
import {
  getUserDatabase,
  INITIAL_USERS,
} from "../services/userDatabase"
import type { SignageUser } from "../types/signage"

interface ManageLoginPageProps {
  onLoginSuccess: (user: SignageUser) => void
  onNavigateToTv: () => void
}

export default function ManageLoginPage({
  onLoginSuccess,
  onNavigateToTv,
}: ManageLoginPageProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<SignageUser[]>(INITIAL_USERS)

  const db = getUserDatabase()

  useEffect(() => {
    db.getUsers().then((users) => {
      if (users && users.length > 0) {
        setAvailableUsers(users)
      }
    })
  }, [db])

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setErrorMsg("Please enter both username and password or PIN.")
      return
    }

    setIsLoading(true)
    setErrorMsg(null)

    try {
      const authenticated = await db.verifyCredentials(username, password)
      if (authenticated) {
        await db.setActiveUser(authenticated.id)
        if (typeof window !== "undefined") {
          sessionStorage.setItem("hampton_auth_user_id", authenticated.id)
        }
        onLoginSuccess(authenticated)
      } else {
        setErrorMsg("Invalid username or password. Check credentials or select a profile below.")
      }
    } catch (err) {
      setErrorMsg("An error occurred during authentication. Please retry.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickLogin = async (user: SignageUser) => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      await db.setActiveUser(user.id)
      if (typeof window !== "undefined") {
        sessionStorage.setItem("hampton_auth_user_id", user.id)
      }
      onLoginSuccess(user)
    } catch {
      setErrorMsg("Could not authenticate selected profile.")
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

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Username or Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin"
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm text-white placeholder-slate-500 transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Password or Staff PIN
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="e.g. admin123 or PIN 0000"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm text-white placeholder-slate-500 transition-all font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
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

          {/* Quick Demo Staff Logins */}
          <div className="border-t border-slate-800/80 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Quick Login as Staff Profile:</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">1-Click Access</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {availableUsers.slice(0, 4).map((u) => {
                const isAdmin = db.isAdmin(u)
                return (
                  <button
                    key={u.id}
                    onClick={() => handleQuickLogin(u)}
                    className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black text-white flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: u.avatarColor || "#02275A" }}
                      >
                        {u.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate group-hover:text-sky-300 transition-colors">
                            {u.fullName}
                          </span>
                          {isAdmin && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Admin
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 block truncate font-mono">
                          {u.role} · @{u.username}
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-500 flex-shrink-0">
        Hampton University Department of Computer Science · Wigwam Hall
      </footer>
    </div>
  )
}
