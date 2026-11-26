import { SITE } from '@/content/site'
import PublicProject from './view'

export const dynamic = 'force-dynamic'

/** The server's featured public project (PUBLIC_PROJECT_ID). */
export default async function PublicPage() {
  return <PublicProject projectId={SITE.publicProjectId} />
}
