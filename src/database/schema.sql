-- ============================================================================
-- Hampton University Department of Computer Science
-- Digital Signage Master Database Schema
-- Compatible with: PostgreSQL 14+, Supabase, Neon, AWS RDS, TimescaleDB, SQLite
--
-- REFERENCE DESIGN ONLY. The deployed app uses the smaller Supabase schema in
-- supabase/migrations/0001_init.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS (PostgreSQL)
-- ----------------------------------------------------------------------------
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE
-- Authorized faculty, administrators, coordinators, and assistants
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    pin_code VARCHAR(16),
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(128) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL CHECK (role IN (
        'Super Admin',
        'Department Chair',
        'Lab Coordinator',
        'Faculty/Staff',
        'Student Assistant'
    )),
    department VARCHAR(128) DEFAULT 'Department of Computer Science',
    avatar_color VARCHAR(16) DEFAULT '#02275A',
    status VARCHAR(16) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at BIGINT NOT NULL,
    last_login_at BIGINT,
    notes TEXT,
    updated_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ----------------------------------------------------------------------------
-- 2. USER PERMISSIONS TABLE
-- Granular capabilities assigned to each user
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_permissions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(64) NOT NULL CHECK (permission IN (
        'manage_users',
        'manage_labs',
        'manage_events',
        'upload_media',
        'delete_media',
        'broadcast_alerts',
        'view_logs'
    )),
    granted_at BIGINT NOT NULL,
    granted_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_user_permission UNIQUE(user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_perms_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_perms_permission ON user_permissions(permission);

-- ----------------------------------------------------------------------------
-- 3. COMPUTER LABS TABLE
-- Real-time status, occupancy, and operating hours for Computer Labs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS labs (
    id INTEGER PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'Closed' CHECK (status IN ('Open', 'Closed', 'In Class', 'Reserved')),
    current_occupancy INTEGER NOT NULL DEFAULT 0,
    max_capacity INTEGER NOT NULL DEFAULT 30,
    staff_on_duty VARCHAR(128),
    tutor_subject VARCHAR(128),
    hours_mon_thu VARCHAR(64),
    hours_fri VARCHAR(64),
    hours_weekend VARCHAR(64),
    last_updated BIGINT NOT NULL,
    updated_by VARCHAR(128),
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT,
    updated_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_labs_status ON labs(status);

-- ----------------------------------------------------------------------------
-- 4. LAB CLASSES SCHEDULE TABLE
-- Class meetings scheduled in each lab room
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_classes (
    id VARCHAR(64) PRIMARY KEY,
    lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    class_name VARCHAR(128) NOT NULL,
    instructor VARCHAR(128),
    days JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g. ["Mon", "Wed", "Fri"]
    start_time VARCHAR(32) NOT NULL,
    end_time VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_lab_classes_lab_id ON lab_classes(lab_id);

-- ----------------------------------------------------------------------------
-- 5. LAB TUTOR SHIFTS TABLE
-- Peer tutoring shifts scheduled in tutoring facilities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_tutor_shifts (
    id VARCHAR(64) PRIMARY KEY,
    lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    tutor_name VARCHAR(128) NOT NULL,
    course VARCHAR(64) NOT NULL,
    day VARCHAR(8) NOT NULL CHECK (day IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
    shift_time VARCHAR(64) NOT NULL,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_lab_tutor_shifts_lab_id ON lab_tutor_shifts(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_tutor_shifts_day ON lab_tutor_shifts(day);

-- ----------------------------------------------------------------------------
-- 6. CALENDAR EVENTS & ANNOUNCEMENTS TABLE
-- Departmental workshops, capstones, career panels, and campus notices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_events (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    event_date VARCHAR(64) NOT NULL,
    event_time VARCHAR(64) NOT NULL,
    location VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL CHECK (category IN (
        'Capstone',
        'Workshop',
        'Club',
        'Lecture',
        'Career',
        'Hackathon'
    )),
    description TEXT,
    organizer VARCHAR(128),
    is_today BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    uid VARCHAR(255),
    start_iso VARCHAR(64),
    end_iso VARCHAR(64),
    last_modified BIGINT,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT,
    updated_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_events_category ON calendar_events(category);
CREATE INDEX IF NOT EXISTS idx_events_uid ON calendar_events(uid);
CREATE INDEX IF NOT EXISTS idx_events_is_today ON calendar_events(is_today);

-- ----------------------------------------------------------------------------
-- 7. BINARY MEDIA BLOBS TABLE
-- Stores raw binary files (images, video streams, slide files)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_blobs (
    id VARCHAR(64) PRIMARY KEY,
    mime_type VARCHAR(64) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    data BYTEA,
    file_size BIGINT NOT NULL,
    timestamp BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_blobs_timestamp ON media_blobs(timestamp DESC);

-- ----------------------------------------------------------------------------
-- 8. UPLOADS REPOSITORY TABLE
-- Tracks local file uploads validated and committed to database
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uploads (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(128) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    formatted_size VARCHAR(32) NOT NULL,
    file_type VARCHAR(64) NOT NULL,
    media_type VARCHAR(16) NOT NULL CHECK (media_type IN ('image', 'video', 'document', 'ics')),
    storage_key VARCHAR(64) REFERENCES media_blobs(id) ON DELETE SET NULL,
    preview_url TEXT,
    associated_slide_id VARCHAR(64),
    associated_event_id VARCHAR(64),
    status VARCHAR(16) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    uploaded_at BIGINT NOT NULL,
    tags JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_media_type ON uploads(media_type);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);

-- ----------------------------------------------------------------------------
-- 9. SIGNAGE SLIDES TABLE
-- Center TV display rotation items, banners, and durations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signage_slides (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    url TEXT NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'Department Spotlight',
    caption TEXT,
    media_type VARCHAR(16) DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
    media_fit VARCHAR(16) DEFAULT 'cover' CHECK (media_fit IN ('cover', 'contain')),
    duration_seconds INTEGER DEFAULT 6,
    storage_key VARCHAR(64) REFERENCES media_blobs(id) ON DELETE SET NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT,
    updated_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_slides_order ON signage_slides(display_order);
CREATE INDEX IF NOT EXISTS idx_slides_active ON signage_slides(is_active);

-- ----------------------------------------------------------------------------
-- 10. URGENT ALERTS TABLE
-- Campus emergency alerts and tickers broadcasted across TV displays
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS urgent_alerts (
    id VARCHAR(64) PRIMARY KEY,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    message TEXT NOT NULL,
    level VARCHAR(16) DEFAULT 'info' CHECK (level IN ('info', 'warning', 'emergency', 'alert')),
    timestamp BIGINT NOT NULL,
    sender VARCHAR(128) NOT NULL,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON urgent_alerts(active);

-- ----------------------------------------------------------------------------
-- 11. ACTION AUDIT LOGS TABLE
-- Immutable security and administrative audit trail
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS action_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(128) NOT NULL,
    user_role VARCHAR(64) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (category IN (
        'auth',
        'lab',
        'event',
        'media',
        'alert',
        'user',
        'system'
    )),
    summary TEXT NOT NULL,
    details JSONB,
    ip_or_device VARCHAR(128),
    severity VARCHAR(16) DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'alert'))
);

CREATE INDEX IF NOT EXISTS idx_action_logs_timestamp ON action_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_user_id ON action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_category ON action_logs(category);
CREATE INDEX IF NOT EXISTS idx_action_logs_severity ON action_logs(severity);
CREATE INDEX IF NOT EXISTS idx_action_logs_action_type ON action_logs(action_type);

-- ----------------------------------------------------------------------------
-- 12. SYSTEM CONFIGURATION TABLE
-- Dynamic application and database settings (no static config)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT
);

-- ----------------------------------------------------------------------------
-- CONVENIENCE REPORTING VIEWS
-- ----------------------------------------------------------------------------

-- View: Active Slides in Order
CREATE OR REPLACE VIEW v_active_slides AS
SELECT 
    id, title, subtitle, url, category, caption, 
    media_type, media_fit, duration_seconds, display_order
FROM signage_slides
WHERE is_active = TRUE
ORDER BY display_order ASC, created_at DESC;

-- View: Labs Overview with Active Schedules
CREATE OR REPLACE VIEW v_lab_summary AS
SELECT 
    l.id,
    l.name,
    l.status,
    l.current_occupancy,
    l.max_capacity,
    l.staff_on_duty,
    l.tutor_subject,
    l.hours_mon_thu,
    l.hours_fri,
    l.hours_weekend,
    COUNT(DISTINCT c.id) AS total_classes,
    COUNT(DISTINCT t.id) AS total_tutor_shifts,
    l.last_updated
FROM labs l
LEFT JOIN lab_classes c ON l.id = c.lab_id
LEFT JOIN lab_tutor_shifts t ON l.id = t.lab_id
GROUP BY l.id, l.name, l.status, l.current_occupancy, l.max_capacity, 
         l.staff_on_duty, l.tutor_subject, l.hours_mon_thu, l.hours_fri, 
         l.hours_weekend, l.last_updated;

-- View: Recent Audit Activity
CREATE OR REPLACE VIEW v_recent_audit_logs AS
SELECT 
    id,
    timestamp,
    user_name,
    user_role,
    action_type,
    category,
    summary,
    severity,
    ip_or_device
FROM action_logs
ORDER BY timestamp DESC
LIMIT 100;

-- ----------------------------------------------------------------------------
-- BOOTSTRAP: no default account is seeded. The live deployment uses Supabase
-- Auth (see supabase/migrations/0001_init.sql and README.md → "Create the
-- first admin"); passwords are never stored in application tables.
-- ----------------------------------------------------------------------------
