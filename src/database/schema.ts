/**
 * Hampton University Computer Science Digital Signage
 * Database Schema Definition
 * 
 * Provides unified schema definitions, store descriptors, index definitions,
 * relational constraints, and validation helpers for client-side storage (IndexedDB)
 * and server-side relational synchronization (PostgreSQL / SQLite).
 */

import type {
  SignageUser,
  ActionLog,
  UploadRecord,
  LabInfo,
  EventAnnouncement,
  SlideItem,
  UrgentAlert,
  UserRole,
  UserPermission,
  ActionLogCategory,
  ActionLogSeverity,
} from "../types/signage"

// ============================================================================
// DATABASE METADATA & CONSTANTS
// ============================================================================

export const DATABASE_CONFIG = {
  name: "hampton_cs_user_database_v3",
  version: 1,
  mediaDbName: "hampton_cs_media_store_v1",
  mediaDbVersion: 1,
  broadcastChannel: "hampton_cs_db_sync_channel",
} as const

export const STORES = {
  USERS: "users",
  LOGS: "action_logs",
  UPLOADS: "uploads",
  LABS: "labs",
  EVENTS: "events",
  SLIDES: "slides",
  ALERTS: "alerts",
  MEDIA_BLOBS: "media_blobs",
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

// ============================================================================
// STORE INDEX SPECIFICATIONS
// ============================================================================

export interface IndexDescriptor {
  name: string
  keyPath: string | string[]
  unique: boolean
  multiEntry?: boolean
  description: string
}

export interface StoreDescriptor<T> {
  name: StoreName
  keyPath: keyof T | string
  autoIncrement?: boolean
  description: string
  indexes: IndexDescriptor[]
}

/**
 * 1. Users Store Schema
 * Manages authorized staff, faculty, administrators, and student assistants.
 */
export const USERS_STORE_SCHEMA: StoreDescriptor<SignageUser> = {
  name: STORES.USERS,
  keyPath: "id",
  description: "Authorized faculty, administrator, and staff accounts with granular permissions.",
  indexes: [
    {
      name: "idx_username",
      keyPath: "username",
      unique: true,
      description: "Unique username for credential authentication",
    },
    {
      name: "idx_email",
      keyPath: "email",
      unique: false,
      description: "University email address",
    },
    {
      name: "idx_role",
      keyPath: "role",
      unique: false,
      description: "User role classification (Super Admin, Faculty/Staff, etc.)",
    },
    {
      name: "idx_status",
      keyPath: "status",
      unique: false,
      description: "Account state ('active', 'inactive', 'suspended')",
    },
    {
      name: "idx_createdAt",
      keyPath: "createdAt",
      unique: false,
      description: "Account registration epoch timestamp",
    },
  ],
}

/**
 * 2. Action Logs Store Schema
 * Complete audit trail tracking logins, configuration updates, lab toggles, and broadcasts.
 */
export const LOGS_STORE_SCHEMA: StoreDescriptor<ActionLog> = {
  name: STORES.LOGS,
  keyPath: "id",
  description: "Tamper-evident audit trail recording every administrative change and user action.",
  indexes: [
    {
      name: "idx_timestamp",
      keyPath: "timestamp",
      unique: false,
      description: "Epoch timestamp of when the action occurred",
    },
    {
      name: "idx_userId",
      keyPath: "userId",
      unique: false,
      description: "Foreign key reference to users.id",
    },
    {
      name: "idx_category",
      keyPath: "category",
      unique: false,
      description: "Functional category: auth, lab, event, media, alert, user, system",
    },
    {
      name: "idx_severity",
      keyPath: "severity",
      unique: false,
      description: "Log severity level: info, success, warning, alert",
    },
    {
      name: "idx_actionType",
      keyPath: "actionType",
      unique: false,
      description: "Machine-readable action identifier (e.g. USER_LOGIN, LAB_STATUS_CHANGE)",
    },
  ],
}

/**
 * 3. Uploads Repository Store Schema
 * Tracks files uploaded locally to the system before being scheduled on TV displays.
 */
export const UPLOADS_STORE_SCHEMA: StoreDescriptor<UploadRecord> = {
  name: STORES.UPLOADS,
  keyPath: "id",
  description: "Metadata ledger of media assets validated and committed to storage.",
  indexes: [
    {
      name: "idx_uploadedAt",
      keyPath: "uploadedAt",
      unique: false,
      description: "Epoch timestamp of upload completion",
    },
    {
      name: "idx_userId",
      keyPath: "userId",
      unique: false,
      description: "Foreign key reference to uploading user (users.id)",
    },
    {
      name: "idx_mediaType",
      keyPath: "mediaType",
      unique: false,
      description: "Media classification: image, video, document, ics",
    },
    {
      name: "idx_status",
      keyPath: "status",
      unique: false,
      description: "Asset life cycle: active, archived, deleted",
    },
    {
      name: "idx_storageKey",
      keyPath: "storageKey",
      unique: false,
      description: "Key reference to binary media_blobs store",
    },
  ],
}

/**
 * 4. Binary Media Blobs Store Schema
 * Dedicated binary storage for high-resolution images, videos, and calendar files.
 */
export interface MediaBlobRecord {
  id: string
  blob: Blob
  mimeType: string
  fileName: string
  timestamp: number
}

export const MEDIA_BLOBS_STORE_SCHEMA: StoreDescriptor<MediaBlobRecord> = {
  name: STORES.MEDIA_BLOBS,
  keyPath: "id",
  description: "High-capacity binary object store for image and video raw blobs.",
  indexes: [
    {
      name: "idx_timestamp",
      keyPath: "timestamp",
      unique: false,
      description: "Creation timestamp for LRU caching and garbage collection",
    },
    {
      name: "idx_mimeType",
      keyPath: "mimeType",
      unique: false,
      description: "MIME type (e.g. image/jpeg, video/mp4)",
    },
  ],
}

/**
 * 5. Computer Labs Store Schema
 */
export const LABS_STORE_SCHEMA: StoreDescriptor<LabInfo> = {
  name: STORES.LABS,
  keyPath: "id",
  description: "Real-time state and schedules for computer labs (Lab 126, 127).",
  indexes: [
    {
      name: "idx_status",
      keyPath: "status",
      unique: false,
      description: "Operating status: Open, Closed, Reserved",
    },
    {
      name: "idx_lastUpdated",
      keyPath: "lastUpdated",
      unique: false,
      description: "Timestamp of last status modification",
    },
  ],
}

/**
 * 6. Calendar Events Store Schema
 */
export const EVENTS_STORE_SCHEMA: StoreDescriptor<EventAnnouncement> = {
  name: STORES.EVENTS,
  keyPath: "id",
  description: "Departmental workshops, capstone defenses, career panels, and campus meetings.",
  indexes: [
    {
      name: "idx_date",
      keyPath: "date",
      unique: false,
      description: "Display date string for event scheduling",
    },
    {
      name: "idx_category",
      keyPath: "category",
      unique: false,
      description: "Event category (Capstone, Lecture, Workshop, Career, Hackathon)",
    },
    {
      name: "idx_uid",
      keyPath: "uid",
      unique: false,
      description: "iCalendar UID for synchronization deduplication",
    },
  ],
}

/**
 * 7. Screen Carousel Slides Store Schema
 */
export const SLIDES_STORE_SCHEMA: StoreDescriptor<SlideItem> = {
  name: STORES.SLIDES,
  keyPath: "id",
  description: "Main screen rotation items, banner captions, and durations.",
  indexes: [
    {
      name: "idx_category",
      keyPath: "category",
      unique: false,
      description: "Slide badge category (Campus Facilities, Spotlight, Club)",
    },
    {
      name: "idx_mediaType",
      keyPath: "mediaType",
      unique: false,
      description: "Slide media format (image or video)",
    },
  ],
}

/**
 * 8. Emergency Alerts Store Schema
 */
export const ALERTS_STORE_SCHEMA: StoreDescriptor<UrgentAlert> = {
  name: STORES.ALERTS,
  keyPath: "id",
  description: "Urgent announcements broadcasted across screen tickers.",
  indexes: [
    {
      name: "idx_active",
      keyPath: "active",
      unique: false,
      description: "Whether the alert is currently displaying on screen",
    },
    {
      name: "idx_level",
      keyPath: "level",
      unique: false,
      description: "Alert criticality: info, warning, alert",
    },
  ],
}

/**
 * 9. System Configuration Store Schema
 */
export interface SystemSettingRecord {
  key: string
  value: unknown
  description?: string
  updatedAt: number
}

export const SYSTEM_SETTINGS_STORE_SCHEMA: StoreDescriptor<SystemSettingRecord> = {
  name: "settings" as StoreName,
  keyPath: "key",
  description: "Dynamic system and database endpoint configuration.",
  indexes: [],
}

// ============================================================================
// COMPLETE DATABASE SCHEMA REGISTRY
// ============================================================================

export const DATABASE_SCHEMA = {
  config: DATABASE_CONFIG,
  stores: {
    users: USERS_STORE_SCHEMA,
    actionLogs: LOGS_STORE_SCHEMA,
    uploads: UPLOADS_STORE_SCHEMA,
    mediaBlobs: MEDIA_BLOBS_STORE_SCHEMA,
    labs: LABS_STORE_SCHEMA,
    events: EVENTS_STORE_SCHEMA,
    slides: SLIDES_STORE_SCHEMA,
    alerts: ALERTS_STORE_SCHEMA,
    settings: SYSTEM_SETTINGS_STORE_SCHEMA,
  },
} as const

// ============================================================================
// SCHEMA VALIDATION HELPERS
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates a user record before insertion/update into the database.
 */
export function validateUserRecord(user: Partial<SignageUser>): ValidationResult {
  const errors: string[] = []

  if (!user.username || user.username.trim().length < 3) {
    errors.push("Username must be at least 3 characters long.")
  } else if (!/^[a-zA-Z0-9._-]+$/.test(user.username)) {
    errors.push("Username may only contain alphanumeric characters, dots, underscores, or dashes.")
  }

  if (!user.fullName || user.fullName.trim().length < 2) {
    errors.push("Full name is required.")
  }

  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
    errors.push("A valid university email address is required.")
  }

  if (!user.role) {
    errors.push("User role must be specified.")
  }

  if (!Array.isArray(user.permissions)) {
    errors.push("Permissions must be an array.")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates an upload record before committing to the uploads ledger.
 */
export function validateUploadRecord(upload: Partial<UploadRecord>): ValidationResult {
  const errors: string[] = []

  if (!upload.id) errors.push("Upload ID is required.")
  if (!upload.userId) errors.push("Uploader user ID is required.")
  if (!upload.fileName || upload.fileName.trim().length === 0) {
    errors.push("File name is required.")
  }
  if (typeof upload.fileSize !== "number" || upload.fileSize <= 0) {
    errors.push("File size must be greater than zero.")
  }
  if (!upload.mediaType) {
    errors.push("Media type must be specified (image, video, document, or ics).")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
