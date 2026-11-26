'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Input, Textarea } from '@/design'
import { IconPaperclip } from '@/design/icons'
import { DOC_TYPES, RECORD_LABELS } from '@/lib/labels'

export type RecordOption = { kind: 'consignment' | 'lot' | 'batch' | 'facility'; id: string; label: string }

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Upload one document of a known type, optionally attached to a
 * consignment, lot or batch. With `fixed`, the record is set by the page. */
export function AddDocument({
  records = [],
  fixed,
  defaultType,
  variant = 'solid',
}: {
  records?: RecordOption[]
  fixed?: { kind: RecordOption['kind']; id: string }
  defaultType?: string
  variant?: 'solid' | 'outline'
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState(defaultType ?? DOC_TYPES[0].value)

  async function submit(form: HTMLFormElement) {
    if (!file) return setError('Choose a file to upload.')
    const fd = new FormData()
    fd.set('type', type)
    fd.set('title', String(new FormData(form).get('title') ?? ''))
    fd.set('note', String(new FormData(form).get('note') ?? ''))
    const record = fixed ? `${fixed.kind}:${fixed.id}` : String(new FormData(form).get('record') ?? '')
    if (record) {
      const [kind, ...rest] = record.split(':')
      fd.set('recordKind', kind)
      fd.set('recordId', rest.join(':'))
    }
    fd.set('file', file)
    setBusy(true)
    setError(null)
    const res = await fetch('/api/oc/documents', { method: 'POST', body: fd }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res || !res.ok) return setError((data as { error?: string }).error ?? 'The upload did not go through. Try again.')
    setOpen(false)
    setFile(null)
    router.refresh()
  }

  const hint = DOC_TYPES.find((t) => t.value === type)?.hint
  const groups = (['consignment', 'lot', 'batch', 'facility'] as const)
    .map((k) => ({ kind: k, items: records.filter((r) => r.kind === k) }))
    .filter((g) => g.items.length > 0)

  return (
    <Dialog open={open} onOpenChange={(v) => (setOpen(v), setError(null))}>
      <DialogTrigger asChild>
        <Button variant={variant} data-testid="add-document">
          Add document
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a document"
        description={
          fixed
            ? `Attached to ${RECORD_LABELS[fixed.kind].toLowerCase()} ${fixed.id}. The file is stored with its SHA-256 hash.`
            : 'The file is stored with its SHA-256 hash, so any later change to it would show.'
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit(e.currentTarget)
          }}
          style={{ display: 'grid', gap: 'var(--sp-4)' }}
        >
          <Field label="Type" hint={hint} required>
            {(p) => (
              <select
                {...p}
                name="type"
                required
                className="ui-input"
                value={type}
                onChange={(e) => setType(e.target.value)}
                data-testid="doc-type"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="File" hint="PDF, image, spreadsheet or document, up to 15 MB" required>
            {(p) => (
              <div className="file-pick">
                <input
                  {...p}
                  ref={fileInput}
                  type="file"
                  className="u-sr"
                  accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.csv,.xlsx,.xls,.docx,.doc"
                  data-testid="doc-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    if (f && f.size > 15 * 1024 * 1024) {
                      setError('That file is over 15 MB.')
                      e.target.value = ''
                      return
                    }
                    setError(null)
                    setFile(f)
                  }}
                />
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  <IconPaperclip size={16} />
                  {file ? 'Choose another' : 'Choose a file'}
                </Button>
                <span className={file ? 'file-pick-name' : 'file-pick-name muted'} data-testid="doc-file-name">
                  {file ? `${file.name} · ${fmtSize(file.size)}` : 'No file chosen'}
                </span>
              </div>
            )}
          </Field>

          <Field label="Title" hint="Leave empty to use the file name">
            {(p) => <Input {...p} name="title" maxLength={200} data-testid="doc-title" />}
          </Field>

          {!fixed && (
            <Field label="Attach to" hint="The record this document is evidence for">
              {(p) => (
                <select {...p} name="record" className="ui-input" defaultValue="" data-testid="doc-record">
                  <option value="">Not attached yet</option>
                  {groups.map((g) => (
                    <optgroup key={g.kind} label={g.kind === 'facility' ? 'Facilities' : `${RECORD_LABELS[g.kind]}s`}>
                      {g.items.map((r) => (
                        <option key={`${r.kind}:${r.id}`} value={`${r.kind}:${r.id}`}>
                          {r.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </Field>
          )}

          <Field label="Note">
            {(p) => <Textarea {...p} name="note" rows={2} data-testid="doc-note" />}
          </Field>

          {error && (
            <p style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }} data-testid="doc-error">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="solid" type="submit" disabled={busy} data-testid="doc-submit">
              {busy ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
