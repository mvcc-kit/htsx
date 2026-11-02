import type { PageProps } from './$types'

export default function Saudacao({ data }: PageProps) {
  return <p>{data.saudacao}</p>
}
