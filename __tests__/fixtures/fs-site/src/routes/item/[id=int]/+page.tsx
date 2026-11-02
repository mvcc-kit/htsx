import type { PageProps } from './$types'

export default function Item({ params }: PageProps) {
  return <p>item {params.id}</p>
}
