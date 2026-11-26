import { api } from '@/lib/api'
import { DataFallback } from '../bits'
import { statusLabel } from '@/lib/labels'
import { NewSupplier } from './supplier-forms'

type Supplier = { id: string; name: string; village: string; category: string }

export default async function Suppliers() {
  const suppliers = await api<Supplier[]>('/suppliers')
  if (!suppliers) return <DataFallback />
  return (
    <>
      <div className="page-head">
        <h1>Suppliers</h1>
        <NewSupplier />
      </div>
      {suppliers.length === 0 ? (
        <div className="empty" data-testid="empty-state">
          <b>No suppliers yet</b>
          <span>Register suppliers so field capture can book consignments against them.</span>
        </div>
      ) : (
        <div className="ui-tablewrap">
          <table className="ui-table">
            <caption className="u-sr">Registered feedstock suppliers</caption>
            <thead>
              <tr>
                <th scope="col">Supplier</th>
                <th scope="col">Village</th>
                <th scope="col">Category</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} data-testid="supplier-row">
                  <td>{s.name}</td>
                  <td>{s.village}</td>
                  <td>{statusLabel(s.category)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
