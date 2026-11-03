// Montagem da resposta: cabeçalhos, cookies e 304. Sem rotas nem renderização.
import { etagMatches, weakEtag } from './etag'

/** Valem para toda resposta do app, menos o que a rota já definiu. */
export const DEFAULT_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

/**
 * O htmx muda a resposta por estes cabeçalhos, que o cliente controla. Sem todos no Vary, um CDN
 * poderia entregar o trecho de uma pessoa como se fosse a página de outra.
 */
export const HTMX_VARY = 'HX-Request, HX-Boosted, HX-Target, HX-History-Restore-Request'

/** Resposta criada aqui aceita mudança; a de fetch() é imutável e precisa de cópia. */
function withHeaders(res: Response, change: (headers: Headers) => void): Response {
  try {
    change(res.headers)
    return res
  } catch {
    const copy = new Response(res.body, res)
    change(copy.headers)
    return copy
  }
}

function fillMissing(headers: Headers, values: Readonly<Record<string, string>> | undefined): void {
  if (!values) return
  for (const k in values) if (!headers.has(k)) headers.set(k, values[k]!)
}

export function withSecurityHeaders(res: Response, custom: Record<string, string> | false | undefined): Response {
  if (custom === false) return res
  return withHeaders(res, headers => {
    fillMissing(headers, DEFAULT_SECURITY_HEADERS)
    fillMissing(headers, custom)
  })
}

export function withCookies(res: Response, cookies: readonly string[]): Response {
  if (!cookies.length) return res
  return withHeaders(res, headers => {
    for (const c of cookies) headers.append('set-cookie', c)
    // Resposta que grava sessão nunca vai para cache compartilhado.
    if (!headers.has('cache-control')) headers.set('cache-control', 'private, no-store')
  })
}

/** Cabeçalhos de setHeaders entram também na resposta de um endpoint; os da rota vencem. */
export function mergeHeaders(res: Response, extra: Headers): Response {
  let empty = true
  extra.forEach(() => { empty = false })
  if (empty) return res
  return withHeaders(res, headers => { extra.forEach((v, k) => { if (!headers.has(k)) headers.set(k, v) }) })
}

/** Página que não mudou vira 304: o `load` já rodou, mas o HTML não trafega de novo. */
export async function htmlResponse(request: Request, html: string, status: number, headers: Headers): Promise<Response> {
  if (status !== 200 || (request.method !== 'GET' && request.method !== 'HEAD') || headers.has('etag')) return new Response(html, { status, headers })
  const etag = await weakEtag(html)
  headers.set('etag', etag)
  if (etagMatches(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers })
  return new Response(html, { status, headers })
}
