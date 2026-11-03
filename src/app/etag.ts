// ETag das páginas renderizadas: se nada mudou, o navegador recebe 304 e não baixa o HTML de novo.

/** Hash do conteúdo, fraco porque a compressão muda os bytes. */
export async function weakEtag(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  const hex = [...new Uint8Array(digest).slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('')
  return `W/"${hex}"`
}

/** Compara com `If-None-Match`, que pode trazer vários valores ou `*`. */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '')
  return ifNoneMatch.split(',').some(tag => tag.trim() === '*' || opaque(tag) === opaque(etag))
}
