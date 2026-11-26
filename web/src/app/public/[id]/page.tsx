import PublicProject from '../view'

export const dynamic = 'force-dynamic'

export default async function PublicById({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PublicProject projectId={id} />
}
