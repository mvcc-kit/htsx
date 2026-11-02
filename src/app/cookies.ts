// event.cookies: leitura do Cookie da requisição e escrita de Set-Cookie, com padrões seguros
// (HttpOnly, Secure, SameSite=Lax, Path=/), como no SvelteKit.

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

const NAME_RE = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/

export function createCookies(request: Request, secureByDefault: boolean): Cookies {
  const parsed: Record<string, string> = {}
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    const k = part.slice(0, i).trim()
    try { parsed[k] = decodeURIComponent(part.slice(i + 1).trim()) } catch { parsed[k] = part.slice(i + 1).trim() }
  }
  const headers: string[] = []

  function serialize(name: string, value: string, o: CookieOptions): string {
    if (!NAME_RE.test(name)) throw new Error(`htsx: nome de cookie inválido ${JSON.stringify(name)}; use só letras, números e !#$%&'*+-.^_\`|~`)
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`]
    if (o.domain) parts.push(`Domain=${o.domain}`)
    if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge)}`)
    if (o.expires) parts.push(`Expires=${o.expires.toUTCString()}`)
    if (o.httpOnly ?? true) parts.push('HttpOnly')
    if (o.secure ?? secureByDefault) parts.push('Secure')
    parts.push(`SameSite=${o.sameSite ?? 'Lax'}`)
    return parts.join('; ')
  }

  return {
    get: name => parsed[name],
    getAll: () => ({ ...parsed }),
    set(name, value, opts = {}) { headers.push(serialize(name, value, opts)); parsed[name] = value },
    delete(name, opts = {}) { headers.push(serialize(name, '', { ...opts, maxAge: 0 })); delete parsed[name] },
    headers,
  }
}
