/**
 * Vercel Function: admin-only staff account management.
 *
 *   POST   /api/admin-users  { email, password, fullName, username, role, permissions, ... }
 *   DELETE /api/admin-users  { id }
 *
 * The service role key is only read here, server-side. Every request must carry the
 * caller's Supabase access token (Authorization: Bearer <jwt>), and the caller's profile
 * must be an active admin.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const ROLES = [
  "Super Admin",
  "Department Chair",
  "Lab Coordinator",
  "Faculty/Staff",
  "Student Assistant",
]

const PERMISSIONS = [
  "manage_users",
  "manage_labs",
  "manage_events",
  "upload_media",
  "delete_media",
  "broadcast_alerts",
  "view_logs",
]

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

function getAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Returns the caller's user id if they're an active admin, otherwise an error Response. */
async function requireAdmin(
  request: Request,
  admin: SupabaseClient,
): Promise<{ userId: string } | Response> {
  const header = request.headers.get("authorization") || ""
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : ""
  if (!token) return json(401, { error: "Missing access token. Please sign in again." })

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) {
    return json(401, { error: "Your session has expired. Please sign in again." })
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, permissions, status")
    .eq("id", data.user.id)
    .maybeSingle()

  const isAdmin =
    profile &&
    profile.status === "active" &&
    (profile.role === "Super Admin" ||
      profile.role === "Department Chair" ||
      (profile.permissions || []).includes("manage_users"))

  if (!isAdmin) return json(403, { error: "Only signage administrators can manage accounts." })
  return { userId: data.user.id }
}

export async function POST(request: Request): Promise<Response> {
  const admin = getAdminClient()
  if (!admin) return json(500, { error: "Server is missing Supabase configuration." })

  const caller = await requireAdmin(request, admin)
  if (caller instanceof Response) return caller

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return json(400, { error: "Invalid JSON body." })

  const email = String(body.email || "").trim().toLowerCase()
  const password = String(body.password || "")
  const fullName = String(body.fullName || "").trim()
  const username = String(body.username || "").trim().toLowerCase()
  const role = String(body.role || "")
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.map(String).filter((p) => PERMISSIONS.includes(p))
    : []

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "A valid email is required." })
  if (password.length < 8) return json(400, { error: "Password must be at least 8 characters." })
  if (!fullName) return json(400, { error: "Full name is required." })
  if (!ROLES.includes(role)) return json(400, { error: "Unknown role." })

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username },
  })
  if (createError || !created.user) {
    return json(400, { error: createError?.message || "Could not create the account." })
  }

  // The on_auth_user_created trigger inserted a role-less profile; fill it in.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      ...(username ? { username } : {}),
      role,
      permissions,
      department: String(body.department || "Department of Computer Science"),
      avatar_color: body.avatarColor ? String(body.avatarColor) : null,
      notes: body.notes ? String(body.notes) : null,
      status: "active",
    })
    .eq("id", created.user.id)
    .select("*")
    .single()

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return json(400, { error: `Could not save the profile: ${profileError.message}` })
  }

  return json(200, { profile })
}

export async function DELETE(request: Request): Promise<Response> {
  const admin = getAdminClient()
  if (!admin) return json(500, { error: "Server is missing Supabase configuration." })

  const caller = await requireAdmin(request, admin)
  if (caller instanceof Response) return caller

  const body = (await request.json().catch(() => null)) as { id?: string } | null
  const id = body?.id ? String(body.id) : ""
  if (!id) return json(400, { error: "User id is required." })
  if (id === caller.userId) return json(400, { error: "You cannot delete your own account." })

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return json(400, { error: error.message })

  return json(200, { ok: true })
}
