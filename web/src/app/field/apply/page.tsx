'use client'

/**
 * Soil application, captured where the biochar goes into the ground. Works
 * offline like gate capture: the record waits on the phone, its photos, video
 * and signature in IndexedDB, and syncs as one event when there is signal.
 */
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, IconCamera, IconPin, Logo } from '@/design'
import { SINK_TYPES } from '@/lib/labels'
import { deleteMedia, getMedia, putMedia } from '../media'
import { ModeSwitch } from '../mode-switch'

type Dispatch = { id: string; toName: string; batch: string; leftKg: number }
type Point = [number, number]
type Record_ = {
  id: string
  capturedAt: string
  deviceId: string
  photos: number
  video: boolean
  payload: {
    applicationId: string
    dispatchId: string
    dispatchLabel: string
    farmName: string
    appliedMassKg: number
    areaHa: number | null
    gps: { lat: number; lng: number } | null
    boundary: Point[] | null
    declaration: { name: string; statement: string; signedAt: string } | null
    sink: string
  }
}

const OUTBOX = 'oc-field-apply-outbox-v1'
const DISPATCHES = 'oc-field-dispatches-v1'
const STATEMENT = 'I confirm that this biochar was spread on the land recorded here, and that it will not be burned or removed.'
const MAX_VIDEO = 15 * 1024 * 1024

const load = <T,>(k: string, f: T): T => {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : f
  } catch {
    return f
  }
}
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* the in-memory copy still works */
  }
}

/** Field area in hectares from the walked points (flat projection, fine at field scale). */
function areaHa(ring: Point[]): number {
  if (ring.length < 3) return 0
  const lat0 = (ring.reduce((n, p) => n + p[0], 0) / ring.length) * (Math.PI / 180)
  const R = 6371008.8
  const xy = ring.map(([la, ln]) => [((ln * Math.PI) / 180) * R * Math.cos(lat0), ((la * Math.PI) / 180) * R])
  let a = 0
  for (let i = 0; i < xy.length; i++) a += xy[i][0] * xy[(i + 1) % xy.length][1] - xy[(i + 1) % xy.length][0] * xy[i][1]
  return Math.abs(a) / 2 / 10000
}
const metres = (a: Point, b: Point) => {
  const R = 6371008.8
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = (((b[1] - a[1]) * Math.PI) / 180) * Math.cos((a[0] * Math.PI) / 180)
  return R * Math.hypot(dLat, dLng)
}

async function compress(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = rej
      el.src = url
    })
    const s = Math.min(1, 1600 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * s)
    c.height = Math.round(img.height * s)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.8))
  } finally {
    URL.revokeObjectURL(url)
  }
}

function Boundary({ points }: { points: Point[] }) {
  if (points.length < 2) return null
  const lats = points.map((p) => p[0])
  const lngs = points.map((p) => p[1])
  const [minLa, maxLa, minLn, maxLn] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const span = Math.max(maxLa - minLa, maxLn - minLn) || 1e-6
  const pts = points.map(([la, ln]) => `${((ln - minLn) / span) * 100},${100 - ((la - minLa) / span) * 100}`).join(' ')
  return (
    <svg viewBox="-6 -6 112 112" className="boundary-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {points.length >= 3 ? <polygon points={pts} /> : <polyline points={pts} />}
    </svg>
  )
}

export default function ApplyApp() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [outbox, setOutbox] = useState<Record_[]>([])
  const [online, setOnline] = useState(true)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [walking, setWalking] = useState(false)
  const [points, setPoints] = useState<Point[]>([])
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([])
  const [video, setVideo] = useState<File | null>(null)
  const [signed, setSigned] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const watch = useRef<number | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    setOutbox(load(OUTBOX, [] as Record_[]))
    setDispatches(load(DISPATCHES, [] as Dispatch[]))
    setOnline(navigator.onLine)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    addEventListener('online', up)
    addEventListener('offline', down)
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    fetch('/api/oc/dispatches/open')
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: Dispatch[] | null) => {
        if (rows) {
          setDispatches(rows)
          save(DISPATCHES, rows)
        }
      })
      .catch(() => undefined)
    return () => {
      removeEventListener('online', up)
      removeEventListener('offline', down)
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    }
  }, [])

  function pin() {
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGpsError('No GPS fix. Step into the open and try again.'),
      { enableHighAccuracy: true, timeout: 20000 }
    )
  }

  function walk() {
    if (walking) {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
      watch.current = null
      setWalking(false)
      if (points.length >= 3) setGpsError(null)
      return
    }
    setPoints([])
    setGpsError(null)
    setWalking(true)
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pt: Point = [p.coords.latitude, p.coords.longitude]
        setPoints((prev) => (prev.length && metres(prev[prev.length - 1], pt) < 3 ? prev : [...prev, pt]))
      },
      // A position error after the walk has stopped is not the operator's problem.
      () => {
        if (watch.current === id) setGpsError('Lost the GPS fix while walking. Stop, then walk the boundary again.')
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    )
    watch.current = id
  }

  // Signature pad: pointer events, so it works with a finger, a stylus or a mouse.
  function stroke(e: React.PointerEvent<HTMLCanvasElement>, phase: 'down' | 'move' | 'up') {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const r = c.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * c.width
    const y = ((e.clientY - r.top) / r.height) * c.height
    if (phase === 'down') {
      drawing.current = true
      c.setPointerCapture(e.pointerId)
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.strokeStyle = getComputedStyle(c).color
      ctx.beginPath()
      ctx.moveTo(x, y)
    } else if (phase === 'move' && drawing.current) {
      ctx.lineTo(x, y)
      ctx.stroke()
      setSigned(true)
    } else if (phase === 'up') drawing.current = false
  }
  function clearSignature() {
    const c = canvas.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setSigned(false)
  }

  async function capture(form: HTMLFormElement) {
    setError(null)
    const f = new FormData(form)
    const dispatch = dispatches.find((d) => d.id === f.get('dispatch'))
    const mass = Number(f.get('mass'))
    const farm = String(f.get('farm') ?? '').trim()
    const manualArea = Number(f.get('area')) || null
    const declarant = String(f.get('declarant') ?? '').trim()
    if (!dispatch) return setError('Choose the dispatch this biochar came from.')
    if (!farm || !(mass > 0)) return setError('Give the farm and the mass applied.')
    if (points.length < 3 && !manualArea) return setError('Walk the field boundary, or give the area in hectares.')
    if (!declarant || !signed || !f.get('confirm')) return setError('The farmer names themselves, confirms and signs.')
    const id = crypto.randomUUID()
    const signature = await new Promise<Blob>((res) => canvas.current!.toBlob((b) => res(b!), 'image/png'))
    await putMedia(`${id}:signature`, signature)
    for (const [i, p] of photos.entries()) await putMedia(`${id}:photo:${i}`, p.blob)
    if (video) await putMedia(`${id}:video`, video)
    const record: Record_ = {
      id,
      capturedAt: new Date().toISOString(),
      deviceId: load('oc-field-device', '') || (save('oc-field-device', crypto.randomUUID()), load('oc-field-device', 'device')),
      photos: photos.length,
      video: Boolean(video),
      payload: {
        applicationId: `APP-${id.slice(0, 8).toUpperCase()}`,
        dispatchId: dispatch.id,
        dispatchLabel: `${dispatch.batch} to ${dispatch.toName}`,
        farmName: farm,
        appliedMassKg: mass,
        areaHa: points.length >= 3 ? Math.round(areaHa(points) * 1000) / 1000 : manualArea,
        gps,
        boundary: points.length >= 3 ? points : null,
        declaration: { name: declarant, statement: STATEMENT, signedAt: new Date().toISOString() },
        sink: String(f.get('sink') || 'soil'),
      },
    }
    const next = [record, ...outbox]
    setOutbox(next)
    save(OUTBOX, next)
    form.reset()
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos([])
    setVideo(null)
    setPoints([])
    setGps(null)
    clearSignature()
  }

  async function sync() {
    setSyncing(true)
    setSyncError(null)
    const left: Record_[] = []
    for (const r of outbox) {
      try {
        const upload = async (key: string, kind: string, name: string) => {
          const blob = await getMedia(key)
          if (!blob) return null
          const fd = new FormData()
          fd.set('kind', kind)
          fd.set('title', `${r.payload.farmName}: ${name}`)
          fd.set('file', blob, name)
          const res = await fetch('/api/oc/sources/upload', { method: 'POST', body: fd })
          if (!res.ok) throw new Error('upload failed')
          return ((await res.json()) as { id: string }).id
        }
        const photoRefs: string[] = []
        for (let i = 0; i < r.photos; i++) {
          const ref = await upload(`${r.id}:photo:${i}`, 'application-evidence', `application photo ${i + 1}.jpg`)
          if (ref) photoRefs.push(ref)
        }
        const videoRef = r.video ? await upload(`${r.id}:video`, 'application-evidence', 'application video.mp4') : null
        const signatureRef = await upload(`${r.id}:signature`, 'declaration', 'signed declaration.png')
        const res = await fetch('/api/oc/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            events: [
              {
                id: r.id,
                kind: 'application-captured',
                capturedAt: r.capturedAt,
                deviceId: r.deviceId,
                payload: { ...r.payload, photoRefs, videoRef, declaration: r.payload.declaration && { ...r.payload.declaration, signatureRef } },
              },
            ],
          }),
        })
        const out = (await res.json().catch(() => ({}))) as { rejected?: { error: string }[] }
        if (!res.ok || out.rejected?.length) throw new Error(out.rejected?.[0]?.error ?? 'sync failed')
        await Promise.all([
          deleteMedia(`${r.id}:signature`),
          deleteMedia(`${r.id}:video`),
          ...Array.from({ length: r.photos }, (_, i) => deleteMedia(`${r.id}:photo:${i}`)),
        ])
      } catch (e) {
        left.push(r)
        setSyncError(`Not synced: ${(e as Error).message}. It stays on the phone.`)
      }
    }
    setOutbox(left)
    save(OUTBOX, left)
    setSyncing(false)
  }

  const ha = points.length >= 3 ? areaHa(points) : 0
  return (
    <div className="field-shell" data-offline-ready="true">
      <header className="field-head">
        <div className="field-brand">
          <Logo size={24} title="CarbonMarketsHQ" />
          <h1>Soil application</h1>
        </div>
        <span className="mono muted field-status" data-testid="apply-status">
          {!online ? 'Offline, saving here' : outbox.length > 0 ? `${outbox.length} to sync` : 'All records synced'}
        </span>
      </header>
      <ModeSwitch mode="apply" />

      <div style={{ display: 'grid', gap: 'var(--sp-6)', alignContent: 'start' }}>
        <form
          className="field-form"
          onSubmit={(e) => {
            e.preventDefault()
            void capture(e.currentTarget)
          }}
        >
          <div className="field-group">
            <label className="ui-label" htmlFor="dispatch">
              Biochar from
            </label>
            <select id="dispatch" name="dispatch" required className="ui-input" data-testid="apply-dispatch">
              {dispatches.length === 0 && <option value="">No dispatches waiting</option>}
              {dispatches.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.batch} to {d.toName}, {Math.round(d.leftKg)} kg left
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="ui-label" htmlFor="sink">
              Where it went
            </label>
            <select id="sink" name="sink" className="ui-input" defaultValue="soil" data-testid="apply-sink">
              {SINK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="ui-label" htmlFor="farm">
              Farm or field
            </label>
            <input id="farm" name="farm" required className="ui-input" data-testid="apply-farm" />
          </div>
          <div className="field-pair">
            <div className="field-group">
              <label className="ui-label" htmlFor="mass">
                Applied (kg)
              </label>
              <input id="mass" name="mass" type="number" inputMode="numeric" min="1" step="1" required className="ui-input" data-testid="apply-mass" />
            </div>
            <div className="field-group">
              <label className="ui-label" htmlFor="area">
                Area (ha)
              </label>
              <input
                id="area"
                name="area"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                className="ui-input"
                placeholder={ha ? ha.toFixed(2) : 'or walk it'}
                disabled={points.length >= 3}
                data-testid="apply-area"
              />
            </div>
          </div>

          <div className="boundary" data-testid="boundary">
            <Boundary points={points} />
            <div className="field-pair" style={{ alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 'var(--t-ui-sm)' }} data-testid="boundary-summary">
                {points.length === 0
                  ? 'Walk around the field with the phone to record its edge.'
                  : `${points.length} points${points.length >= 3 ? `, ${ha.toFixed(2)} ha` : ''}${walking ? ', walking' : ''}`}
              </span>
              <Button type="button" variant={walking ? 'solid' : 'outline'} onClick={walk} data-testid="apply-walk">
                {walking ? 'Finish boundary' : points.length >= 3 ? 'Walk again' : 'Walk the boundary'}
              </Button>
            </div>
          </div>

          <div className="field-pair">
            <Button type="button" variant="outline" onClick={pin} data-testid="apply-gps">
              <IconPin size={16} /> {gps ? 'GPS fixed' : 'Pin GPS'}
            </Button>
            <Button type="button" variant="outline" onClick={() => photoInput.current?.click()} data-testid="apply-photo">
              <IconCamera size={16} /> {photos.length ? `${photos.length} photos` : 'Take photos'}
            </Button>
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="u-sr"
            data-testid="apply-photo-input"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])].slice(0, 4 - photos.length)
              const added = await Promise.all(files.map(async (f) => ({ blob: await compress(f), url: URL.createObjectURL(f) })))
              setPhotos((p) => [...p, ...added].slice(0, 4))
              e.target.value = ''
            }}
          />
          {photos.length > 0 && (
            <div className="thumbs" data-testid="apply-thumbs">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.url} src={p.url} alt="" />
              ))}
            </div>
          )}
          <Button type="button" variant="ghost" onClick={() => videoInput.current?.click()} data-testid="apply-video">
            {video ? `Video: ${(video.size / 1024 / 1024).toFixed(1)} MB` : 'Add a short video (optional)'}
          </Button>
          <input
            ref={videoInput}
            type="file"
            accept="video/*"
            capture="environment"
            className="u-sr"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              if (f && f.size > MAX_VIDEO) setError('That video is over 15 MB. Record a shorter one.')
              else setVideo(f)
              e.target.value = ''
            }}
          />
          {gpsError && <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>{gpsError}</p>}

          <fieldset className="field-group" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="ui-label">Farmer&rsquo;s declaration</legend>
            <p className="muted" style={{ margin: '0 0 var(--sp-2)', fontSize: 'var(--t-ui-sm)' }}>
              {STATEMENT}
            </p>
            <input name="declarant" placeholder="Farmer's full name" className="ui-input" data-testid="apply-declarant" />
            <label style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', fontSize: 'var(--t-ui-sm)', margin: 'var(--sp-2) 0' }}>
              <input type="checkbox" name="confirm" data-testid="apply-confirm" /> The farmer confirms this
            </label>
            <span className="ui-label" style={{ marginTop: 'var(--sp-2)' }}>
              Signature
            </span>
            <canvas
              ref={canvas}
              width={600}
              height={200}
              className="signature"
              aria-label="Signature"
              data-testid="apply-signature"
              onPointerDown={(e) => stroke(e, 'down')}
              onPointerMove={(e) => stroke(e, 'move')}
              onPointerUp={(e) => stroke(e, 'up')}
            />
            {signed && (
              <Button type="button" variant="quiet" onClick={clearSignature}>
                Clear signature
              </Button>
            )}
          </fieldset>

          {error && (
            <p style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }} data-testid="apply-error">
              {error}
            </p>
          )}
          <Button type="submit" variant="solid" size="lg" data-testid="apply-capture">
            Save application
          </Button>
        </form>

        <section className="outbox" aria-label="Outbox">
          <div className="field-head">
            <h2 className="section-title" style={{ margin: 0 }}>
              Outbox
            </h2>
            <Button variant="outline" size="sm" disabled={syncing || outbox.length === 0 || !online} onClick={() => void sync()} data-testid="apply-sync">
              {syncing ? 'Syncing…' : `Sync ${outbox.length || ''}`.trim()}
            </Button>
          </div>
          {syncError && <p style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>{syncError}</p>}
          {outbox.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
              Nothing waiting.
            </p>
          ) : (
            outbox.map((r) => (
              <article className="outbox-item" key={r.id} data-testid="apply-outbox-item" style={{ gridTemplateColumns: '1fr auto' }}>
                <div className="outbox-meta" style={{ display: 'grid', gap: 2, fontSize: 'var(--t-ui-sm)' }}>
                  <b>{r.payload.farmName}</b>
                  <span className="muted">
                    {r.payload.appliedMassKg} kg, {r.payload.areaHa} ha · {r.payload.dispatchLabel}
                  </span>
                </div>
                <Badge tone="caution" variant="dashed">
                  Sync pending
                </Badge>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
