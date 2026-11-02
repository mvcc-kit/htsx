/**
 * CSRF token sign/verify usando HMAC-SHA256 (Web Crypto API).
 * Framework-agnostic — funções puras, sem middleware.
 *
 * Padrão: signed token (sessionId.timestamp.signature)
 * - Stateless (não precisa store no server)
 * - Bound a sessionId — token de A não funciona pra B
 * - Expira via timestamp + maxAge
 * - Comparison timing-safe
 */

import { jsx } from './jsx-runtime'
import type { HtmlSafeString } from './jsx-runtime'

const ENCODER = new TextEncoder()

const MIN_SECRET_LENGTH = 32

export interface CsrfOptions {
  /** Secret HMAC. Mínimo 32 chars — throw caso contrário. */
  secret: string
  /** ID da sessão (string opaca). Token fica bound a ele. */
  sessionId: string
  /** Tempo de vida em segundos. Default 3600 (1h). */
  maxAge?: number
}

/** Codifica Uint8Array → base64url (sem padding, URL-safe). */
function toB64Url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * base64url-encode arbitrary UTF-8 string. Diferente de encodeURIComponent
 * (que não escapa `.`), garante que o resultado não conflita com nosso
 * delimitador `.` no token.
 */
function strToB64Url(s: string): string {
  return toB64Url(ENCODER.encode(s))
}

function b64UrlToStr(s: string): string {
  const pad = (4 - (s.length % 4)) % 4
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function hmacSha256(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, ENCODER.encode(data))
  return toB64Url(new Uint8Array(sig))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function validateSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`csrf: secret deve ter no mínimo ${MIN_SECRET_LENGTH} chars`)
  }
}

export const csrf = {
  /** Gera token assinado. Throw se secret < 32 chars. */
  async sign(opts: CsrfOptions): Promise<string> {
    validateSecret(opts.secret)
    if (!opts.sessionId) throw new Error('csrf: sessionId obrigatório')
    const ts = Math.floor(Date.now() / 1000)
    const sid = strToB64Url(opts.sessionId)
    const payload = `${sid}.${ts}`
    const sig = await hmacSha256(opts.secret, payload)
    return `${payload}.${sig}`
  },

  /**
   * Verifica token. Retorna boolean (sem throw em entrada malformada).
   * Falha silenciosa pra evitar exposição de info via logs.
   */
  async verify(token: unknown, opts: CsrfOptions): Promise<boolean> {
    if (typeof token !== 'string' || !token) return false
    if (typeof opts.secret !== 'string' || opts.secret.length < MIN_SECRET_LENGTH) return false
    if (!opts.sessionId) return false

    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [sidEnc, tsStr, sig] = parts as [string, string, string]

    let sid: string
    try { sid = b64UrlToStr(sidEnc) } catch { return false }
    if (sid !== opts.sessionId) return false

    const ts = parseInt(tsStr, 10)
    if (!Number.isFinite(ts) || ts <= 0) return false

    const maxAge = opts.maxAge ?? 3600
    const now = Math.floor(Date.now() / 1000)
    if (now - ts > maxAge) return false
    if (ts > now + 60) return false // tolerância clock skew + bloqueia futuro

    const expected = await hmacSha256(opts.secret, `${sidEnc}.${ts}`)
    return timingSafeEqual(sig, expected)
  },
}

export interface CsrfFieldProps {
  /** Token gerado via csrf.sign() */
  token: string
  /** Name do input. Default '_csrf'. */
  name?: string
}

/** Componente JSX: gera `<input type="hidden" name="_csrf" value="{token}">`. */
export function CsrfField({ token, name = '_csrf' }: CsrfFieldProps): HtmlSafeString {
  // jsx escapa o value automaticamente. Cast: void elem (input) é sync.
  return jsx('input', { type: 'hidden', name, value: token }) as HtmlSafeString
}
