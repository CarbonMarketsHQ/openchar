'use client'

/**
 * The aggregation-centre app. Offline-first by construction (R-8W08-0):
 * captures, including compressed photos, are held locally with their
 * timestamps, survive reloads through localStorage and a service worker,
 * and sync at the plant when connectivity returns. On sync each photo is
 * uploaded as an evidence record first, so the hash-chained event carries
 * the evidence reference, not the pixels.
 */
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, IconCamera, IconPin, Logo } from '@/design'

type Supplier = { id: string; name: string }

const MATERIAL: Record<string, string> = {
  'crop-residue': 'Crop residue',
  'forestry-residue': 'Forestry residue',
  'processing-offcut': 'Processing offcut',
  'agri-residue': 'Agri-residue',
}
type OutboxRecord = {
  id: string
  kind: 'consignment-captured'
  capturedAt: string
  deviceId: string
  photoData: string | null
  payload: {
    consignmentId: string
    supplierId: string
    supplierName: string
    estMassKg: number
    moistureFrac: number
    category: string
    gps: { lat: number; lng: number } | null
    photoRef: string | null
  }
}

const OUTBOX_KEY = 'oc-field-outbox-v2'
const SUPPLIERS_KEY = 'oc-field-suppliers-v2'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage may be unavailable; the in-memory copy still works */
  }
}

async function compressImage(file: File, maxEdge = 1600, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, data] = dataUrl.split(',')
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export default function FieldApp() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [outbox, setOutbox] = useState<OutboxRecord[]>([])
  const [online, setOnline] = useState(true)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setOutbox(load(OUTBOX_KEY, [] as OutboxRecord[]))
    setSuppliers(load(SUPPLIERS_KEY, [] as Supplier[]))
    setOnline(navigator.onLine)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    if ('serviceWorker' in navigator) {
      const primed = new Set<string>()
      const refetch = (urls: string[]) =>
        Promise.all(
          urls
            .filter((u) => u.startsWith(location.origin) && !u.includes('/api/') && !primed.has(u))
            .map((u) => {
              primed.add(u)
              return fetch(u).catch(() => undefined)
            })
        )
      const prime = async () => {
        try {
          await fetch(location.pathname, { cache: 'no-store' })
          await refetch(performance.getEntriesByType('resource').map((e) => e.name))
          new PerformanceObserver((list) => {
            void refetch(list.getEntries().map((e) => e.name))
          }).observe({ entryTypes: ['resource'] })
          setOfflineReady(true)
        } catch {
          /* stays not-ready */
        }
      }
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          if (navigator.serviceWorker.controller) return prime()
          navigator.serviceWorker.addEventListener('controllerchange', () => prime(), { once: true })
        })
        .catch(() => undefined)
    }
    fetch('/api/oc/suppliers')
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: Supplier[] | null) => {
        if (rows) {
          setSuppliers(rows)
          save(SUPPLIERS_KEY, rows)
        }
      })
      .catch(() => undefined)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  function capture(form: HTMLFormElement) {
    const data = new FormData(form)
    const supplierId = String(data.get('supplier'))
    const supplier = suppliers.find((s) => s.id === supplierId)
    const massKg = Number(data.get('mass'))
    if (!supplier || !massKg) return
    const record: OutboxRecord = {
      id: 'EV-' + crypto.randomUUID().slice(0, 13),
      kind: 'consignment-captured',
      capturedAt: new Date().toISOString(),
      deviceId: 'field-web-01',
      photoData: photo,
      payload: {
        consignmentId: 'CN-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
        supplierId,
        supplierName: supplier.name,
        estMassKg: massKg,
        moistureFrac: Number(data.get('moisture')) / 100,
        category: String(data.get('category')),
        gps,
        photoRef: null,
      },
    }
    const next = [record, ...outbox]
    setOutbox(next)
    save(OUTBOX_KEY, next)
    setGps(null)
    setPhoto(null)
    form.reset()
  }

  async function sync() {
    if (outbox.length === 0) return
    setSyncing(true)
    setSyncError(null)
    try {
      const events = []
      for (const record of outbox) {
        let photoRef = record.payload.photoRef
        if (record.photoData && !photoRef) {
          const fd = new FormData()
          fd.append('kind', 'field-photo')
          fd.append('title', `Consignment ${record.payload.consignmentId} photo`)
          fd.append('file', dataUrlToBlob(record.photoData), `${record.payload.consignmentId}.jpg`)
          const up = await fetch('/api/oc/sources/upload', { method: 'POST', body: fd })
          if (!up.ok) throw new Error('photo upload failed')
          photoRef = ((await up.json()) as { id: string }).id
        }
        const { supplierName: _name, ...payload } = record.payload
        events.push({
          id: record.id,
          kind: record.kind,
          capturedAt: record.capturedAt,
          deviceId: record.deviceId,
          payload: { ...payload, photoRef },
        })
      }
      const res = await fetch('/api/oc/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setOutbox([])
      save(OUTBOX_KEY, [])
    } catch {
      setSyncError('Sync did not go through. The records are safe on this phone. Try again at the plant.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="field-shell" data-offline-ready={offlineReady}>
      <header className="field-head">
        <div className="field-brand">
          <Logo size={24} title="CarbonMarketsHQ" />
          <h1>Field capture</h1>
        </div>
        <span className="mono muted" style={{ fontSize: 'var(--t-caption)' }}>
          {!online
            ? 'Offline, capturing locally'
            : outbox.length > 0
              ? `${outbox.length} to sync`
              : 'All records synced'}
        </span>
      </header>

      <div style={{ display: 'grid', gap: 'var(--sp-6)', alignContent: 'start' }}>
        <form
          className="field-form"
          onSubmit={(e) => {
            e.preventDefault()
            capture(e.currentTarget)
          }}
        >
          <div className="field-group">
          <label className="ui-label" htmlFor="supplier">
            Supplier
          </label>
          <select id="supplier" name="supplier" required className="ui-input" data-testid="field-supplier">
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          </div>

          <div className="field-pair">
          <div className="field-group">
          <label className="ui-label" htmlFor="mass">
            Mass (kg)
          </label>
          <input
            id="mass"
            name="mass"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            required
            className="ui-input"
            data-testid="field-mass"
          />
          </div>

          <div className="field-group">
          <label className="ui-label" htmlFor="moisture">
            Moisture (%)
          </label>
          <input
            id="moisture"
            name="moisture"
            type="number"
            inputMode="decimal"
            min="0"
            max="60"
            step="0.5"
            required
            className="ui-input"
            data-testid="field-moisture"
          />
          </div>
          </div>

          <div className="field-group">
          <label className="ui-label" htmlFor="category">
            Material
          </label>
          <select id="category" name="category" required className="ui-input" data-testid="field-category">
            <option value="crop-residue">Crop residue (no commercial use)</option>
            <option value="forestry-residue">Forestry residue</option>
            <option value="processing-offcut">Processing-unit offcut</option>
            <option value="agri-residue">Other agri-residue</option>
          </select>
          </div>

          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="u-sr"
            data-testid="field-photo-input"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                setPhoto(await compressImage(file))
              } catch {
                setPhoto(null)
              }
              e.target.value = ''
            }}
          />
          <div className="field-actions">
            <Button
              type="button"
              variant="outline"
              data-testid="field-gps"
              disabled={locating}
              onClick={() => {
                // A position is evidence: never fill one in. Without a fix the
                // capture goes ahead with no GPS and says so.
                setGpsError(null)
                if (!('geolocation' in navigator)) return setGpsError('This phone cannot report its location.')
                setLocating(true)
                navigator.geolocation.getCurrentPosition(
                  (p) => {
                    setLocating(false)
                    setGps({ lat: p.coords.latitude, lng: p.coords.longitude })
                  },
                  () => {
                    setLocating(false)
                    setGpsError('No GPS fix. Allow location access, step into the open and try again.')
                  },
                  { timeout: 10000, enableHighAccuracy: true }
                )
              }}
            >
              <IconPin />
              {locating ? 'Locating…' : gps ? 'GPS fixed' : 'Pin GPS'}
            </Button>
            <Button type="button" variant="outline" data-testid="field-photo" onClick={() => photoInput.current?.click()}>
              <IconCamera />
              {photo ? 'Retake photo' : 'Take photo'}
            </Button>
          </div>
          {gps && !photo && (
            <p className="mono muted" data-testid="field-gps-fix" style={{ margin: 0, fontSize: 'var(--t-caption)' }}>
              Fixed at {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}
            </p>
          )}
          {gpsError && (
            <p className="muted" data-testid="field-gps-error" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
              {gpsError}
            </p>
          )}
          {photo && (
            <figure className="field-photo" data-testid="field-photo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Consignment, about to be captured" />
              <figcaption className="mono">
                {gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : 'No GPS yet'} ·{' '}
                {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </figcaption>
            </figure>
          )}

          <Button type="submit" variant="solid" size="lg" data-testid="field-capture">
            Capture consignment
          </Button>
        </form>

        <section className="outbox" aria-label="Outbox">
          <div className="field-head">
            <h2 className="section-title" style={{ margin: 0 }}>
              Outbox
            </h2>
            <Button
              variant="outline"
              size="sm"
              data-testid="field-sync"
              disabled={syncing || outbox.length === 0}
              onClick={sync}
            >
              {syncing ? 'Syncing…' : `Sync ${outbox.length || ''}`.trim()}
            </Button>
          </div>
          {syncError && (
            <p style={{ color: 'var(--caution-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>{syncError}</p>
          )}
          {outbox.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
              Nothing waiting. Captures hold here until the plant's connection takes them.
            </p>
          ) : (
            outbox.map((e) => (
              <article className="outbox-item" data-testid="outbox-item" key={e.id}>
                {e.photoData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="outbox-thumb" src={e.photoData} alt="" />
                ) : (
                  <span className="outbox-thumb outbox-thumb--empty" aria-hidden="true" />
                )}
                <div className="outbox-body">
                  <div className="row">
                    <b>{e.payload.supplierName}</b>
                    <span className="mono" data-testid="field-timestamp">
                      {new Date(e.capturedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className="outbox-meta">
                    <span className="mono">{Math.round(e.payload.estMassKg)} kg</span> ·{' '}
                    {MATERIAL[e.payload.category] ?? e.payload.category}
                  </span>
                  <div className="row">
                    <span className="outbox-flags">
                      <span data-on={!!e.payload.gps}>
                        <IconPin size={14} /> {e.payload.gps ? 'GPS' : 'No GPS'}
                      </span>
                      <span data-on={!!e.photoData}>
                        <IconCamera size={14} /> {e.photoData ? 'Photo' : 'No photo'}
                      </span>
                    </span>
                    <Badge tone="caution" variant="dashed" data-testid="outbox-state">
                      Sync pending
                    </Badge>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
