'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Textarea } from '@/design'
import { oc } from '@/lib/client'
import { FormDialog } from '../form-dialog'

export function AddLocation() {
  return (
    <FormDialog
      trigger="Add location"
      triggerTestId="add-location"
      title="Add a storage location"
      fields={[
        { name: 'name', label: 'Name', required: true, placeholder: 'Silo 2', testId: 'location-name' },
        {
          name: 'kind',
          label: 'Kind',
          type: 'select',
          required: true,
          options: [
            { value: 'silo', label: 'Silo' },
            { value: 'warehouse', label: 'Warehouse or shed' },
            { value: 'yard', label: 'Yard' },
            { value: 'customer-site', label: "Customer's site" },
            { value: 'other', label: 'Other' },
          ],
          testId: 'location-kind',
        },
      ]}
      submitLabel="Add location"
      submitTestId="location-submit"
      path="/storage"
    />
  )
}

/** Move units into this location: tick the ones to move. */
export function MoveHere({ to, name, candidates }: { to: string; name: string; candidates: { id: string; where: string; massKg: number }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (candidates.length === 0) return null
  return (
    <Dialog open={open} onOpenChange={(v) => (setOpen(v), setError(null), setPicked([]))}>
      <DialogTrigger asChild>
        <Button variant="quiet" data-testid="move-here">
          Move units here
        </Button>
      </DialogTrigger>
      <DialogContent title={`Move units to ${name}`} description="Each move is recorded in the unit's custody chain.">
        <div style={{ display: 'grid', gap: 'var(--sp-2)', maxHeight: 320, overflow: 'auto' }}>
          {candidates.map((c) => (
            <label key={c.id} style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', fontSize: 'var(--t-ui-sm)' }}>
              <input
                type="checkbox"
                data-testid="move-pick"
                value={c.id}
                checked={picked.includes(c.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
              />
              <span className="mono">{c.id}</span>
              <span className="muted">
                {Math.round(c.massKg)} kg, now {c.where}
              </span>
            </label>
          ))}
        </div>
        {error && <p style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end', marginTop: 'var(--sp-4)' }}>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="solid"
            disabled={busy || picked.length === 0}
            data-testid="move-submit"
            onClick={async () => {
              setBusy(true)
              const r = await oc(`/storage/${to}/transfer`, { body: { unitIds: picked } })
              setBusy(false)
              if (!r.ok) return setError(r.error)
              setOpen(false)
              router.refresh()
            }}
          >
            {busy ? 'Moving…' : `Move ${picked.length || ''}`.trim()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A stock count: the labels found on site, one per line or separated by commas. */
export function CountStock({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{ expected: number; found: number; missing: string[]; extra: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={(v) => (setOpen(v), setResult(null), setError(null), v || router.refresh())}>
      <DialogTrigger asChild>
        <Button variant="quiet" data-testid="count-stock">
          Count stock
        </Button>
      </DialogTrigger>
      <DialogContent title={`Count stock at ${name}`} description="Scan or type every unit label you find there.">
        {result ? (
          <div style={{ display: 'grid', gap: 'var(--sp-2)', fontSize: 'var(--t-ui-sm)' }} data-testid="count-result">
            <p style={{ margin: 0 }}>
              Found {result.found} of {result.expected} expected.
            </p>
            <p style={{ margin: 0 }}>{result.missing.length ? `Missing: ${result.missing.join(', ')}.` : 'Nothing missing.'}</p>
            <p style={{ margin: 0 }}>{result.extra.length ? `Not expected here: ${result.extra.join(', ')}.` : 'Nothing unexpected.'}</p>
          </div>
        ) : (
          <form
            style={{ display: 'grid', gap: 'var(--sp-4)' }}
            onSubmit={async (e) => {
              e.preventDefault()
              const found = String(new FormData(e.currentTarget).get('found') ?? '')
                .split(/[\s,]+/)
                .filter(Boolean)
              const r = await oc<{ expected: number; found: number; missing: string[]; extra: string[] }>(`/storage/${id}/counts`, { body: { found } })
              if (!r.ok || !r.data) return setError(r.error)
              setResult(r.data)
            }}
          >
            <Field label="Labels found">{(p) => <Textarea {...p} name="found" rows={5} placeholder={'U-0001\nU-0002'} data-testid="count-found" />}</Field>
            {error && <p style={{ color: 'var(--negative-ink)', margin: 0 }}>{error}</p>}
            <Button variant="solid" type="submit" data-testid="count-submit">
              Record the count
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
