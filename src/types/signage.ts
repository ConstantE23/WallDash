export type WeekDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri"
export type LabStatus = "Open" | "Closed" | "In Class" | "Reserved"

export interface TutorShift {
  id: string
  tutorName: string
  course: string
  day: WeekDay
  time: string
}

export interface LabClassSession {
  id: string
  className: string
  instructor?: string
  days: WeekDay[]
  startTime: string
  endTime: string
}

export interface LabInfo {
  id: number
  name: string
  hours: {
    monThu: string
    fri: string
    weekend: string
  }
  status: LabStatus
  currentOccupancy: number
  maxCapacity: number
  staffOnDuty: string
  tutorSubject?: string
  tutoringHours?: {
    introToProgramming?: string
    dataStructuresOne?: string
  }
  tutorShifts?: TutorShift[]
  classes?: LabClassSession[]
  lastUpdated: number
  updatedBy: string
}

export interface EventAnnouncement {
  id: string
  title: string
  date: string
  time: string
  location: string
  category: "Capstone" | "Workshop" | "Club" | "Lecture" | "Career" | "Hackathon"
  isToday?: boolean
  isFeatured?: boolean
  description?: string
  organizer?: string
  /** Calendar UID (from .ics) used to replace duplicates on re-import */
  uid?: string
  /** Real start/end timestamps (ISO). When present, "today" and expiry are computed live. */
  startISO?: string
  endISO?: string
}

export interface UrgentAlert {
  id: string
  active: boolean
  message: string
  level: "info" | "warning" | "emergency"
  timestamp: number
  sender: string
}

export interface SlideItem {
  id: string
  title: string
  subtitle: string
  url: string
  category: string
  caption?: string
  mediaType?: "image" | "video"
  mediaFit?: "cover" | "contain"
  durationSeconds?: number
  fileName?: string
  /** Media lives in this browser's IndexedDB (local fallback only). */
  hasStoredBlob?: boolean
  /** Object path in the Supabase `signage-media` bucket; `url` is its public URL. */
  storagePath?: string
  /** Framing on the TV (see utils/slideLayout.ts). Focus point in %, zoom 1 = 100%. */
  focalX?: number
  focalY?: number
  zoom?: number
  background?: "blur" | "dark"
  showCaption?: boolean
}

export interface SignageState {
  version: number
  labs: {
    [key: number]: LabInfo
  }
  events: EventAnnouncement[]
  slides: SlideItem[]
  activeSlideIndex: number
  isCarouselPaused: boolean
  /** Courses tutors can be assigned to (managed by admins). Missing = DEFAULT_TUTOR_COURSES. */
  tutorCourses?: string[]
  urgentAlert: UrgentAlert | null
  lastAction: {
    type: string
    byClient: string
    clientRole: string
    timestamp: number
    description: string
    /** SyncEngine client id that made the change (used to ignore realtime echoes). */
    clientId?: string
  }
}

export interface ConnectedClient {
  id: string
  name: string
  role: "TV Display" | "Staff Controller" | "Admin Kiosk" | "Student View"
  lastSeen: number
  isCurrent?: boolean
}

export type SyncMessage =
  | { type: 'STATE_UPDATE'; state: SignageState; senderId: string }
  | { type: 'REQUEST_STATE'; senderId: string }
  | { type: 'CLIENT_HEARTBEAT'; client: ConnectedClient }
  | { type: 'CLIENT_DISCONNECT'; clientId: string }
  | { type: 'PING_PULSE'; senderId: string; senderName: string }
  | { type: 'MEDIA_SLIDE_BROADCAST'; slide: SlideItem; blob?: Blob; senderId: string };

// ==========================================
// USER, ACTION LOG & UPLOAD DATABASE MODELS
// ==========================================

export type UserRole =
  | "Super Admin"
  | "Department Chair"
  | "Lab Coordinator"
  | "Faculty/Staff"
  | "Student Assistant"

export type UserPermission =
  | "manage_labs"
  | "manage_events"
  | "upload_media"
  | "delete_media"
  | "broadcast_alerts"
  | "view_logs"
  | "manage_users"

export interface UserPermissionDefinition {
  id: UserPermission
  label: string
  description: string
  category: "labs" | "events" | "media" | "alerts" | "admin"
}

export const ALL_PERMISSIONS: UserPermissionDefinition[] = [
  {
    id: "manage_users",
    label: "Admin Portal & User Management",
    description: "Create, edit users and configure granular permissions",
    category: "admin",
  },
  {
    id: "manage_labs",
    label: "Lab Operations & Status",
    description: "Update Lab 126/127 Open/Closed status, lab hours, tutor shifts & classes",
    category: "labs",
  },
  {
    id: "manage_events",
    label: "Event Announcements",
    description: "Create, edit, delete, and import calendar events on the board",
    category: "events",
  },
  {
    id: "upload_media",
    label: "Upload Media Files",
    description: "Upload campus photos, videos, and flyers to TV rotation",
    category: "media",
  },
  {
    id: "delete_media",
    label: "Manage & Remove Media",
    description: "Reorder or delete slides from the center display",
    category: "media",
  },
  {
    id: "broadcast_alerts",
    label: "Emergency & Banner Broadcasts",
    description: "Trigger campus alerts, emergency broadcasts, or notices",
    category: "alerts",
  },
  {
    id: "view_logs",
    label: "View Action Audit Logs",
    description: "Review audit history and download activity logs (CSV/JSON)",
    category: "admin",
  },
]

export interface SignageUser {
  id: string
  username: string
  fullName: string
  email: string
  /** null = account exists but an admin hasn't assigned a role yet. */
  role: UserRole | null
  permissions: UserPermission[]
  department: string
  avatarColor?: string
  status: "active" | "inactive" | "suspended"
  createdAt: number
  lastLoginAt?: number
  notes?: string
}

export type ActionLogCategory =
  | "auth"
  | "lab"
  | "event"
  | "media"
  | "alert"
  | "user"
  | "system"

export type ActionLogSeverity = "info" | "success" | "warning" | "alert"

export interface ActionLog {
  id: string
  timestamp: number
  userId: string
  userName: string
  userRole: string
  actionType: string
  category: ActionLogCategory
  summary: string
  details?: Record<string, unknown> | string
  ipOrDevice?: string
  severity: ActionLogSeverity
}

export interface UploadRecord {
  id: string
  userId: string
  userName: string
  fileName: string
  fileSize: number
  formattedSize: string
  fileType: string
  mediaType: "image" | "video" | "document" | "ics"
  /** IndexedDB key (fallback) or Supabase Storage object path. */
  storageKey?: string
  /** Public URL (Supabase) or object URL (fallback). */
  previewUrl?: string
  associatedSlideId?: string
  associatedEventId?: string
  status: "active" | "archived" | "deleted"
  uploadedAt: number
  tags?: string[]
}

export interface DatabaseStats {
  totalUsers: number
  activeUsers: number
  totalLogs: number
  totalUploads: number
  totalStorageBytes: number
  storageFormatted: string
  imagesCount: number
  videosCount: number
}

