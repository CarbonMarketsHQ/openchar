import { Card, CardBody, CardFoot, CardHead, CardTitle, KeyValues } from '@/design'
import { api, type Facility } from '@/lib/api'
import { DataFallback } from '../bits'
import { ConnectSensors, NewFacility, RecordStackTest } from './facility-forms'

export default async function Facilities() {
  const facilities = await api<Facility[]>('/facilities')
  if (!facilities) return <DataFallback />
  return (
    <>
      <div className="page-head">
        <h1>Facilities</h1>
        <NewFacility />
      </div>
      {facilities.length === 0 ? (
        <div className="empty" data-testid="empty-state">
          <b>No facilities yet</b>
          <span>Onboard the production facility to anchor batches, scales and the lab chain.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-5)', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {facilities.map((f) => (
            <Card key={f.id} id={`facility-${f.id}`} data-testid="facility-card">
              <CardHead>
                <CardTitle desc={f.reactorMake ? `${f.reactorMake}${f.reactorType ? `, ${f.reactorType}` : ''}` : undefined}>
                  {f.name}
                </CardTitle>
              </CardHead>
              <CardBody>
                <KeyValues
                  items={[
                    { label: 'Capacity', value: f.nameplateTpd === null ? 'Not recorded' : `${f.nameplateTpd} TPD biomass` },
                    {
                      label: 'Location',
                      value: f.gpsLat === null ? 'Not recorded' : `${Number(f.gpsLat).toFixed(2)}, ${Number(f.gpsLng).toFixed(2)}`,
                    },
                    { label: 'Weighing', value: f.scalesNote ?? 'Not recorded' },
                    { label: 'Lab', value: f.labPartner ?? 'Not recorded' },
                    {
                      label: 'Stack test',
                      value: f.stackTestDoneAt ? String(f.stackTestDoneAt).slice(0, 10) : 'None on record',
                    },
                    { label: 'Sensor feed', value: f.mqttTopic ? `MQTT, ${f.mqttTopic}` : 'CSV upload per batch' },
                  ]}
                />
              </CardBody>
              <CardFoot>
                <RecordStackTest facilityId={f.id} />
                <ConnectSensors facilityId={f.id} mqttUrl={f.mqttUrl} mqttTopic={f.mqttTopic} />
              </CardFoot>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
