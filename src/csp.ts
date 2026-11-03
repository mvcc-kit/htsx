// Content-Security-Policy pronta para o htsx. Puro: só monta o texto do cabeçalho.

export interface CspOptions {
  /** A página usa o Alpine padrão, que precisa de `unsafe-eval`. */
  alpine?: boolean
  /** Nonce desta resposta, para `<style>` e `<script>` da página. Passe também ao `<Head nonce>`. */
  nonce?: string
  /** Origens extras para `fetch`, htmx e SSE. */
  connect?: readonly string[]
  /** Origens extras de imagem. */
  images?: readonly string[]
  /** Origens extras de script (ex.: Turnstile). */
  scripts?: readonly string[]
  /** Origens extras de iframe. */
  frames?: readonly string[]
}

const NONCE = /^[A-Za-z0-9+/_=-]+$/
const ORIGIN = /^(?:https?:\/\/[^\s;,']+|'self'|data:|blob:)$/

function sources(extra: readonly string[] | undefined): string[] {
  for (const source of extra ?? []) {
    // `;` criaria outra diretiva, e aspas, outra palavra-chave
    if (!ORIGIN.test(source)) throw new Error(`htsx: origem inválida na CSP: ${JSON.stringify(source)}`)
  }
  return [...(extra ?? [])]
}

/** `securityHeaders: { 'content-security-policy': contentSecurityPolicy() }`. */
export function contentSecurityPolicy(opts: CspOptions = {}): string {
  if (opts.nonce !== undefined && !NONCE.test(opts.nonce)) throw new Error('htsx: nonce inválido na CSP')
  const nonce = opts.nonce ? [`'nonce-${opts.nonce}'`] : []
  const frames = sources(opts.frames)
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...nonce, ...(opts.alpine ? ["'unsafe-eval'"] : []), ...sources(opts.scripts)]],
    ['style-src', ["'self'", ...nonce]],
    ['img-src', ["'self'", 'data:', ...sources(opts.images)]],
    ['connect-src', ["'self'", ...sources(opts.connect)]],
    ['frame-src', frames.length ? frames : ["'none'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'self'"]],
  ]
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ')
}

/** Nonce novo a cada resposta. */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/=+$/, '')
}
