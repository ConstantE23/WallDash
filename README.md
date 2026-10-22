# WallDash — Hampton University CS Digital Signage

React 19 + Vite 8 + Tailwind v4 signage app, deployed on Vercel, with Supabase for shared
state, staff sign-in and media storage.

- `/` — the TV display. Anonymous, read-only; updates live from Supabase Realtime.
- `/manage` — the staff console. Requires a Supabase Auth account with an assigned role.

## Setup

### 1. Environment variables

The Supabase project is connected through the Vercel Marketplace, which injects env vars at
build time. `vite.config.ts` exposes **only** the project URL and the anon/publishable key to
the browser, taking the first one it finds of:

| Exposed as | Looked up from (in order) |
|---|---|
| `VITE_SUPABASE_URL` | `VITE_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY` |

The admin function `api/admin-users.ts` runs server-side on Vercel and reads
`SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` (or
`SUPABASE_SECRET_KEY`).

> Never give the service role key, any `POSTGRES_*` URL or the JWT secret a `VITE_` prefix.
> Anything with that prefix ends up in the public JavaScript bundle.

For local development, copy `.env.example` to `.env.local` and fill in the two values, or run
`vercel env pull .env.local`. Without them, a dev build (`pnpm dev`) runs in **local fallback
mode**: data stays in that browser (IndexedDB/localStorage) and `/manage` offers a
"Continue as local administrator" button. Production builds without the env vars disable
sign-in.

### 2. Run the SQL migration

Open Supabase → **SQL Editor** → New query, paste the whole of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and **Run**. Do this
once, before the first deploy that uses Supabase. It's safe to run again.

It creates the `signage_state`, `profiles`, `uploads` and `action_logs` tables, Row Level
Security policies, the profile-creation trigger, the realtime publication, and the public
`signage-media` storage bucket, then seeds the initial signage state. See
[`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) for details.

Then run [`supabase/migrations/0002_validate_lab_hours.sql`](supabase/migrations/0002_validate_lab_hours.sql)
the same way. It makes the database reject lab hours that aren't `Closed` or
`h:mm AM – h:mm PM` (hours 1–12, minutes 00–59).

**Recommended:** in Supabase → Authentication → Sign In / Providers, turn off
**Allow new users to sign up**. New accounts get no role and can't change anything until an
admin approves them, but switching sign-ups off avoids stray accounts.

### 3. Create the first admin

1. Supabase → **Authentication → Users → Add user → Create new user**. Enter the email and a
   strong password, and tick **Auto Confirm User**.
2. Copy the new user's **UID**, then run in the SQL Editor:

   ```sql
   update public.profiles
   set role = 'Super Admin',
       permissions = array['manage_users','manage_labs','manage_events','upload_media',
                           'delete_media','broadcast_alerts','view_logs'],
       full_name = 'Your Name'
   where id = '<uuid>';
   ```

3. Sign in at `https://<site>/manage` with that email and password.

### Adding more staff

Either way works:

- **From the app**: Admin Portal → Users → **+ Create New User** (email, initial password of
  8+ characters, role, permissions). This calls `/api/admin-users`, which checks that you're an
  admin and creates the account server-side.
- **From the Supabase dashboard**: Authentication → Users → Add user. The account appears in
  the Admin Portal as **Pending approval**. Edit it there to assign a role, or run the
  `update profiles …` SQL above with a role of `Department Chair`, `Lab Coordinator`,
  `Faculty/Staff` or `Student Assistant`.

There's no in-app "change password" or "forgot password" screen yet. To reset a password,
an admin deletes the account and creates it again with a new initial password (the role has
to be set again too).

## Media uploads

- Photos (`image/*`) and videos (`MP4`, `WebM`, `MOV`) upload straight from `/manage` to the
  `signage-media` bucket. **Files must be under 50 MB.** Larger files are rejected before
  uploading ("Videos must be under 50 MB — compress or trim the clip").
- MOV files recorded on iPhones are often HEVC, which Chrome on Windows/Android TVs may not
  play. Export or convert to H.264 MP4 if a clip shows a black screen.
- Deleting a slide, or deleting an upload in the Admin Portal, also deletes the file from
  Storage.

## Free-tier limits (one-month trial)

| Service | Limit that matters | How the app stays inside it |
|---|---|---|
| Supabase Free | 5 GB egress / month | Media is stored at unique paths with `Cache-Control: max-age=31536000`, so each screen downloads a file once and serves repeats from its HTTP cache. Only the active slide's video plays and only the next one preloads. No cache-busting query strings. |
| Supabase Free | 1 GB file storage, 50 MB per file | 50 MB check in the UI and on the bucket. Delete old slides to free space. |
| Supabase Free | 200 concurrent realtime connections | One connection per open screen or console. |
| Supabase Free | Project pauses after 7 days with no activity | Running screens keep it active. If it pauses, restore it from the Supabase dashboard. |
| Vercel Hobby | Non-commercial use, 100 GB bandwidth | Only the app bundle is served from Vercel. Media comes from Supabase. |

Rough egress budget: a 30 MB clip shown on 5 screens costs about 150 MB the first time. It
costs more only if a screen's browser cache is cleared or the clip is replaced.

## Development

```bash
pnpm install
pnpm dev      # http://localhost:8443
pnpm build
```

`vercel.json` rewrites every path that isn't a file, `/assets/…` or `/api/…` to
`index.html`, so opening `/manage` directly works on Vercel.
