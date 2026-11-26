import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { api, PROJECT_COOKIE, type Me } from '@/lib/api'
import { ConsoleShell } from './shell'

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const me = await api<Me>('/auth/me')
  if (!me) redirect('/login')
  const jar = await cookies()
  const cookieProject = jar.get(PROJECT_COOKIE)?.value
  const current = me.projects.find((p) => p.id === cookieProject) ?? me.projects[0] ?? null
  return (
    <ConsoleShell
      workspaceName={me.user.workspaceName}
      projects={me.projects}
      currentProjectId={current?.id ?? null}
      synthetic={Boolean(current?.synthetic)}
      needsProjectCookie={Boolean(current && cookieProject !== current.id)}
    >
      {children}
    </ConsoleShell>
  )
}
