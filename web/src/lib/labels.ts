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
  'bio-liquid': 'Bio-liquid',
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

export const INSTRUMENT_KINDS: { value: string; label: string }[] = [
  { value: 'scale', label: 'Scale' },
  { value: 'thermocouple', label: 'Thermocouple' },
  { value: 'moisture-meter', label: 'Moisture meter' },
  { value: 'flow-meter', label: 'Flow meter' },
  { value: 'energy-meter', label: 'Energy meter' },
  { value: 'gas-analyser', label: 'Gas analyser' },
  { value: 'other', label: 'Other' },
]

export function instrumentKindLabel(value: string): string {
  return INSTRUMENT_KINDS.find((k) => k.value === value)?.label ?? statusLabel(value)
}

export const CALIBRATION_STATE: Record<string, { label: string; tone: 'positive' | 'caution' | 'negative' }> = {
  current: { label: 'In calibration', tone: 'positive' },
  'due-soon': { label: 'Due soon', tone: 'caution' },
  overdue: { label: 'Lapsed', tone: 'negative' },
  never: { label: 'Never calibrated', tone: 'caution' },
  failed: { label: 'Failed', tone: 'negative' },
}

export const CALIBRATION_RESULTS: { value: string; label: string }[] = [
  { value: 'pass', label: 'Pass, no adjustment' },
  { value: 'adjusted', label: 'Pass after adjustment' },
  { value: 'fail', label: 'Fail, take out of use' },
]

/** "in 20 days", "today", "10 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

export const FUELS: { value: string; label: string; unit: string }[] = [
  { value: 'diesel', label: 'Diesel', unit: 'l' },
  { value: 'petrol', label: 'Petrol', unit: 'l' },
  { value: 'lpg', label: 'LPG', unit: 'kg' },
  { value: 'biomass', label: 'Biomass (start-up wood or residue)', unit: 'kg' },
]
export const FUEL_USES: { value: string; label: string }[] = [
  { value: 'reactor-startup', label: 'Reactor start-up' },
  { value: 'generator', label: 'Generator' },
  { value: 'loader', label: 'Loader or forklift' },
  { value: 'vehicle-trip', label: 'Vehicle trip' },
  { value: 'other', label: 'Other' },
]
export const fuelLabel = (v: string) => FUELS.find((f) => f.value === v)?.label.split(' (')[0] ?? statusLabel(v)
export const fuelUseLabel = (v: string) => FUEL_USES.find((f) => f.value === v)?.label ?? statusLabel(v)

/** 0.1152 → "115 kg CO2e", 2.4 → "2.40 t CO2e". */
export function fmtCo2e(t: number): string {
  return t < 1 ? `${Math.round(t * 1000).toLocaleString('en-GB')} kg CO2e` : `${t.toFixed(2)} t CO2e`
}

/** Containers for packaged co-products. */
export const CONTAINERS: { value: string; label: string }[] = [
  { value: 'drum', label: 'Drum' },
  { value: 'ibc', label: 'IBC tote' },
  { value: 'tank', label: 'Tank' },
  { value: 'jerrycan', label: 'Jerrycan' },
]

/** Where applied biochar ends up. Only soil is credited by this ledger version. */
export const SINK_TYPES: { value: string; label: string }[] = [
  { value: 'soil', label: 'Soil' },
  { value: 'compost', label: 'Compost' },
  { value: 'animal-feed', label: 'Animal feed' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'asphalt', label: 'Asphalt' },
  { value: 'filtration', label: 'Filtration' },
  { value: 'other', label: 'Other' },
]
export const sinkLabel = (v: string) => SINK_TYPES.find((s) => s.value === v)?.label ?? statusLabel(v)
