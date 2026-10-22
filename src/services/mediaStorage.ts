/**
 * Persistent IndexedDB media storage for photos and videos uploaded to digital signage.
 * Supports large binary files (MP4, WebM, high-res photos) without exhausting localStorage quotas.
 */

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
