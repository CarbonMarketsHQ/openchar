'use client'

import { Button, LinkButton } from '@/design'

/** On screen only: save the report as PDF through the browser, or get the workbook. */
export function PrintBar({ xlsx, back }: { xlsx: string; back: { href: string; label: string } }) {
  return (
    <div className="report-bar no-print">
      <LinkButton href={back.href} variant="ghost" size="sm">
        {back.label}
      </LinkButton>
      <span style={{ flex: 1 }} />
      <LinkButton href={xlsx} variant="outline" size="sm" download data-testid="report-xlsx">
        Download Excel
      </LinkButton>
      <Button variant="solid" size="sm" onClick={() => window.print()} data-testid="report-print">
        Save as PDF
      </Button>
    </div>
  )
}
