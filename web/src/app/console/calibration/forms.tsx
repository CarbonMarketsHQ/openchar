'use client'

import { CALIBRATION_RESULTS, INSTRUMENT_KINDS } from '@/lib/labels'
import { FormDialog } from '../form-dialog'

const today = () => new Date().toLocaleDateString('en-CA')

export function AddInstrument({ facilities }: { facilities: { id: string; name: string }[] }) {
  return (
    <FormDialog
      trigger="Add instrument"
      triggerTestId="add-instrument"
      title="Add an instrument"
      description="Anything whose reading ends up in a record: scales, thermocouples, moisture meters and meters."
      fields={[
        { name: 'name', label: 'Name', required: true, placeholder: 'Loading hopper scale', testId: 'instrument-name' },
        { name: 'kind', label: 'Kind', type: 'select', required: true, options: INSTRUMENT_KINDS, testId: 'instrument-kind' },
        { name: 'serial', label: 'Serial number', testId: 'instrument-serial' },
        {
          name: 'intervalDays',
          label: 'Calibrate every',
          type: 'number',
          min: '1',
          max: '3650',
          required: true,
          defaultValue: '180',
          hint: 'Days between calibrations, from the maker or the methodology',
          testId: 'instrument-interval',
        },
        ...(facilities.length > 1
          ? [
              {
                name: 'facilityId',
                label: 'Facility',
                type: 'select' as const,
                options: facilities.map((f) => ({ value: f.id, label: f.name })),
              },
            ]
          : []),
      ]}
      submitLabel="Add instrument"
      submitTestId="instrument-submit"
      path="/instruments"
      transform={(v) => ({
        name: v.name,
        kind: v.kind,
        serial: v.serial,
        intervalDays: Number(v.intervalDays),
        facilityId: v.facilityId || facilities[0]?.id,
      })}
    />
  )
}

export function RecordCalibration({
  id,
  name,
  intervalDays,
  certificates,
}: {
  id: string
  name: string
  intervalDays: number
  certificates: { id: string; title: string }[]
}) {
  return (
    <FormDialog
      trigger="Record"
      triggerVariant="quiet"
      triggerTestId="record-calibration"
      title={`Record a calibration: ${name}`}
      description={`The next one falls due ${intervalDays} days later unless the certificate says otherwise.`}
      fields={[
        { name: 'calibratedOn', label: 'Calibrated on', type: 'date', required: true, defaultValue: today(), testId: 'calibration-date' },
        { name: 'result', label: 'Result', type: 'select', required: true, options: CALIBRATION_RESULTS, testId: 'calibration-result' },
        { name: 'performedBy', label: 'Calibrated by', required: true, placeholder: 'Lab, authority or technician', testId: 'calibration-by' },
        {
          name: 'sourceId',
          label: 'Certificate',
          type: 'select',
          options: [{ value: '', label: 'None yet' }, ...certificates.map((c) => ({ value: c.id, label: c.title }))],
          hint: 'Upload it under Documents as a calibration record first',
          testId: 'calibration-cert',
        },
        { name: 'nextDue', label: 'Next due', type: 'date', hint: 'Leave empty to use the interval', testId: 'calibration-next' },
        { name: 'note', label: 'Note', type: 'textarea', testId: 'calibration-note' },
      ]}
      submitLabel="Record calibration"
      submitTestId="calibration-submit"
      path={`/instruments/${id}/calibrations`}
      transform={(v) => ({
        calibratedOn: v.calibratedOn,
        result: v.result,
        performedBy: v.performedBy,
        sourceId: v.sourceId || undefined,
        nextDue: v.nextDue || undefined,
        note: v.note,
      })}
    />
  )
}
