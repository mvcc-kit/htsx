import type { ErrorProps } from './$types'

export default function PostErro({ message }: ErrorProps) {
  return <p data-testid="erro-post">{message}</p>
}
