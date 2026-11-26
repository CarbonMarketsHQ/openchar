/** Human labels for machine status values. Sentence case, never raw slugs. */
const LABELS: Record<string, string> = {
  open: 'Open',
  sampled: 'Sampled',
  'awaiting-lab': 'Awaiting lab',
  received: 'Received',
  attached: 'Attached',
  analyzed: 'Analyzed',
  'at-lab': 'At lab',
  pass: 'Pass',
  warn: 'Warn',
  fail: 'Fail',
  mock: 'Mock',
  closed: 'Closed',
}

export function statusLabel(value: string): string {
  if (LABELS[value]) return LABELS[value]
  const cleaned = value.replace(/[-_]/g, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** Document types, in the order the upload dialog offers them. */
export const DOC_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'supplier-declaration', label: 'Supplier declaration', hint: 'Feedstock origin and eligibility, signed by the supplier' },
  { value: 'land-record', label: 'Land record', hint: 'Ownership or lease of the land the feedstock came from' },
  { value: 'invoice', label: 'Invoice', hint: 'Feedstock purchase, transport or biochar sale' },
  { value: 'weighbridge-slip', label: 'Weighbridge slip', hint: 'A photo or scan of the slip' },
  { value: 'lab-certificate', label: 'Lab certificate', hint: 'Analysis from an accredited laboratory' },
  { value: 'calibration', label: 'Calibration record', hint: 'Scales, thermocouples, moisture meters' },
  { value: 'permit', label: 'Permit', hint: 'Operating, environmental or land-use permits' },
  { value: 'other', label: 'Other', hint: 'Anything else a verifier may ask for' },
]

export function docTypeLabel(value: string): string {
  return DOC_TYPES.find((t) => t.value === value)?.label ?? statusLabel(value)
}

export const RECORD_LABELS: Record<string, string> = {
  consignment: 'Consignment',
  lot: 'Lot',
  batch: 'Batch',
  facility: 'Facility',
}

/** Where a record lives in the console. */
export function recordHref(kind: string, id: string): string {
  if (kind === 'batch') return `/console/batches/${encodeURIComponent(id)}`
  if (kind === 'facility') return `/console/facilities#facility-${encodeURIComponent(id)}`
  return `/console/gate#${kind}-${encodeURIComponent(id)}`
}
