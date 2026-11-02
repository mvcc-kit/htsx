import type { PageProps } from './$types'

export default function Home({ data }: PageProps) {
  return <h1>Início de {data.site}</h1>
}
