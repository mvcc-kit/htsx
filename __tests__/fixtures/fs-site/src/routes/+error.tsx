import type { ErrorProps } from './$types'

export default function Erro({ status, message }: ErrorProps) {
  return <main data-testid="erro-raiz"><h1>{status}</h1><p>{message}</p></main>
}
