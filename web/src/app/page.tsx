import { redirect } from 'next/navigation'
import { Home } from '@/ext'

export default async function Root() {
  if (Home) return <Home />
  redirect('/console')
}
