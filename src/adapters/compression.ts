// Regras de compressão do modo Bun, sem plataforma. Cloudflare e Nginx já comprimem sozinhos.

/** Abaixo disso, o gzip quase não ganha e o cabeçalho pesa. */
export const MIN_COMPRESS_BYTES = 1024

// Sem `text/event-stream`: comprimir um fluxo contínuo prenderia os eventos no buffer.
const COMPRESSIBLE = /^(?:text\/(?:html|css|plain|xml|javascript)|application\/(?:javascript|json|xml|manifest\+json)|image\/svg\+xml)\b/i

export function isCompressible(contentType: string | null): boolean {
  return contentType !== null && COMPRESSIBLE.test(contentType)
}

/** `Accept-Encoding` com gzip, sem `gzip;q=0`. */
export function acceptsGzip(header: string | null): boolean {
  if (!header) return false
  return header.split(',').some(part => {
    const [name, ...params] = part.trim().split(';').map(p => p.trim().toLowerCase())
    return name === 'gzip' && !params.some(p => /^q=0(?:\.0*)?$/.test(p))
  })
}
