import type { ReactNode } from 'react'
import { cx } from '../cx'

export type Column<Row> = {
  key: string
  head: ReactNode
  /** Right-aligned, mono and tabular. Use it for anything a reader compares. */
  numeric?: boolean
  cell: (row: Row) => ReactNode
}

/**
 * A table of records. Deliberately not a data grid: no sorting, no paging, no
 * virtualisation. Those belong to the screen that needs them, and every
 * project that has reached for a generic grid has ended up fighting it.
 *
 * What it does guarantee is the part that is easy to get wrong — a real
 * caption, a scroll container that does not break the page at narrow widths,
 * and figures that line up because numeric columns are mono and tabular.
 */
export function Table<Row>({
  columns,
  rows,
  caption,
  rowKey,
  empty = 'Nothing to show.',
  className,
}: {
  columns: Column<Row>[]
  rows: Row[]
  caption?: ReactNode
  rowKey: (row: Row, i: number) => string
  empty?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('ui-tablewrap', className)}>
      <table className="ui-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" data-numeric={c.numeric || undefined}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="u-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)}>
                {columns.map((c) => (
                  <td key={c.key} data-numeric={c.numeric || undefined}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
