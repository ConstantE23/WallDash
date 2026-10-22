/**
 * Media storage for photos and videos uploaded to digital signage.
 *
 * With Supabase configured, files go straight from the browser to the public
 * `signage-media` Storage bucket (Storage RLS enforces staff auth) and slides keep
 * the public URL. Without Supabase, the original IndexedDB store is used as a
 * same-browser fallback.
 */

import {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  MEDIA_BUCKET,
  MAX_UPLOAD_BYTES,
} from "./supabaseClient"

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"]

/**
 * Returns a user-facing error message if the file can't be uploaded, otherwise null.
 * Mirrors the bucket's file_size_limit and allowed_mime_types.
 */
export function validateMediaFile(file: File): string | null {
  const isVideo = file.type.startsWith("video/")
  if (file.size > MAX_UPLOAD_BYTES) {
    return isVideo
      ? "Videos must be under 50 MB — compress or trim the clip."
      : "Files must be under 50 MB — export a smaller image."
  }
  if (isVideo && !ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return "Unsupported video format. Use MP4, WebM or MOV."
  }
  if (!isVideo && !file.type.startsWith("image/")) {
    return "Only image and video files can be uploaded."
  }
  return null
}

export interface UploadedMedia {
  url: string
  /** Object path inside the signage-media bucket (Supabase only). */
  storagePath?: string
  /** True when the file lives in this browser's IndexedDB (fallback only). */
  hasStoredBlob?: boolean
}

function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return cleaned.slice(-100) || "upload"
}

/**
 * Upload a slide's photo or video. Uses Supabase Storage when configured, otherwise
 * IndexedDB. `onProgress` receives 0–100 while uploading to Supabase.
 */
export async function uploadSlideMedia(
  slideId: string,
  file: Blob,
  fileName: string,
  onProgress?: (percent: number) => void,
): Promise<UploadedMedia> {
  if (!supabase) {
    const url = await saveMedia(slideId, file, fileName)
    return { url, hasStoredBlob: true }
  }

  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) {
    throw new Error("Your session has expired. Please sign in again.")
  }

  const storagePath = `slides/${slideId}/${Date.now()}-${safeFileName(fileName)}`
  await putObjectWithProgress(storagePath, file, accessToken, onProgress)

  const { data: publicData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(storagePath)
  return { url: publicData.publicUrl, storagePath }
}

/**
 * Same request supabase-js makes for `storage.from(bucket).upload(path, file, { cacheControl })`,
 * done with XHR so we can report upload progress. Paths are unique, so the object is
 * immutable and can be cached by screens for a year.
 */
function putObjectWithProgress(
  storagePath: string,
  file: Blob,
  accessToken: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/")
  const endpoint = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/${MEDIA_BUCKET}/${encodedPath}`

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", endpoint)
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`)
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.setRequestHeader("Cache-Control", "max-age=31536000")
    xhr.setRequestHeader("x-upsert", "false")

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve()
        return
      }
      let message = `Upload failed (HTTP ${xhr.status}).`
      try {
        const body = JSON.parse(xhr.responseText)
        if (body?.message) message = `Upload failed: ${body.message}`
      } catch {
        // non-JSON error body
      }
      if (xhr.status === 413) {
        message = "Videos must be under 50 MB — compress or trim the clip."
      }
      reject(new Error(message))
    }
    xhr.onerror = () =>
      reject(new Error("Upload failed: network error. Check your connection and retry."))
    xhr.send(file)
  })
}

/**
 * Remove a slide's media from wherever it was stored.
 */
export async function deleteSlideMedia(slide: {
  id: string
  storagePath?: string
  hasStoredBlob?: boolean
}): Promise<void> {
  if (slide.storagePath && supabase) {
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .remove([slide.storagePath])
    if (error) throw new Error(`Could not delete media from storage: ${error.message}`)
  } else if (slide.hasStoredBlob) {
    await deleteMedia(slide.id)
  }
}

const DB_NAME = "hampton_cs_media_store_v1"
const DB_VERSION = 1
const STORE_NAME = "media_blobs"

interface StoredMediaRecord {
  id: string
  blob: Blob
  mimeType: string
  fileName: string
  timestamp: number
}

let dbInstance: IDBDatabase | null = null
const objectUrlCache = new Map<string, string>()

async function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB is not supported in this environment")
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Save a media blob (photo or video) to IndexedDB and return an object URL.
 */
export async function saveMedia(
  id: string,
  blob: Blob,
  fileName = "media",
): Promise<string> {
  try {
    const db = await openDb()
    const record: StoredMediaRecord = {
      id,
      blob,
      mimeType: blob.type,
      fileName,
      timestamp: Date.now(),
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(record)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn("Could not persist media to IndexedDB:", err)
  }

  // Create & cache Object URL
  if (objectUrlCache.has(id)) {
    try {
      URL.revokeObjectURL(objectUrlCache.get(id)!)
    } catch {
      // ignore
    }
  }
  const url = URL.createObjectURL(blob)
  objectUrlCache.set(id, url)
  return url
}

/**
 * Retrieve a media blob from IndexedDB.
 */
export async function getMedia(id: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(id)
      req.onsuccess = () => {
        const record = req.result as StoredMediaRecord | undefined
        resolve(record ? record.blob : null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn("Error reading from IndexedDB:", err)
    return null
  }
}

/**
 * Get or regenerate an Object URL for a given media ID.
 */
export async function getMediaUrl(id: string): Promise<string | null> {
  if (objectUrlCache.has(id)) {
    return objectUrlCache.get(id)!
  }
  const blob = await getMedia(id)
  if (blob) {
    const url = URL.createObjectURL(blob)
    objectUrlCache.set(id, url)
    return url
  }
  return null
}

/**
 * Delete a media item from IndexedDB and release its object URL.
 */
export async function deleteMedia(id: string): Promise<void> {
  if (objectUrlCache.has(id)) {
    try {
      URL.revokeObjectURL(objectUrlCache.get(id)!)
    } catch {
      // ignore
    }
    objectUrlCache.delete(id)
  }

  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn("Error deleting from IndexedDB:", err)
  }
}
