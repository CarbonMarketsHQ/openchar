'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** The unit's QR label: scanning it opens this unit's custody page. */
export function UnitQr({ unitId }: { unitId: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    const url = `${window.location.origin}/console/units/${unitId}`
    void QRCode.toDataURL(url, { margin: 1, width: 180 }).then(setDataUrl)
  }, [unitId])
  if (!dataUrl) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt={`QR label for unit ${unitId}`}
      data-testid="unit-qr"
      width={180}
      height={180}
      style={{ borderRadius: 'var(--radius-sm)', border: 'var(--border) solid var(--hairline)', background: '#fff', padding: 8 }}
    />
  )
}
