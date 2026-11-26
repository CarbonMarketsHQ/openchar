'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Input, Textarea } from '@/design'
import { oc } from '@/lib/client'

export type FieldSpec = {
  name: string
  label: string
  type?: 'text' | 'number' | 'select' | 'date' | 'textarea'
  options?: { value: string; label: string }[]
  step?: string
  min?: string
  max?: string
  required?: boolean
  hint?: string
  placeholder?: string
  defaultValue?: string
  testId?: string
}

/**
 * A declarative write dialog: fields in, one POST/PATCH/PUT out, refresh on
 * success. Keeps every creation and edit flow consistent — same layout,
 * same error handling, same keyboard behaviour (Radix dialog underneath).
 */
export function FormDialog({
  trigger,
  triggerVariant = 'solid',
  triggerTestId,
  title,
  description,
  fields,
  submitLabel,
  submitTestId,
  path,
  method = 'POST',
  transform,
  onDone,
  children,
}: {
  trigger: ReactNode
  triggerVariant?: 'solid' | 'outline' | 'ghost'
  triggerTestId?: string
  title: string
  description?: string
  fields: FieldSpec[]
  submitLabel?: string
  submitTestId?: string
  path: string
  method?: 'POST' | 'PATCH' | 'PUT'
  /** Map the raw string form values to the request body. */
  transform?: (values: Record<string, string>) => Record<string, unknown>
  onDone?: (data: unknown) => void
  children?: ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(formData: FormData) {
    const values: Record<string, string> = {}
    for (const f of fields) values[f.name] = String(formData.get(f.name) ?? '')
    setBusy(true)
    setError(null)
    const body = transform ? transform(values) : values
    const r = await oc(path, { method, body })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setOpen(false)
    onDone?.(r.data)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (setOpen(v), setError(null))}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} data-testid={triggerTestId}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit(new FormData(e.currentTarget))
          }}
          style={{ display: 'grid', gap: 'var(--sp-4)' }}
        >
          {fields.map((f) => (
            <Field key={f.name} label={f.label} hint={f.hint} required={f.required}>
              {(p) =>
                f.type === 'select' ? (
                  <select {...p} name={f.name} required={f.required} className="ui-input" data-testid={f.testId} defaultValue={f.defaultValue}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'textarea' ? (
                  <Textarea {...p} name={f.name} required={f.required} rows={3} data-testid={f.testId} defaultValue={f.defaultValue} placeholder={f.placeholder} />
                ) : (
                  <Input
                    {...p}
                    name={f.name}
                    type={f.type ?? 'text'}
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    required={f.required}
                    data-testid={f.testId}
                    defaultValue={f.defaultValue}
                    placeholder={f.placeholder}
                  />
                )
              }
            </Field>
          ))}
          {children}
          {error && <p style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="solid" type="submit" disabled={busy} data-testid={submitTestId}>
              {busy ? 'Saving…' : (submitLabel ?? 'Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
