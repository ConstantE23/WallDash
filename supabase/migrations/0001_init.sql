-- =============================================================================
-- WallDash · Hampton University CS Digital Signage
-- Supabase migration 0001 — shared signage state, staff profiles, uploads,
-- audit logs, media bucket, RLS and realtime.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is idempotent: running it again is safe and will not wipe data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Profiles (one per auth.users row)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  full_name      text not null default '',
  username       text unique,
  -- NULL role = account exists but has not been approved by an admin yet.
  role           text check (role in (
                   'Super Admin',
                   'Department Chair',
                   'Lab Coordinator',
                   'Faculty/Staff',
                   'Student Assistant'
                 )),
  permissions    text[] not null default '{}',
  avatar_color   text,
  department     text not null default 'Department of Computer Science',
  status         text not null default 'active'
                   check (status in ('active', 'inactive', 'suspended')),
  notes          text,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Helper functions used by RLS policies.
--    SECURITY DEFINER so they can read profiles without recursive RLS checks.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('Super Admin', 'Department Chair')
        or 'manage_users' = any (p.permissions)
      )
  );
$$;

-- Any active profile that an admin has given a role counts as signage staff.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role is not null
  );
$$;

-- Lets a signed-in user stamp their own last_login_at without being able to
-- update any other profile column (role, permissions...).
create or replace function public.record_login()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_login_at = now() where id = auth.uid();
$$;

revoke all on function public.record_login() from public, anon;
grant execute on function public.record_login() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Create a profile automatically for every new auth user.
--    New profiles have NO role, so they cannot edit anything until an admin
--    assigns one (protects against public sign-ups).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
begin
  base_username := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1),
    'user'
  ));
  final_username := base_username;
  if exists (select 1 from public.profiles where username = final_username) then
    final_username := base_username || '_' || substr(new.id::text, 1, 6);
  end if;

  insert into public.profiles (id, email, full_name, username)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    final_username
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that existed before this migration ran.
insert into public.profiles (id, email, full_name, username)
select
  u.id,
  u.email,
  split_part(u.email, '@', 1),
  lower(split_part(u.email, '@', 1)) || '_' || substr(u.id::text, 1, 6)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- -----------------------------------------------------------------------------
-- 4. Shared signage state (single row, id = 1)
-- -----------------------------------------------------------------------------
create table if not exists public.signage_state (
  id          integer primary key default 1 check (id = 1),
  state       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create or replace function public.stamp_signage_state()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists signage_state_stamp on public.signage_state;
create trigger signage_state_stamp
  before insert or update on public.signage_state
  for each row execute function public.stamp_signage_state();

-- Seed from src/data/initialData.ts (INITIAL_STATE / INITIAL_SLIDES).
insert into public.signage_state (id, state)
values (1, $json$
{
  "version": 1,
  "labs": {
    "126": {
      "id": 126,
      "name": "Computer Lab 126",
      "hours": {
        "monThu": "8:00 AM – 10:00 PM",
        "fri": "8:00 AM – 6:00 PM",
        "weekend": "10:00 AM – 4:00 PM"
      },
      "status": "Closed",
      "currentOccupancy": 0,
      "maxCapacity": 32,
      "staffOnDuty": "",
      "tutorSubject": "Systems Architecture & Linux",
      "classes": [],
      "lastUpdated": 0,
      "updatedBy": "Database Connection"
    },
    "127": {
      "id": 127,
      "name": "Senior Design & Tutoring Lab 127",
      "hours": {
        "monThu": "9:00 AM – 9:00 PM",
        "fri": "9:00 AM – 5:00 PM",
        "weekend": "Closed"
      },
      "status": "Closed",
      "currentOccupancy": 0,
      "maxCapacity": 24,
      "staffOnDuty": "",
      "tutorSubject": "Data Structures & Algorithms",
      "classes": [],
      "tutoringHours": {
        "introToProgramming": "Mon & Wed · 2:00 PM – 5:00 PM",
        "dataStructuresOne": "Tue & Thu · 3:00 PM – 6:00 PM"
      },
      "tutorShifts": [],
      "lastUpdated": 0,
      "updatedBy": "Database Connection"
    }
  },
  "events": [],
  "slides": [],
  "activeSlideIndex": 0,
  "isCarouselPaused": false,
  "urgentAlert": null,
  "lastAction": {
    "type": "DATABASE_INITIALIZE",
    "byClient": "System",
    "clientRole": "Display Kiosk",
    "timestamp": 0,
    "description": "System connected to Supabase."
  }
}
$json$::jsonb)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Upload records (mirrors UploadRecord in src/types/signage.ts)
-- -----------------------------------------------------------------------------
create table if not exists public.uploads (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references public.profiles (id) on delete set null,
  user_name            text not null default '',
  file_name            text not null,
  file_size            bigint not null default 0,
  formatted_size       text not null default '',
  file_type            text not null default '',
  media_type           text not null default 'image'
                         check (media_type in ('image', 'video', 'document', 'ics')),
  storage_path         text,
  public_url           text,
  associated_slide_id  text,
  associated_event_id  text,
  status               text not null default 'active'
                         check (status in ('active', 'archived', 'deleted')),
  tags                 text[] not null default '{}',
  uploaded_at          timestamptz not null default now()
);

create index if not exists uploads_uploaded_at_idx on public.uploads (uploaded_at desc);
create index if not exists uploads_slide_idx on public.uploads (associated_slide_id);

-- -----------------------------------------------------------------------------
-- 6. Action audit log (mirrors ActionLog in src/types/signage.ts)
-- -----------------------------------------------------------------------------
create table if not exists public.action_logs (
  id            uuid primary key default gen_random_uuid(),
  "timestamp"   timestamptz not null default now(),
  user_id       uuid references public.profiles (id) on delete set null,
  user_name     text not null default '',
  user_role     text not null default '',
  action_type   text not null,
  category      text not null default 'system'
                  check (category in ('auth', 'lab', 'event', 'media', 'alert', 'user', 'system')),
  summary       text not null default '',
  details       jsonb,
  ip_or_device  text,
  severity      text not null default 'info'
                  check (severity in ('info', 'success', 'warning', 'alert'))
);

create index if not exists action_logs_timestamp_idx on public.action_logs ("timestamp" desc);

-- -----------------------------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.signage_state enable row level security;
alter table public.uploads       enable row level security;
alter table public.action_logs   enable row level security;

-- signage_state: screens are anonymous and read-only; staff write.
drop policy if exists "signage_state read for everyone" on public.signage_state;
create policy "signage_state read for everyone"
  on public.signage_state for select
  to anon, authenticated
  using (true);

drop policy if exists "signage_state insert by staff" on public.signage_state;
create policy "signage_state insert by staff"
  on public.signage_state for insert
  to authenticated
  with check (public.is_staff());

drop policy if exists "signage_state update by staff" on public.signage_state;
create policy "signage_state update by staff"
  on public.signage_state for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- profiles: users read their own row; admins read/write all.
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin insert" on public.profiles;
create policy "profiles admin insert"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profiles admin delete" on public.profiles;
create policy "profiles admin delete"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- uploads: staff insert/select/update (mark deleted); admins delete.
drop policy if exists "uploads staff select" on public.uploads;
create policy "uploads staff select"
  on public.uploads for select
  to authenticated
  using (public.is_staff());

drop policy if exists "uploads staff insert" on public.uploads;
create policy "uploads staff insert"
  on public.uploads for insert
  to authenticated
  with check (public.is_staff() and user_id = auth.uid());

drop policy if exists "uploads staff update" on public.uploads;
create policy "uploads staff update"
  on public.uploads for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "uploads admin delete" on public.uploads;
create policy "uploads admin delete"
  on public.uploads for delete
  to authenticated
  using (public.is_admin());

-- action_logs: staff insert/select; admins delete.
drop policy if exists "action_logs staff select" on public.action_logs;
create policy "action_logs staff select"
  on public.action_logs for select
  to authenticated
  using (public.is_staff());

drop policy if exists "action_logs staff insert" on public.action_logs;
create policy "action_logs staff insert"
  on public.action_logs for insert
  to authenticated
  with check (public.is_staff() and user_id = auth.uid());

drop policy if exists "action_logs admin delete" on public.action_logs;
create policy "action_logs admin delete"
  on public.action_logs for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 8. Realtime: broadcast signage_state changes to every screen.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'signage_state'
  ) then
    alter publication supabase_realtime add table public.signage_state;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Storage bucket for slide media (public read, 50 MB limit).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signage-media',
  'signage-media',
  true,
  52428800,
  array['image/*', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "signage-media public read" on storage.objects;
create policy "signage-media public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'signage-media');

drop policy if exists "signage-media staff insert" on storage.objects;
create policy "signage-media staff insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'signage-media' and public.is_staff());

drop policy if exists "signage-media staff delete" on storage.objects;
create policy "signage-media staff delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'signage-media' and public.is_staff());
