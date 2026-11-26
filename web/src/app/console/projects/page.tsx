import { Badge, Card, CardBody, CardHead, CardTitle, KeyValues } from '@/design'
import { api, type Project } from '@/lib/api'
import { ApiDown } from '../bits'
import { EditGridFactor, NewProject } from './new-project'
import { PublicToggle } from './public-toggle'

export default async function Projects() {
  const projects = await api<Project[]>('/projects')
  if (!projects) return <ApiDown />
  return (
    <>
      <div className="page-head">
        <h1>Projects</h1>
        <NewProject />
      </div>
      {projects.length === 0 ? (
        <div className="empty" data-testid="empty-state">
          <b>No projects yet</b>
          <span>Create the first project to start recording batches and evidence.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-5)', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {projects.map((p) => (
            <Card key={p.id} data-testid="project-card">
              <CardHead>
                <CardTitle desc={p.district}>{p.name}</CardTitle>
              </CardHead>
              <CardBody>
                <KeyValues
                  items={[
                    { label: 'Batches', value: String(p.batchCount) },
                    { label: 'Soil temp', value: `${p.tSoilC.toFixed(1)} °C` },
                    {
                      label: 'Grid factor',
                      value: p.gridEfTPerKwh === null ? 'Not set' : `${(p.gridEfTPerKwh * 1000).toFixed(3)} kg CO2e/kWh`,
                    },
                    { label: 'Durability', value: p.durabilityBasis === '200yr' ? '200-year basis' : p.durabilityBasis },
                    {
                      label: 'Data',
                      value: p.synthetic ? <Badge tone="caution">Synthetic</Badge> : <Badge tone="positive">Production</Badge>,
                    },
                  ]}
                />
                <PublicToggle projectId={p.id} isPublic={p.public} />
                <EditGridFactor
                  projectId={p.id}
                  kgPerKwh={p.gridEfTPerKwh === null ? null : Number((p.gridEfTPerKwh * 1000).toFixed(4))}
                  source={p.gridEfSource}
                />
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
