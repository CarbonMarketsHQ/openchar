import type { Metadata, Viewport } from 'next'
import { Instrument_Sans, Source_Serif_4, Spline_Sans_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import { SystemProvider, type Theme } from '@/design'
import { SITE } from '@/content/site'
import '@/design/theme.css'
import '@/design/system.css'
import './globals.css'

const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-lp3-sans' })
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-lp3-serif' })
const mono = Spline_Sans_Mono({ subsets: ['latin'], variable: '--font-lp3-mono' })

export const metadata: Metadata = {
  title: SITE.name,
  description:
    'Open-source dMRV for industrial biochar: field capture, plant console, lab records, an open carbon ledger, and an Isometric Certify connector.',
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f140f',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const raw = jar.get(SITE.themeCookie)?.value
  const theme: Theme = raw === 'paper' || raw === 'ink' ? raw : 'field'
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="cmhq" data-theme={theme === 'field' ? undefined : theme}>
        <SystemProvider theme={theme}>{children}</SystemProvider>
      </body>
    </html>
  )
}
