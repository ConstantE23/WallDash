# Hampton University CS Digital Signage — Database Schema Documentation

This document describes the complete database architecture for the **Hampton University Computer Science Division Digital Signage System**. 

The system operates a modern, dynamic architecture:
1. **Dynamic Database Connection Layer**: [`src/services/dbConnection.ts`](file:///Users/erickconstant/Downloads/Create%20mockup%20with%20colors/src/services/dbConnection.ts) connects the live frontend to an external database (PostgreSQL, Supabase, Neon, or REST endpoint).
2. **Relational Backend Master DDL**: [`src/database/schema.sql`](file:///Users/erickconstant/Downloads/Create%20mockup%20with%20colors/src/database/schema.sql) defines 12 production-grade relational tables, foreign key constraints, indexes, triggers, and views.
3. **TypeScript Type System & Store Descriptors**: [`src/database/schema.ts`](file:///Users/erickconstant/Downloads/Create%20mockup%20with%20colors/src/database/schema.ts) provides typed entity schemas, descriptors, and validators.
4. **Client-Side Cache**: Powered by IndexedDB (`hampton_cs_user_database_v3` and `hampton_cs_media_store_v1`) with multi-tab `BroadcastChannel` real-time sync. All pre-defined static mock datasets have been removed so all data is driven dynamically from the database.

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

## 3. How to Deploy the SQL Schema

### Option A: PostgreSQL / Supabase / Neon
1. Open your database console (Supabase SQL Editor, Neon Console, or `psql`).
2. Run the DDL script:
   ```bash
   psql -d "postgresql://user:pass@host:5432/dbname" -f src/database/schema.sql
   ```
3. Set your connection URL in the Admin Portal under **Database & SQL** or in `.env`:
   ```env
   VITE_DATABASE_URL="https://your-project.supabase.co"
   VITE_SUPABASE_ANON_KEY="your-anon-key"
   ```

### Option B: SQLite
The schema uses standard SQL and can be loaded directly:
```bash
sqlite3 signage.db < src/database/schema.sql
```

---

## 4. Initial Bootstrap Account

Upon applying `src/database/schema.sql`, the database provisions the master administrator account:
- **Username:** `admin`
- **Password:** `admin123`
- **Staff PIN:** `0000`
- **Full Name:** `CS Systems Administrator`
- **Role:** `Super Admin` (All 7 permissions granted)
