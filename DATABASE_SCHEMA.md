# Hampton University CS Digital Signage — Database Schema Documentation

## What the deployed app actually uses (Supabase)

The live app runs on **Supabase** with a deliberately small schema, defined in
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Run that file once
in Supabase → SQL Editor (it is safe to re-run).

| Object | Kind | Purpose | Who can read | Who can write |
|---|---|---|---|---|
| `signage_state` | table, 1 row (`id = 1`) | Whole `SignageState` as `jsonb`: labs, tutor shifts, class sessions, events, slides, urgent alert, active slide, carousel pause | Everyone (anon screens) | Signed-in staff (`is_staff()`) |
| `profiles` | table | One row per `auth.users` user: `full_name`, `username`, `role`, `permissions[]`, `status`, … | Own row; admins read all | Admins only |
| `uploads` | table | Ledger of uploaded media (`storage_path`, `public_url`, size, type, slide id) | Staff | Staff insert/update; admins delete |
| `action_logs` | table | Audit trail mirroring `ActionLog` | Staff | Staff insert; admins delete |
| `signage-media` | Storage bucket (public) | Slide photos/videos, 50 MB/file, `image/*`, `video/mp4`, `video/webm`, `video/quicktime` | Everyone | Staff upload/delete |

Key points:

- **Auth** is Supabase Auth (email + password). A trigger (`on_auth_user_created`) creates a
  `profiles` row for each new user **with no role**, so new accounts can't edit anything until
  an admin assigns a role. `is_admin()` / `is_staff()` are `security definer` helpers used by
  the RLS policies.
- **Realtime**: `signage_state` is in the `supabase_realtime` publication. Every screen
  subscribes to `postgres_changes` on it; connected screens are tracked with Realtime Presence.
- **Writes** come only from signed-in staff, debounced ~400 ms. TV displays never write;
  each screen advances its own carousel locally.
- **Offline cache**: the last good state is kept in `localStorage`
  (`hampton_cs_sync_state_v1`) so a screen keeps showing content if the network drops.
- **Fallback**: with no Supabase env vars (local dev only) the app uses the original
  IndexedDB/localStorage stores in a single browser.

The rest of this document describes the original 12-table reference design in
`src/database/schema.sql`. It is kept for reference and is **not** deployed.

---

## Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    USERS ||--o{ USER_PERMISSIONS : "has"
    USERS ||--o{ ACTION_LOGS : "records"
    USERS ||--o{ UPLOADS : "uploads"
    LABS ||--o{ LAB_CLASSES : "hosts"
    LABS ||--o{ LAB_TUTOR_SHIFTS : "schedules"
    MEDIA_BLOBS ||--o{ UPLOADS : "backed by"
    MEDIA_BLOBS ||--o{ SIGNAGE_SLIDES : "referenced in"

    USERS {
        string id PK
        string username UK
        string password_hash
        string pin_code
        string full_name
        string email UK
        string role
        string department
        string avatar_color
        string status
        int64 created_at
        int64 last_login_at
        string notes
    }

    USER_PERMISSIONS {
        string id PK
        string user_id FK
        string permission
        int64 granted_at
        string granted_by FK
    }

    ACTION_LOGS {
        string id PK
        int64 timestamp
        string user_id FK
        string user_name
        string user_role
        string action_type
        string category
        string summary
        json details
        string ip_or_device
        string severity
    }

    UPLOADS {
        string id PK
        string user_id FK
        string user_name
        string file_name
        int64 file_size
        string formatted_size
        string file_type
        string media_type
        string storage_key FK
        string preview_url
        string status
        int64 uploaded_at
        json tags
    }

    MEDIA_BLOBS {
        string id PK
        string mime_type
        string file_name
        bytea data
        int64 file_size
        int64 timestamp
    }

    LABS {
        int id PK
        string name
        string status
        int current_occupancy
        int max_capacity
        string staff_on_duty
        string tutor_subject
        string hours_mon_thu
        string hours_fri
        string hours_weekend
        int64 last_updated
        string updated_by
    }

    LAB_CLASSES {
        string id PK
        int lab_id FK
        string class_name
        string instructor
        json days
        string start_time
        string end_time
    }

    LAB_TUTOR_SHIFTS {
        string id PK
        int lab_id FK
        string tutor_name
        string course
        string day
        string shift_time
    }

    CALENDAR_EVENTS {
        string id PK
        string title
        string event_date
        string event_time
        string location
        string category
        string description
        string organizer
        boolean is_today
        boolean is_featured
        string uid
        string start_iso
        string end_iso
    }

    SIGNAGE_SLIDES {
        string id PK
        string title
        string subtitle
        string url
        string category
        string caption
        string media_type
        string media_fit
        int duration_seconds
        string storage_key FK
        int display_order
        boolean is_active
    }

    URGENT_ALERTS {
        string id PK
        boolean active
        string message
        string level
        int64 timestamp
        string sender
    }

    SYSTEM_SETTINGS {
        string key PK
        json value
        string description
        int64 updated_at
    }
```

---

## 1. Master SQL Tables Catalog

| # | Table Name | Primary Key | Foreign Keys | Purpose |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `users` | `id VARCHAR(64)` | None | Authorized staff, admin accounts, PINs, and roles |
| **2** | `user_permissions` | `id VARCHAR(64)` | `user_id -> users(id)` | Granular capabilities assigned to accounts |
| **3** | `labs` | `id INTEGER` | None | Real-time status, occupancy, and hours for Computer Labs (126, 127) |
| **4** | `lab_classes` | `id VARCHAR(64)` | `lab_id -> labs(id)` | Scheduled class lectures in labs |
| **5** | `lab_tutor_shifts` | `id VARCHAR(64)` | `lab_id -> labs(id)` | Peer tutoring shifts and staff assignments |
| **6** | `calendar_events` | `id VARCHAR(64)` | None | Departmental workshops, capstones, career panels, hackathons |
| **7** | `signage_slides` | `id VARCHAR(64)` | `storage_key -> media_blobs(id)` | Main center TV rotation media, durations, and order |
| **8** | `media_blobs` | `id VARCHAR(64)` | None | Binary payload store (MP4, WebM, high-resolution photos) |
| **9** | `uploads` | `id VARCHAR(64)` | `user_id -> users(id)` | Metadata audit ledger of uploaded assets |
| **10** | `action_logs` | `id VARCHAR(64)` | `user_id -> users(id)` | Immutable security audit ledger of all modifications |
| **11** | `urgent_alerts` | `id VARCHAR(64)` | None | Campus emergency notices and ticker announcements |
| **12** | `system_settings` | `key VARCHAR(64)` | None | Dynamic database connection and kiosk configuration |

---

## 2. Reporting SQL Views

The schema includes pre-built views:
- **`v_active_slides`**: Returns all active slides ordered by `display_order` and creation date.
- **`v_lab_summary`**: Aggregates lab status, capacity, occupancy, and counts of active classes and tutor shifts.
- **`v_recent_audit_logs`**: Returns the most recent 100 audit actions with user attribution.

---

## 3. How to Deploy

Use the Supabase migration described at the top of this document. See `README.md` for the
full setup (env vars, SQL, first admin).

---

## 4. Initial Bootstrap Account

No default account or password is seeded anywhere. Create the first admin in Supabase
Auth and promote it via SQL — see `README.md` → "Create the first admin".
