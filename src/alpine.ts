/**
 * Alpine.js integration helpers — registro de stores e plugins via SSR.
 */
import { escapeAttr, safeJson } from './escape'

export type AlpinePluginName =
  | 'mask' | 'persist' | 'focus' | 'collapse'
  | 'intersect' | 'sort' | 'anchor' | 'morph'

export const STORE_NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

/**
 * Emite `<script>` que registra um Alpine.store no `alpine:init`.
 * Payload via safeJson (escapa </script>, U+2028/2029).
 */
export function storeInit(
  name: string,
  data: unknown,
  opts?: { nonce?: string },
): string {
  if (!STORE_NAME_RE.test(name)) {
    throw new Error(`storeInit: invalid store name "${name}"`)
  }
  const json = safeJson(data)
  const nonce = opts?.nonce ? ` nonce="${escapeAttr(opts.nonce)}"` : ''
  return `<script${nonce}>document.addEventListener('alpine:init',()=>{Alpine.store('${name}',${json})})</script>`
}

/**
 * Emite `<script>` que executa código no `alpine:init`.
 * Útil pra `Alpine.data()`, `Alpine.magic()`, `Alpine.directive()`.
 *
 * @danger O parâmetro `code` é inserido diretamente num bloco `<script>`.
 * NUNCA passe input de usuário sem sanitização prévia.
 * Use apenas código JS confiável definido no seu código-fonte.
 */
export function alpinePlugin(code: string, opts?: { nonce?: string }): string {
  // Prevent `</script>` from prematurely terminating the tag.
  // The HTML tokenizer matches literal `</script` — `<\/script` is not
  // recognized as a closing tag but parses as `/script` in JS (valid).
  const safeCode = code.replace(/<\/(script)/gi, '<\\/$1')
  const nonce = opts?.nonce ? ` nonce="${escapeAttr(opts.nonce)}"` : ''
  return `<script${nonce}>document.addEventListener('alpine:init',()=>{${safeCode}})</script>`
}
