'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
} from '@/design'
import { oc } from '@/lib/client'
import type { Consignment } from '@/lib/api'

export function NewLot({ pending }: { pending: Consignment[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(form: FormData) {
    setBusy(true)
    setError(null)
    const res = await oc('/lots', {
      body: {
        consignmentId: String(form.get('consignmentId')),
        weighbridgeSlipKg: Number(form.get('weighbridgeSlipKg')),
        moistureFrac: Number(form.get('moisturePct')) / 100,
      },
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'The lot could not be saved.')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="solid" data-testid="gate-new-lot">
          Receive into lot
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Receive a consignment into an intake lot"
        description="The hopper scale reading comes from the field capture; add the weighbridge slip so both masses sit side by side."
      >
        <form
          action={submit}
          style={{ display: 'grid', gap: 'var(--sp-4)' }}
        >
          <Field label="Consignment">
            {(p) => (
              <select {...p} name="consignmentId" required className="ui-input" data-testid="lot-consignment">
                {pending.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.supplierName} · {Math.round(c.estMassKg)} kg
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Weighbridge slip mass (kg)" hint="From the nearby weighbridge; photograph the slip.">
            {(p) => (
              <Input
                {...p}
                name="weighbridgeSlipKg"
                type="number"
                step="1"
                min="1"
                required
                data-testid="lot-weighbridge-mass"
              />
            )}
          </Field>
          <Field label="Moisture at intake (%)">
            {(p) => (
              <Input {...p} name="moisturePct" type="number" step="0.5" min="0" max="60" required data-testid="lot-moisture" />
            )}
          </Field>
          {error && <p style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="solid" type="submit" disabled={busy || pending.length === 0} data-testid="lot-save">
              {busy ? 'Saving…' : 'Save lot'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
