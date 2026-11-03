import type { PageProps } from './$types'

export default function Greeting({ data }: PageProps) {
  return <p>{data.greeting}</p>
}
