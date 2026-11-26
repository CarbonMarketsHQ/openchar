'use client'

import { FormDialog } from '../../form-dialog'

export function SetFeedstockCarbon({ code, pct, source }: { code: string; pct: number | null; source: string | null }) {
  return (
    <FormDialog
      trigger={pct === null ? 'Add feedstock carbon' : 'Change'}
      triggerVariant={pct === null ? 'outline' : 'quiet'}
      triggerTestId="set-feedstock-carbon"
      title="Feedstock carbon content"
      description="Organic carbon as a share of dry feedstock, from a lab analysis or a cited reference."
      fields={[
        {
          name: 'pct',
          label: 'Carbon (% of dry mass)',
          type: 'number',
          step: '0.1',
          min: '0.1',
          max: '99.9',
          required: true,
          defaultValue: pct === null ? '' : String(pct),
          testId: 'feedstock-carbon-pct',
        },
        {
          name: 'source',
          label: 'Source',
          required: true,
          defaultValue: source ?? '',
          placeholder: 'Lab report, or the reference you used',
          testId: 'feedstock-carbon-source',
        },
      ]}
      submitLabel="Save"
      submitTestId="feedstock-carbon-save"
      path={`/batches/${code}/balance`}
      method="PATCH"
      transform={(v) => ({ feedstockCarbonPct: Number(v.pct), feedstockCarbonSource: v.source })}
    />
  )
}

export function RecordGas({ code, kg }: { code: string; kg: number | null }) {
  return (
    <FormDialog
      trigger={kg === null ? 'Record weighed gas' : 'Change gas mass'}
      triggerVariant="quiet"
      triggerTestId="record-gas"
      title="Weighed gas and vapour"
      description="Only if the gas leaving the reactor was measured. Leave empty to treat it as the remainder."
      fields={[{ name: 'kg', label: 'Gas and vapour (kg)', type: 'number', step: '1', min: '0', defaultValue: kg === null ? '' : String(kg), testId: 'gas-kg' }]}
      submitLabel="Save"
      submitTestId="gas-save"
      path={`/batches/${code}/balance`}
      method="PATCH"
      transform={(v) => ({ gasKg: v.kg === '' ? null : Number(v.kg) })}
    />
  )
}
