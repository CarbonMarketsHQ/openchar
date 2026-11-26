'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Badge,
  IconBook,
  IconFieldApp,
  IconFlask,
  IconFolder,
  IconGauge,
  IconKiln,
  IconLayers,
  IconPaperclip,
  IconMoon,
  IconSettings,
  IconSun,
  IconUpload,
  Logo,
  Sidebar,
  SidebarBody,
  SidebarBrand,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarItem,
  SidebarProvider,
  SidebarTrigger,
  Topbar,
  TopbarEnd,
  useSystemTheme,
} from '@/design'
import { session } from '@/lib/client'
import { SITE } from '@/content/site'
import { extraSetupNav } from '@/ext'

const NAV = [
  { href: '/console', label: 'Overview', icon: <IconGauge /> },
  { href: '/console/gate', label: 'Gate', icon: <IconLayers /> },
  { href: '/console/batches', label: 'Batches', icon: <IconKiln /> },
  { href: '/console/lab', label: 'Lab', icon: <IconFlask /> },
  { href: '/console/documents', label: 'Documents', icon: <IconPaperclip /> },
  { href: '/console/compliance', label: 'Compliance', icon: <IconBook /> },
  { href: '/console/certify', label: 'Certify', icon: <IconUpload /> },
]

const SETUP = [
  { href: '/console/projects', label: 'Projects', icon: <IconFolder /> },
  { href: '/console/facilities', label: 'Facilities', icon: <IconSettings /> },
  { href: '/console/suppliers', label: 'Suppliers', icon: <IconFolder /> },
  ...extraSetupNav,
  { href: '/console/account', label: 'Account', icon: <IconSettings /> },
]

function ThemeToggle() {
  const theme = useSystemTheme()
  const router = useRouter()
  const next = theme === 'paper' ? 'field' : 'paper'
  return (
    <button
      type="button"
      className="ui-btn"
      data-variant="ghost"
      data-size="icon-sm"
      aria-label={next === 'paper' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => {
        document.cookie = `${SITE.themeCookie}=${next}; path=/; max-age=31536000; samesite=lax`
        router.refresh()
      }}
    >
      {next === 'paper' ? <IconSun /> : <IconMoon />}
    </button>
  )
}

export function ConsoleShell({
  workspaceName,
  projects,
  currentProjectId,
  synthetic,
  needsProjectCookie,
  children,
}: {
  workspaceName: string
  projects: { id: string; name: string }[]
  currentProjectId: string | null
  synthetic: boolean
  needsProjectCookie?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (needsProjectCookie && currentProjectId) {
      void session({ action: 'select-project', projectId: currentProjectId }).then(() => router.refresh())
    }
  }, [needsProjectCookie, currentProjectId, router])
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <SidebarBrand mark={<Logo />} name={SITE.name} note={workspaceName} />
          {projects.length > 0 && (
            <div className="ui-sidebar__only" style={{ padding: '0 var(--sp-2) var(--sp-2)', width: '100%', flex: '1 1 100%' }}>
              <label className="u-sr" htmlFor="project-switch">
                Project
              </label>
              <select
                id="project-switch"
                className="ui-input"
                data-testid="project-switch"
                style={{ width: '100%', minHeight: 'var(--control-h-sm)', fontSize: 'var(--t-ui-sm)' }}
                value={currentProjectId ?? ''}
                onChange={async (e) => {
                  await session({ action: 'select-project', projectId: e.target.value })
                  router.refresh()
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </SidebarHeader>
        <SidebarBody>
          <SidebarGroup label="Plant">
            {NAV.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                active={item.href === '/console' ? pathname === '/console' : pathname.startsWith(item.href)}
              >
                {item.label}
              </SidebarItem>
            ))}
          </SidebarGroup>
          <SidebarGroup label="Field">
            <SidebarItem href="/field" icon={<IconFieldApp />} active={pathname === '/field'}>
              Field app
            </SidebarItem>
          </SidebarGroup>
          <SidebarGroup label="Workspace">
            {SETUP.map((item) => (
              <SidebarItem key={item.href} href={item.href} icon={item.icon} active={pathname.startsWith(item.href)}>
                {item.label}
              </SidebarItem>
            ))}
          </SidebarGroup>
        </SidebarBody>
      </Sidebar>
      <SidebarInset>
        <Topbar>
          <SidebarTrigger />
          <TopbarEnd>
            {synthetic && (
              <Badge tone="caution" data-testid="synthetic-badge">
                Synthetic data
              </Badge>
            )}
            <ThemeToggle />
            <button
              type="button"
              className="ui-btn"
              data-variant="ghost"
              data-size="sm"
              data-testid="sign-out"
              onClick={async () => {
                await session({ action: 'logout' })
                router.push('/login')
                router.refresh()
              }}
            >
              Sign out
            </button>
          </TopbarEnd>
        </Topbar>
        <main className="app-main">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
