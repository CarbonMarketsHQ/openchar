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

export const DOWNTIME_CAUSES: { value: string; label: string }[] = [
  { value: 'planned-maintenance', label: 'Planned maintenance' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'feedstock-shortage', label: 'Feedstock shortage' },
  { value: 'power-outage', label: 'Power outage' },
  { value: 'weather', label: 'Weather' },
  { value: 'quality-hold', label: 'Quality hold' },
  { value: 'other', label: 'Other' },
]

export function causeLabel(value: string): string {
  return DOWNTIME_CAUSES.find((c) => c.value === value)?.label ?? statusLabel(value)
}

/** 95 → "1 h 35 min", 720 → "12 h", 40 → "40 min". */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
