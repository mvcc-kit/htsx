/**
 * Flash messages — pattern Rails/Laravel adaptado.
 *
 * Funções puras: dev decide onde plugar (Hono c.header, Bun.serve Response, etc.)
 *
 * Token format: base64url(JSON).signature
 * - Assinado com HMAC-SHA256 (mesmo HMAC do CSRF)
 * - Tamper-detection via signature
 * - Cookie config separado do payload (dev escolhe path/maxAge/secure)
 */

const ENCODER = new TextEncoder()
const DECODER = new TextDecoder()
const MIN_SECRET_LENGTH = 32

// RFC 6265 §4.1.1 — cookie-name = token (visible ASCII, no separators/CTLs)
const VALID_COOKIE_NAME_RE = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/

function assertCookieName(name: string): void {
  if (!VALID_COOKIE_NAME_RE.test(name)) {
    throw new Error(`flash: invalid cookie name "${name}" — must be RFC 6265 token`)
  }
}

export type FlashType = 'success' | 'error' | 'info' | 'warning'

export interface FlashMessage {
  type: FlashType
  text: string
  meta?: Record<string, unknown>
}

export interface FlashSecret {
  secret: string
}

/**
 * base64url-encode de string Unicode arbitrária.
 * btoa() só aceita Latin-1; pra UTF-8 precisamos passar pelos bytes do encoder.
 */
function b64UrlEncode(s: string): string {
  const bytes = ENCODER.encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
/** Inverso de b64UrlEncode: retorna a string UTF-8 original. */
function b64UrlDecode(s: string): string {
  const pad = (4 - (s.length % 4)) % 4
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return DECODER.decode(bytes)
}
/** Helper interno: bytes brutos → b64url (usado pra sig HMAC). */
function bytesToB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmac(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', ENCODER.encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, ENCODER.encode(data))
  return bytesToB64Url(new Uint8Array(sig))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const VALID_TYPES: ReadonlySet<FlashType> = new Set(['success', 'error', 'info', 'warning'])

function isValidMessage(m: unknown): m is FlashMessage {
  if (!m || typeof m !== 'object') return false
  const msg = m as Record<string, unknown>
  if (typeof msg.text !== 'string') return false
  if (typeof msg.type !== 'string') return false
  if (!VALID_TYPES.has(msg.type as FlashType)) return false
  return true
}

export interface CookieOpts {
  /** Nome do cookie. Default '_flash'. */
  name?: string
  /** Path. Default '/'. */
  path?: string
  /** maxAge em segundos. Default 120 (suficiente pra redirect + render). */
  maxAge?: number
  /** Secure flag. Default true (force HTTPS). */
  secure?: boolean
  /** Domain opcional. */
  domain?: string
  /** SameSite. Default 'Strict'. */
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export const flash = {
  /** Serializa mensagens em token assinado. */
  async serialize(messages: FlashMessage[], opts: FlashSecret): Promise<string> {
    if (typeof opts.secret !== 'string' || opts.secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`flash: secret mínimo ${MIN_SECRET_LENGTH} chars`)
    }
    if (!Array.isArray(messages)) throw new Error('flash: messages deve ser array')
    const sanitized = messages.filter(isValidMessage)
    const payload = b64UrlEncode(JSON.stringify(sanitized))
    const sig = await hmac(opts.secret, payload)
    return `${payload}.${sig}`
  },

  /** Parse + valida + filtra. Retorna [] em qualquer erro (não throw). */
  async parse(token: unknown, opts: FlashSecret): Promise<FlashMessage[]> {
    if (typeof token !== 'string' || !token) return []
    if (typeof opts.secret !== 'string' || opts.secret.length < MIN_SECRET_LENGTH) return []

    const parts = token.split('.')
    if (parts.length !== 2) return []
    const [payload, sig] = parts as [string, string]

    const expected = await hmac(opts.secret, payload)
    if (!timingSafeEqual(sig, expected)) return []

    try {
      const json = b64UrlDecode(payload)
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isValidMessage)
    } catch {
      return []
    }
  },

  /**
   * Constrói string Set-Cookie. Dev anexa via headers do response.
   * Devolve string como Set-Cookie value, sem 'Set-Cookie: ' prefix.
   */
  setCookie(value: string, opts: CookieOpts = {}): string {
    const name = opts.name ?? '_flash'
    assertCookieName(name)
    const parts: string[] = [`${name}=${value}`]
    parts.push(`Path=${opts.path ?? '/'}`)
    parts.push(`Max-Age=${opts.maxAge ?? 120}`)
    parts.push('HttpOnly')
    parts.push(`SameSite=${opts.sameSite ?? 'Strict'}`)
    if (opts.secure !== false) parts.push('Secure')
    if (opts.domain) parts.push(`Domain=${opts.domain}`)
    return parts.join('; ')
  },

  /** Cookie pra zerar o flash (use após renderizar). */
  clearCookie(opts: Pick<CookieOpts, 'name' | 'path' | 'domain'> = {}): string {
    const name = opts.name ?? '_flash'
    assertCookieName(name)
    const parts = [
      `${name}=`,
      `Path=${opts.path ?? '/'}`,
      'Max-Age=0',
      'HttpOnly',
      'SameSite=Strict',
      'Secure',
    ]
    if (opts.domain) parts.push(`Domain=${opts.domain}`)
    return parts.join('; ')
  },

  /** Lê cookie de Request/Headers (helper opcional, devolve raw token). */
  readCookie(
    source: Request | Headers | { headers: Headers },
    name = '_flash',
  ): string | null {
    const headers = source instanceof Headers
      ? source
      : 'headers' in source && source.headers instanceof Headers
        ? source.headers
        : source instanceof Request
          ? source.headers
          : null
    if (!headers) return null
    const cookie = headers.get('cookie')
    if (!cookie) return null
    // Use string splitting — never pass caller-supplied `name` into RegExp
    // (prevents ReDoS and cookie logic bypass via regex metacharacters)
    for (const part of cookie.split(';')) {
      const eqIdx = part.indexOf('=')
      if (eqIdx < 0) continue
      const k = part.slice(0, eqIdx).trim()
      if (k !== name) continue
      const v = part.slice(eqIdx + 1).trim()
      try { return decodeURIComponent(v) } catch { return v }
    }
    return null
  },
}
