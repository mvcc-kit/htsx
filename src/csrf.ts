/**
 * CSRF token sign/verify usando HMAC-SHA256 (Web Crypto API).
 * Framework-agnostic — funções puras, sem middleware.
 *
 * Padrão: signed token (timestamp.signature), com o sessionId só dentro da assinatura:
 * o token vai para o HTML, e o id da sessão não pode ir junto.
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

/** Prefixo separa do flash, caso usem o mesmo segredo. */
function signedText(sessionId: string, ts: number): string {
  return `csrf:${strToB64Url(sessionId)}.${ts}`
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
    return `${ts}.${await hmacSha256(opts.secret, signedText(opts.sessionId, ts))}`
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
    if (parts.length !== 2) return false
    const [tsStr, sig] = parts as [string, string]
    if (!/^\d{1,12}$/.test(tsStr)) return false
    const ts = Number(tsStr)
    if (ts <= 0) return false

    const maxAge = opts.maxAge ?? 3600
    const now = Math.floor(Date.now() / 1000)
    if (now - ts > maxAge) return false
    if (ts > now + 60) return false // tolerância clock skew + bloqueia futuro

    const expected = await hmacSha256(opts.secret, signedText(opts.sessionId, ts))
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
