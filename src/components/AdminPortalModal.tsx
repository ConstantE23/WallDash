import React, { useState, useEffect } from "react"
import {
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
  FileText,
  UploadCloud,
  Check,
  X,
  Trash2,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Sparkles,
  Lock,
  Edit2,
  RefreshCw,
  Database,
  Server,
  ExternalLink,
  Copy,
  CheckCircle,
  Terminal,
  Plug,
} from "lucide-react"
import {
  getUserDatabase,
} from "../services/userDatabase"
import {
  getDatabaseConnection,
  type DatabaseConnectionConfig,
  type ConnectionStatus,
} from "../services/dbConnection"
import schemaSql from "../../supabase/migrations/0001_init.sql?raw"
import type {
  SignageUser,
  UserRole,
  UserPermission,
  ActionLog,
  UploadRecord,
  DatabaseStats,
  ActionLogCategory,
} from "../types/signage"
import { ALL_PERMISSIONS } from "../types/signage"
import { getSyncEngine } from "../services/syncEngine"

interface AdminPortalModalProps {
  currentUser: SignageUser
  isOpen: boolean
  onClose: () => void
  onUserChanged?: () => void
}

export default function AdminPortalModal({
  currentUser,
  isOpen,
  onClose,
  onUserChanged,
}: AdminPortalModalProps) {
  const [activeTab, setActiveTab] = useState<"users" | "logs" | "uploads" | "database">("users")
  const [users, setUsers] = useState<SignageUser[]>([])
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [stats, setStats] = useState<DatabaseStats | null>(null)

  // Database Connection State
  const dbConn = getDatabaseConnection()
  const dbConfig: DatabaseConnectionConfig = dbConn.getConfig()
  const [dbStatus, setDbStatus] = useState<ConnectionStatus>(() => dbConn.getStatus())
  const [isTestingDb, setIsTestingDb] = useState(false)
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null)
  const [copiedSql, setCopiedSql] = useState(false)

  // User creation form state
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [newFullName, setNewFullName] = useState("")
  const [newUsername, setNewUsername] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState<UserRole>("Faculty/Staff")
  const [newPassword, setNewPassword] = useState("")
  const [newPermissions, setNewPermissions] = useState<UserPermission[]>(() =>
    getUserDatabase().getDefaultPermissionsForRole("Faculty/Staff"),
  )
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  // Edit permissions state
  const [editingUser, setEditingUser] = useState<SignageUser | null>(null)
  const [editPermissions, setEditPermissions] = useState<UserPermission[]>([])
  const [editRole, setEditRole] = useState<UserRole | "">("")
  const [adminError, setAdminError] = useState<string | null>(null)

  // Logs filters
  const [logSearch, setLogSearch] = useState("")
  const [logCategory, setLogCategory] = useState<ActionLogCategory | "all">("all")

  // Uploads filter
  const [uploadSearch, setUploadSearch] = useState("")

  const db = getUserDatabase()

  const reloadData = async () => {
    try {
      const [uList, lList, upList, sData] = await Promise.all([
        db.getUsers(),
        db.getLogs({ search: logSearch, category: logCategory }),
        db.getUploads({ search: uploadSearch }),
        db.getStats(),
      ])
      setUsers(uList)
      setLogs(lList)
      setUploads(upList)
      setStats(sData)
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Could not load admin data.")
    }
  }

  useEffect(() => {
    if (isOpen) {
      reloadData()
      const unsub = db.subscribe(() => {
        reloadData()
      })
      const unsubDb = dbConn.subscribeStatus((st) => setDbStatus(st))
      return () => {
        unsub()
        unsubDb()
      }
    }
  }, [isOpen, logSearch, logCategory, uploadSearch, dbConn])

  const handleTestConnection = async () => {
    setIsTestingDb(true)
    setDbTestResult(null)
    const res = await dbConn.testConnection()
    setDbTestResult(res)
    setIsTestingDb(false)
  }

  const handleCopySql = () => {
    navigator.clipboard.writeText(schemaSql)
    setCopiedSql(true)
    setTimeout(() => setCopiedSql(false), 2500)
  }

  const handleDownloadSql = () => {
    const blob = new Blob([schemaSql], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "0001_init.sql"
    a.click()
    URL.revokeObjectURL(url)
  }

  // Update permissions checkboxes when role changes in create user form
  const handleRoleChange = (role: UserRole) => {
    setNewRole(role)
    setNewPermissions(db.getDefaultPermissionsForRole(role))
  }

  const toggleNewPermission = (p: UserPermission) => {
    setNewPermissions((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p],
    )
  }

  const toggleEditPermission = (p: UserPermission) => {
    setEditPermissions((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p],
    )
  }

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFullName.trim() || !newUsername.trim() || !newEmail.trim()) {
      setCreateError("Please fill in full name, username, and email.")
      return
    }
    if (newPassword.trim().length < 8) {
      setCreateError("Set an initial password of at least 8 characters.")
      return
    }

    try {
      setCreateError(null)
      await db.createUser({
        fullName: newFullName.trim(),
        username: newUsername.trim(),
        email: newEmail.trim(),
        role: newRole,
        permissions: newPermissions,
        password: newPassword.trim(),
      })

      setCreateSuccess(`Created user "${newFullName}" with ${newPermissions.length} permissions!`)
      setNewFullName("")
      setNewUsername("")
      setNewEmail("")
      setNewPassword("")
      setShowCreateUser(false)
      await reloadData()
      if (onUserChanged) onUserChanged()
      setTimeout(() => setCreateSuccess(null), 4000)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user.")
    }
  }

  const handleSavePermissions = async () => {
    if (!editingUser) return
    try {
      if (editRole && editRole !== editingUser.role) {
        await db.updateUser(editingUser.id, {
          role: editRole,
          permissions: editPermissions,
        })
      } else {
        await db.updatePermissions(editingUser.id, editPermissions)
      }
      setEditingUser(null)
      await reloadData()
      if (onUserChanged) onUserChanged()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update permissions.")
    }
  }

  const handleDeleteUser = async (user: SignageUser) => {
    if (user.id === currentUser.id) {
      alert("You cannot delete your own active user account.")
      return
    }
    if (confirm(`Are you sure you want to delete user "${user.fullName}"?`)) {
      try {
        await db.deleteUser(user.id)
        await reloadData()
        if (onUserChanged) onUserChanged()
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not delete user.")
      }
    }
  }

  const handleExportCsv = async () => {
    const csv = await db.exportLogsAsCsv()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `hampton_cs_signage_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearLogs = async () => {
    if (confirm("Are you sure you want to clear all action logs from the database?")) {
      try {
        await db.clearLogs()
        await reloadData()
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not clear logs.")
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[#0b1329] border border-slate-700/80 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-white animate-scale-up">
        {/* Top Modal Header */}
        <div className="flex-shrink-0 bg-[#02275A] border-b border-[#02275A]/60 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-wider uppercase">
                  Admin Portal & Security Ledger
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Authorized Admin
                </span>
              </div>
              <p className="text-xs text-sky-200/80">
                Logged in as <strong className="text-white">{currentUser.fullName}</strong> ({currentUser.role ?? "Pending approval"})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs & Overview Metrics */}
        <div className="flex-shrink-0 bg-slate-900/90 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("users")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "users"
                  ? "bg-[#02275A] text-white shadow-md border border-sky-400/30"
                  : "bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Users className="w-4 h-4 text-sky-400" />
              <span>User Accounts ({users.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("logs")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "logs"
                  ? "bg-[#02275A] text-white shadow-md border border-sky-400/30"
                  : "bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Action Audit Logs ({logs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("uploads")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "uploads"
                  ? "bg-[#02275A] text-white shadow-md border border-sky-400/30"
                  : "bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <UploadCloud className="w-4 h-4 text-emerald-400" />
              <span>Uploads ({uploads.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("database")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "database"
                  ? "bg-[#02275A] text-white shadow-md border border-sky-400/30"
                  : "bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Database className="w-4 h-4 text-purple-400" />
              <span>Database & SQL</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  dbStatus === "connected"
                    ? "bg-emerald-400"
                    : dbStatus === "connecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-slate-500"
                }`}
                title={`Status: ${dbStatus}`}
              />
            </button>
          </div>

          {stats && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 font-mono">
              <span>Storage: <strong className="text-white">{stats.storageFormatted}</strong></span>
              <span>·</span>
              <span>Media: <strong className="text-white">{stats.imagesCount} imgs / {stats.videosCount} vids</strong></span>
            </div>
          )}
        </div>

        {/* Alerts / Feedback Banner */}
        {createSuccess && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{createSuccess}</span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          {adminError && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{adminError}</span>
              </span>
              <button
                onClick={() => setAdminError(null)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 1: USERS & PERMISSIONS                                */}
          {/* ======================================================== */}
          {activeTab === "users" && (
            <div className="space-y-6">
              {/* Header Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Authorized Department Staff
                  </h3>
                  <p className="text-xs text-slate-400">
                    Manage users and configure specific granular permissions for digital signage control.
                  </p>
                </div>

                <button
                  onClick={() => setShowCreateUser(!showCreateUser)}
                  className="px-4 py-2 rounded-xl bg-[#02275A] hover:bg-[#03367d] text-white text-xs font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer border border-sky-400/30"
                >
                  <UserPlus className="w-4 h-4 text-amber-300" />
                  <span>{showCreateUser ? "Cancel User Creation" : "+ Create New User"}</span>
                </button>
              </div>

              {/* Create User Collapsible Form */}
              {showCreateUser && (
                <div className="p-5 rounded-2xl bg-slate-900 border border-sky-500/30 shadow-2xl space-y-5 animate-slide-down">
                  <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">
                        Create New User & Grant Specific Permissions
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-400">All changes logged to audit ledger</span>
                  </div>

                  {createError && (
                    <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span>{createError}</span>
                    </div>
                  )}

                  <form onSubmit={handleCreateUserSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          value={newFullName}
                          onChange={(e) => setNewFullName(e.target.value)}
                          placeholder="e.g. Dr. Jane Doe"
                          required
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                          Username *
                        </label>
                        <input
                          type="text"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="e.g. jdoe"
                          required
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] text-xs text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="e.g. jdoe@hamptonu.edu"
                          required
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                          Role Title *
                        </label>
                        <select
                          value={newRole}
                          onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] text-xs text-white"
                        >
                          <option value="Super Admin">Super Admin (Full Access)</option>
                          <option value="Department Chair">Department Chair</option>
                          <option value="Lab Coordinator">Lab Coordinator (Rooms 126/127)</option>
                          <option value="Faculty/Staff">Faculty / Staff</option>
                          <option value="Student Assistant">Student Assistant (ACM Lead)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                          Initial Password *
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          minLength={8}
                          required
                          autoComplete="new-password"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] text-xs text-white font-mono"
                        />
                      </div>
                    </div>

                    {/* Specific Permissions Checkbox Grid */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Specific Granted Permissions ({newPermissions.length} selected):</span>
                        </label>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setNewPermissions(ALL_PERMISSIONS.map((p) => p.id))}
                            className="text-[10px] text-sky-400 hover:underline cursor-pointer"
                          >
                            Select All
                          </button>
                          <span className="text-slate-600">·</span>
                          <button
                            type="button"
                            onClick={() => setNewPermissions(db.getDefaultPermissionsForRole(newRole))}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer"
                          >
                            Reset to Role Defaults
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {ALL_PERMISSIONS.map((perm) => {
                          const isChecked = newPermissions.includes(perm.id)
                          return (
                            <label
                              key={perm.id}
                              onClick={() => toggleNewPermission(perm.id)}
                              className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all cursor-pointer ${
                                isChecked
                                  ? "bg-[#02275A]/40 border-sky-500/60 text-white"
                                  : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="mt-0.5 rounded text-sky-500 focus:ring-0"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-bold block text-white">
                                  {perm.label}
                                </span>
                                <span className="text-[10px] text-slate-400 block line-clamp-1">
                                  {perm.description}
                                </span>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowCreateUser(false)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg cursor-pointer"
                      >
                        Create User & Save Permissions
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* User List Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {users.map((u) => {
                  const isCurrent = u.id === currentUser.id
                  const isAdminUser = db.isAdmin(u)

                  return (
                    <div
                      key={u.id}
                      className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 shadow-xl space-y-3 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-md flex-shrink-0"
                            style={{ backgroundColor: u.avatarColor || "#02275A" }}
                          >
                            {u.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black text-white truncate">
                                {u.fullName}
                              </h4>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  You
                                </span>
                              )}
                              {isAdminUser && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Admin
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-sky-300 font-semibold block truncate">
                              {u.role ?? "Pending approval"} · @{u.username}
                            </span>
                            <span className="text-[10px] text-slate-500 block truncate font-mono">
                              {u.email}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditingUser(u)
                              setEditRole(u.role ?? "")
                              setEditPermissions([...(u.permissions || [])])
                            }}
                            title="Edit Permissions"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white transition-all cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {!isCurrent && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              title="Delete User"
                              className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-white transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Permissions Chips */}
                      <div className="pt-2 border-t border-slate-800/80">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                          Assigned Permissions ({u.permissions?.length || 0}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {u.permissions && u.permissions.length > 0 ? (
                            u.permissions.map((p) => {
                              const def = ALL_PERMISSIONS.find((item) => item.id === p)
                              return (
                                <span
                                  key={p}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#02275A]/60 border border-sky-500/30 text-sky-200"
                                >
                                  {def?.label || p}
                                </span>
                              )
                            })
                          ) : (
                            <span className="text-[10px] text-slate-600 italic">No permissions assigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: ACTION AUDIT LOGS                                  */}
          {/* ======================================================== */}
          {activeTab === "logs" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="Search audit actions by user or description..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>

                  <select
                    value={logCategory}
                    onChange={(e) => setLogCategory(e.target.value as any)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                  >
                    <option value="all">All Categories</option>
                    <option value="lab">Lab Operations</option>
                    <option value="event">Events</option>
                    <option value="media">Media & Uploads</option>
                    <option value="alert">Alerts</option>
                    <option value="user">User Admin</option>
                    <option value="auth">Authentication</option>
                    <option value="system">System</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCsv}
                    className="px-3 py-1.5 rounded-xl bg-[#02275A] hover:bg-[#03367d] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm border border-sky-400/30"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={handleClearLogs}
                    className="px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-red-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {/* Audit Table */}
              <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">User & Role</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {logs.map((log) => {
                      const dateStr = new Date(log.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                      const dayStr = new Date(log.timestamp).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })

                      const sevColor =
                        log.severity === "alert"
                          ? "text-red-400"
                          : log.severity === "warning"
                            ? "text-amber-400"
                            : log.severity === "success"
                              ? "text-emerald-400"
                              : "text-sky-300"

                      return (
                        <tr key={log.id} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap text-[11px]">
                            {dayStr} {dateStr}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-bold text-white block font-sans">{log.userName}</span>
                            <span className="text-[10px] text-slate-500">{log.userRole}</span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`font-bold ${sevColor}`}>{log.actionType}</span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-300">
                              {log.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-200">
                            {log.summary}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: UPLOADS REPOSITORY                                 */}
          {/* ======================================================== */}
          {activeTab === "uploads" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={uploadSearch}
                    onChange={(e) => setUploadSearch(e.target.value)}
                    placeholder="Search uploaded files..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div className="text-xs text-slate-400">
                  Total uploads in database: <strong className="text-white">{uploads.length}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {uploads.map((up) => (
                  <div
                    key={up.id}
                    className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 shadow-xl space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      {/* Thumbnail */}
                      <div className="w-full h-32 rounded-xl bg-black overflow-hidden flex items-center justify-center border border-slate-800 relative mb-2">
                        {up.mediaType === "video" ? (
                          <video
                            src={up.previewUrl}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                        ) : up.previewUrl ? (
                          <img
                            src={up.previewUrl}
                            alt={up.fileName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UploadCloud className="w-10 h-10 text-slate-600" />
                        )}
                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-black/80 text-white font-mono">
                          {up.mediaType}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-white truncate" title={up.fileName}>
                        {up.fileName}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {up.formattedSize} · Uploaded by {up.userName}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(up.uploadedAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              `Delete "${up.fileName}"? This removes the file from storage and from the TV rotation.`,
                            )
                          ) {
                            try {
                              const engine = getSyncEngine()
                              if (
                                up.associatedSlideId &&
                                engine.getState().slides.some((s) => s.id === up.associatedSlideId)
                              ) {
                                await engine.removeSlide(up.associatedSlideId)
                              }
                              await db.deleteUpload(up.id)
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "Could not delete upload.")
                            }
                            await reloadData()
                          }
                        }}
                        className="text-red-400 hover:text-red-300 text-xs p-1 rounded hover:bg-red-950/30 cursor-pointer"
                        title="Delete upload and file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: DATABASE CONNECTION & SQL SCHEMAS */}
          {activeTab === "database" && (
            <div className="space-y-6">
              {/* Connection Status Card */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#02275A] border border-sky-400/30 flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Database className="w-6 h-6 text-sky-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-black text-white">
                        Database Connection
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                          dbStatus === "connected"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : dbStatus === "connecting"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            dbStatus === "connected"
                              ? "bg-emerald-400"
                              : dbStatus === "connecting"
                                ? "bg-amber-400 animate-ping"
                                : "bg-slate-500"
                          }`}
                        />
                        {dbStatus === "connected"
                          ? "Connected"
                          : dbStatus === "connecting"
                            ? "Connecting..."
                            : dbStatus === "local_fallback"
                              ? "Local Fallback (This Browser Only)"
                              : "Disconnected"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {dbConfig.url ? (
                        <span className="font-mono text-sky-300 truncate block max-w-md">
                          Supabase: {dbConfig.url}
                        </span>
                      ) : (
                        "Supabase env vars are not set for this build, so data stays in this browser only."
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={isTestingDb}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingDb ? "animate-spin text-sky-400" : ""}`} />
                    <span>{isTestingDb ? "Testing..." : "Test Ping"}</span>
                  </button>
                  <button
                    onClick={handleDownloadSql}
                    className="px-4 py-2 rounded-xl bg-[#02275A] hover:bg-[#03367d] text-white text-xs font-bold flex items-center gap-2 border border-sky-400/30 shadow-md transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-300" />
                    <span>Download 0001_init.sql</span>
                  </button>
                </div>
              </div>

              {/* Test Result Feedback */}
              {dbTestResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 animate-fade-in ${
                    dbTestResult.success
                      ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
                      : "bg-amber-950/80 border-amber-500/40 text-amber-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {dbTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    )}
                    <span>{dbTestResult.message}</span>
                  </div>
                  {dbTestResult.latencyMs !== undefined && (
                    <span className="text-[11px] font-mono text-emerald-400 font-bold">
                      {dbTestResult.latencyMs}ms
                    </span>
                  )}
                </div>
              )}

              {/* Connection Configuration (read-only; set via Vercel env vars) */}
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Plug className="w-4 h-4 text-sky-400" />
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                      Database Connection Parameters
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {dbConfig.type === "supabase" ? "Supabase" : "Local Cache"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5 md:col-span-2">
                    <span className="font-bold text-slate-300 block">Project URL</span>
                    <span className="block w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono truncate">
                      {dbConfig.url || "Not configured"}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  The project URL and anon key are injected at build time from the Vercel
                  environment variables (see README). Server secrets such as the service role key
                  are only used by the <span className="font-mono">/api/admin-users</span> function
                  and are never sent to the browser.
                </p>
              </div>

              {/* Master SQL Schema Code Box */}
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                      Supabase Migration (0001_init.sql)
                    </h4>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopySql}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {copiedSql ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copy SQL</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDownloadSql}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Download .sql</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  Run this script once in Supabase → SQL Editor to create the tables, Row Level Security policies, realtime publication and the signage-media storage bucket. It is safe to re-run.
                </p>

                {/* SQL Code Viewport */}
                <div className="relative rounded-xl bg-slate-950 border border-slate-800/90 p-4 max-h-80 overflow-y-auto font-mono text-xs text-sky-200/90 leading-relaxed scrollbar-thin">
                  <pre className="whitespace-pre">{schemaSql}</pre>
                </div>

                {/* Schema Tables Quick Reference */}
                <div className="pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {[
                    { name: "signage_state", desc: "Labs, events, slides & alerts" },
                    { name: "profiles", desc: "Staff roles & permissions" },
                    { name: "uploads", desc: "Uploaded file ledger" },
                    { name: "action_logs", desc: "Audit action ledger" },
                    { name: "signage-media", desc: "Storage bucket (50 MB/file)" },
                  ].map((table) => (
                    <div
                      key={table.name}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px]"
                    >
                      <span className="font-mono font-bold text-sky-300 block truncate">
                        {table.name}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {table.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Edit Permissions Modal Overlay */}
        {editingUser && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-slate-900 border border-sky-400/30 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-scale-up">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    Edit Role & Permissions for {editingUser.fullName}
                  </h3>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                  Role {editingUser.role === null && "(required to approve this account)"}
                </label>
                <select
                  value={editRole}
                  onChange={(e) => {
                    const role = e.target.value as UserRole
                    setEditRole(role)
                    if (role) setEditPermissions(db.getDefaultPermissionsForRole(role))
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-[#02275A] text-xs text-white"
                >
                  {editingUser.role === null && <option value="">Pending approval (no access)</option>}
                  <option value="Super Admin">Super Admin (Full Access)</option>
                  <option value="Department Chair">Department Chair</option>
                  <option value="Lab Coordinator">Lab Coordinator (Rooms 126/127)</option>
                  <option value="Faculty/Staff">Faculty / Staff</option>
                  <option value="Student Assistant">Student Assistant (ACM Lead)</option>
                </select>
              </div>

              <p className="text-xs text-slate-400">
                Configure which tools and operations this user can access in the signage manager:
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {ALL_PERMISSIONS.map((perm) => {
                  const isChecked = editPermissions.includes(perm.id)
                  return (
                    <label
                      key={perm.id}
                      onClick={() => toggleEditPermission(perm.id)}
                      className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all cursor-pointer ${
                        isChecked
                          ? "bg-[#02275A]/40 border-sky-500/60 text-white"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-sky-500 focus:ring-0"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold block text-white">
                          {perm.label}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {perm.description}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg cursor-pointer"
                >
                  Save Permissions
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
