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

import { b64UrlToText, hmacSha256, isStrongSecret, MIN_SECRET_LENGTH, textToB64Url, timingSafeEqual } from './crypto'
import { COOKIE_NAME, UNSAFE_COOKIE_ATTR } from './patterns'

function assertCookieAttr(attr: string, text: string | undefined): void {
  if (text !== undefined && UNSAFE_COOKIE_ATTR.test(text)) throw new Error(`flash: ${attr} não pode ter ";" nem quebra de linha`)
}

function assertCookieName(name: string): void {
  if (!COOKIE_NAME.test(name)) {
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
    if (!isStrongSecret(opts.secret)) {
      throw new Error(`flash: secret mínimo ${MIN_SECRET_LENGTH} chars`)
    }
    if (!Array.isArray(messages)) throw new Error('flash: messages deve ser array')
    const sanitized = messages.filter(isValidMessage)
    const payload = textToB64Url(JSON.stringify(sanitized))
    const sig = await hmacSha256(opts.secret, payload)
    return `${payload}.${sig}`
  },

  /** Parse + valida + filtra. Retorna [] em qualquer erro (não throw). */
  async parse(token: unknown, opts: FlashSecret): Promise<FlashMessage[]> {
    if (typeof token !== 'string' || !token) return []
    if (!isStrongSecret(opts.secret)) return []

    const parts = token.split('.')
    if (parts.length !== 2) return []
    const [payload, sig] = parts as [string, string]

    const expected = await hmacSha256(opts.secret, payload)
    if (!timingSafeEqual(sig, expected)) return []

    try {
      const json = b64UrlToText(payload)
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
    assertCookieAttr('value', value)
    assertCookieAttr('path', opts.path)
    assertCookieAttr('domain', opts.domain)
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
    assertCookieAttr('path', opts.path)
    assertCookieAttr('domain', opts.domain)
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
