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
