'use client'

import { useEffect, useState } from 'react'

const FMT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }

/** A date and time in the viewer's own time zone. The server renders UTC;
 * the browser swaps in local time once it has loaded. */
export function When({ iso, className }: { iso: string | Date; className?: string }) {
  const d = new Date(iso)
  const [text, setText] = useState(() => d.toLocaleString('en-GB', { ...FMT, timeZone: 'UTC' }))
  useEffect(() => {
    setText(new Date(iso).toLocaleString('en-GB', FMT))
  }, [iso])
  return (
    <time dateTime={d.toISOString()} className={className} suppressHydrationWarning>
      {text}
    </time>
  )
}
