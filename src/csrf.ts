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
import { hmacSha256, isStrongSecret, MIN_SECRET_LENGTH, textToB64Url, timingSafeEqual } from './crypto'

export interface CsrfOptions {
  /** Secret HMAC. Mínimo 32 chars — throw caso contrário. */
  secret: string
  /** ID da sessão (string opaca). Token fica bound a ele. */
  sessionId: string
  /** Tempo de vida em segundos. Default 3600 (1h). */
  maxAge?: number
}

/** Prefixo separa do flash, caso usem o mesmo segredo. */
function signedText(sessionId: string, ts: number): string {
  return `csrf:${textToB64Url(sessionId)}.${ts}`
}

function validateSecret(secret: string): void {
  if (!isStrongSecret(secret)) {
    throw new Error(`htsx: csrf: secret deve ter no mínimo ${MIN_SECRET_LENGTH} chars`)
  }
}

export const csrf = {
  /** Gera token assinado. Throw se secret < 32 chars. */
  async sign(opts: CsrfOptions): Promise<string> {
    validateSecret(opts.secret)
    if (!opts.sessionId) throw new Error('htsx: csrf: sessionId obrigatório')
    const ts = Math.floor(Date.now() / 1000)
    return `${ts}.${await hmacSha256(opts.secret, signedText(opts.sessionId, ts))}`
  },

  /**
   * Verifica token. Retorna boolean (sem throw em entrada malformada).
   * Falha silenciosa pra evitar exposição de info via logs.
   */
  async verify(token: unknown, opts: CsrfOptions): Promise<boolean> {
    if (typeof token !== 'string' || !token) return false
    if (!isStrongSecret(opts.secret)) return false
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
