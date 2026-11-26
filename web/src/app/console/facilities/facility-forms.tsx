'use client'

import { FormDialog } from '../form-dialog'

const REACTOR_MAKES = [
  { value: 'In-house design', label: 'In-house design' },
  { value: 'Ankur PG Series', label: 'Ankur PG Series (Isometric pre-approved)' },
  { value: 'Beston BST-50', label: 'Beston BST-50 (Isometric pre-approved)' },
  { value: 'Biowatt 500/1000', label: 'Biowatt 500/1000 (Isometric pre-approved)' },
  { value: 'Pyreg PX1500-BH', label: 'Pyreg PX1500-BH (Isometric pre-approved)' },
  { value: 'Pyrogreen BRKC1000', label: 'Pyrogreen BRKC1000 (Isometric pre-approved)' },
  { value: 'Other', label: 'Other' },
]

export function NewFacility() {
  return (
    <FormDialog
      trigger="Onboard facility"
      triggerTestId="new-facility"
      title="Onboard a production facility"
      description="The reactor, its scales and its lab partner. This feeds the compliance table directly."
      path="/facilities"
      submitTestId="facility-save"
      fields={[
        { name: 'name', label: 'Facility name', required: true, testId: 'facility-name' },
        { name: 'gpsLat', label: 'Latitude', type: 'number', step: '0.0001', testId: 'facility-lat' },
        { name: 'gpsLng', label: 'Longitude', type: 'number', step: '0.0001', testId: 'facility-lng' },
        { name: 'reactorMake', label: 'Reactor make', type: 'select', options: REACTOR_MAKES, defaultValue: 'In-house design', testId: 'facility-make' },
        { name: 'reactorType', label: 'Reactor type', placeholder: 'continuous-feed pyrolysis', testId: 'facility-type' },
        { name: 'nameplateTpd', label: 'Nameplate capacity (tonnes of biomass per day)', type: 'number', step: '0.5', testId: 'facility-tpd' },
        {
          name: 'scalesNote',
          label: 'Weighing arrangement',
          type: 'textarea',
          hint: 'What weighs feedstock in and biochar out. The protocol wants calibrated scales per batch.',
          testId: 'facility-scales',
        },
        { name: 'labPartner', label: 'Laboratory partner', placeholder: 'ISO/IEC 17025 accredited lab', testId: 'facility-lab' },
      ]}
      transform={(v) => ({
        name: v.name,
        gpsLat: v.gpsLat ? Number(v.gpsLat) : null,
        gpsLng: v.gpsLng ? Number(v.gpsLng) : null,
        reactorMake: v.reactorMake || null,
        reactorType: v.reactorType || null,
        nameplateTpd: v.nameplateTpd ? Number(v.nameplateTpd) : null,
        scalesNote: v.scalesNote || null,
        labPartner: v.labPartner || null,
      })}
    />
  )
}

export function RecordStackTest({ facilityId }: { facilityId: string }) {
  return (
    <FormDialog
      trigger="Record stack test"
      triggerVariant="outline"
      title="Record a stack emissions test"
      description="CO2, CH4 and N2O, at minimum annually (R-TKNH-0)."
      path={`/facilities/${facilityId}`}
      method="PATCH"
      fields={[{ name: 'stackTestDoneAt', label: 'Test date', type: 'date', required: true, testId: 'stack-test-date' }]}
      transform={(v) => ({ stackTestDoneAt: v.stackTestDoneAt })}
      submitLabel="Record"
      submitTestId="stack-test-save"
    />
  )
}

/** Live reactor readings: the facility subscribes to an MQTT topic and
 * stores each reading against the batch it names. */
export function ConnectSensors({ facilityId, mqttUrl, mqttTopic }: { facilityId: string; mqttUrl?: string | null; mqttTopic?: string | null }) {
  return (
    <FormDialog
      trigger={mqttUrl ? 'Edit sensor feed' : 'Connect sensors'}
      triggerVariant="outline"
      triggerTestId="connect-sensors"
      title="Stream reactor readings over MQTT"
      description='Point the facility at your MQTT broker. Each message is JSON like {"batchCode": "HT-04", "minute": 12, "tempC": 548.2}, and the reading is stored on that batch.'
      path={`/facilities/${facilityId}`}
      method="PATCH"
      fields={[
        { name: 'mqttUrl', label: 'Broker URL', placeholder: 'mqtts://broker.example.org:8883', defaultValue: mqttUrl ?? '', testId: 'mqtt-url' },
        { name: 'mqttTopic', label: 'Topic', placeholder: 'plant1/reactor/temperature', defaultValue: mqttTopic ?? '', testId: 'mqtt-topic' },
      ]}
      transform={(v) => ({ mqttUrl: v.mqttUrl || null, mqttTopic: v.mqttTopic || null })}
      submitLabel="Save"
      submitTestId="mqtt-save"
    />
  )
}
