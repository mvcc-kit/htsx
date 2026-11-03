// event.cookies: leitura do Cookie da requisição e escrita de Set-Cookie, com padrões seguros
// (HttpOnly, Secure, SameSite=Lax, Path=/), como no SvelteKit.

import { COOKIE_NAME, UNSAFE_COOKIE_ATTR } from '../patterns'

export interface CookieOptions {
  path?: string
  domain?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export interface Cookies {
  get(name: string): string | undefined
  getAll(): Record<string, string>
  set(name: string, value: string, opts?: CookieOptions): void
  delete(name: string, opts?: Pick<CookieOptions, 'path' | 'domain'>): void
  /** Valores de Set-Cookie acumulados (usado pelo núcleo ao montar a resposta). */
  readonly headers: string[]
}

// RFC 6265 §6.1: mínimo que todo navegador aceita.
const MAX_COOKIE_BYTES = 4096

function parseCookies(header: string): Record<string, string> {
  // Sem protótipo: get('constructor') não pode devolver uma função.
  const out: Record<string, string> = Object.create(null)
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    const k = part.slice(0, i).trim()
    // Repetido: vale o primeiro, o de caminho mais específico. Assim um subdomínio não sobrescreve.
    if (k in out) continue
    const value = part.slice(i + 1).trim()
    try { out[k] = decodeURIComponent(value) } catch { out[k] = value }
  }
  return out
}

export function createCookies(request: Request, secureByDefault: boolean): Cookies {
  // Só lê o cabeçalho se alguém pedir um cookie: a maioria das rotas não pede.
  let parsedCookies: Record<string, string> | undefined
  const parsed = (): Record<string, string> => (parsedCookies ??= parseCookies(request.headers.get('cookie') ?? ''))
  const headers: string[] = []

  function serialize(name: string, value: string, o: CookieOptions): string {
    if (!COOKIE_NAME.test(name)) throw new Error(`htsx: nome de cookie inválido ${JSON.stringify(name)}; use só letras, números e !#$%&'*+-.^_\`|~`)
    for (const [attr, text] of [['path', o.path], ['domain', o.domain]] as const) {
      if (text !== undefined && UNSAFE_COOKIE_ATTR.test(text)) throw new Error(`htsx: ${attr} do cookie "${name}" não pode ter ";" nem quebra de linha`)
    }
    // O navegador descarta em silêncio o que quebra as regras destes prefixos.
    if (name.startsWith('__Host-') && (o.domain || (o.path ?? '/') !== '/' || o.secure === false)) {
      throw new Error(`htsx: cookie "${name}" com prefixo __Host- exige Secure, Path=/ e nenhum Domain`)
    }
    if (name.startsWith('__Secure-') && o.secure === false) throw new Error(`htsx: cookie "${name}" com prefixo __Secure- exige Secure`)
    if (o.sameSite === 'None' && o.secure === false) throw new Error(`htsx: cookie "${name}" com SameSite=None precisa de Secure; o navegador o recusaria`)
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`]
    if (o.domain) parts.push(`Domain=${o.domain}`)
    if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge)}`)
    if (o.expires) parts.push(`Expires=${o.expires.toUTCString()}`)
    if (o.httpOnly ?? true) parts.push('HttpOnly')
    if (o.secure ?? (secureByDefault || o.sameSite === 'None' || name.startsWith('__Host-') || name.startsWith('__Secure-'))) parts.push('Secure')
    parts.push(`SameSite=${o.sameSite ?? 'Lax'}`)
    const cookie = parts.join('; ')
    if (cookie.length > MAX_COOKIE_BYTES) throw new Error(`htsx: cookie "${name}" tem ${cookie.length} bytes; o navegador descarta acima de ${MAX_COOKIE_BYTES}`)
    return cookie
  }

  return {
    get: name => parsed()[name],
    getAll: () => ({ ...parsed() }),
    set(name, value, opts = {}) { headers.push(serialize(name, value, opts)); parsed()[name] = value },
    delete(name, opts = {}) { headers.push(serialize(name, '', { ...opts, maxAge: 0 })); delete parsed()[name] },
    headers,
  }
}
