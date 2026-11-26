import { notFound } from 'next/navigation'
import { Badge, Logo } from '@/design'
import { api, type Summary } from '@/lib/api'

/** The public page of one published project. 404 for anything unpublished. */
export default async function PublicProject({ projectId }: { projectId: string }) {
  const s = await api<Summary>(`/public/projects/${encodeURIComponent(projectId)}/summary`)
  if (!s) notFound()
  return (
    <main className="pub">
      <div className="pub-head">
        <Logo size={32} title="CarbonMarketsHQ" />
        {s?.synthetic !== false && (
          <Badge tone="caution" data-testid="public-badge">
            Synthetic demonstration data
          </Badge>
        )}
        <h1>{s?.name ?? 'Biochar project'}</h1>
        <p className="where">
          Biochar made from residues that would otherwise decay, and returned to farm soils.
          {s ? ` ${s.district}.` : ''} Every figure below traces to a field record, a scale reading or
          a laboratory certificate.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span className="k" data-stamp>Net removal to date</span>
          <span className="v" data-testid="public-tonnes" data-value={s?.tonnesConservative ?? 0}>
            {(s?.tonnesConservative ?? 0).toFixed(2)}
            <small> t CO2e</small>
          </span>
          <span className="d">Conservative estimate, verified batches only</span>
        </div>
        <div className="stat">
          <span className="k" data-stamp>Production batches</span>
          <span className="v" data-testid="public-batches" data-value={s?.batches ?? 0}>
            {s?.batches ?? 0}
          </span>
          <span className="d">{s?.sampledBatches ?? 0} fully sampled and analysed</span>
        </div>
        <div className="stat">
          <span className="k" data-stamp>Feedstock suppliers</span>
          <span className="v">{s?.suppliers ?? 0}</span>
          <span className="d">Farmer groups and collection points</span>
        </div>
        <div className="stat">
          <span className="k" data-stamp>Storage</span>
          <span className="v">soil</span>
          <span className="d">200-year durability basis, Isometric biochar protocol</span>
        </div>
      </div>

      <p className="pub-foot">
        Published with OpenChar, the free and open-source biochar dMRV platform by CarbonMarketsHQ.
        Locations are shown at district level only. Farm boundaries and supplier records stay with the
        project and its verifier.
      </p>
    </main>
  )
}
