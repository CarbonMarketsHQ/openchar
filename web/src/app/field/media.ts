/**
 * Photos, video and signatures waiting to sync, kept in IndexedDB. Local
 * storage holds a few megabytes at most, which a short video alone exceeds.
 */
const DB = 'oc-field'
const STORE = 'media'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const r = run(db.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export const putMedia = (key: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, key))
export const getMedia = (key: string) => tx<Blob | undefined>('readonly', (s) => s.get(key))
export const deleteMedia = (key: string) => tx('readwrite', (s) => s.delete(key))
