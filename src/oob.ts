import { HtmlSafeString, raw } from './jsx-runtime'
import { escapeAttr, escapeHtml } from './escape'

export type OOBSwap =
  | 'innerHTML' | 'outerHTML' | 'textContent'
  | 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend'
  | 'delete' | 'true'

// id HTML válido: começa com letra, depois alfanum/_/-/:
// (Bloqueia path traversal, espaços, aspas, brackets — XSS via target.)
const ID_RE = /^[a-zA-Z][\w:.-]*$/

export interface OOBProps {
  /** Selector id (com ou sem '#') ou ID nu. */
  target: string
  /** Tipo de swap. Default 'outerHTML'. */
  swap?: OOBSwap
  /** Tag wrapper. Default 'div'. Use 'tr' dentro de table, 'option' em select etc. */
  tag?: 'div' | 'span' | 'tr' | 'td' | 'li' | 'option' | 'tbody' | 'thead'
  children?: unknown
}

/**
 * Out-of-Band swap component — emite um fragmento que HTMX vai trocar
 * em outro lugar do DOM, fora do alvo principal do response.
 *
 * Útil pra: atualizar contador em badge, mostrar flash, sincronizar widget.
 *
 * Segurança:
 * - target validado por regex (sem injection via id malicioso)
 * - swap deve ser literal OOBSwap (TS) + escape de fallback
 * - children passam pelo render normal (escape automático)
 */
export function OOB({
  target,
  swap = 'outerHTML',
  tag = 'div',
  children,
}: OOBProps): HtmlSafeString {
  const id = target.startsWith('#') ? target.slice(1) : target
  if (!ID_RE.test(id)) {
    throw new Error(`OOB: target inválido "${target}" — use ID HTML válido (letra inicial, alfanum/_/-/:/.)`)
  }
  // 'true' = swap padrão 'outerHTML' usando o id do elemento como target implícito
  // forma com target explícito: 'innerHTML:#myId'
  const oobValue = swap === 'outerHTML' || swap === 'true'
    ? 'true'
    : `${swap}:#${id}`
  // Safe-stringify children: HtmlSafeString passes through as-is (already escaped);
  // plain strings are escaped so callers can't inject raw HTML via OOB children.
  const childStr = children instanceof HtmlSafeString
    ? String(children)
    : escapeHtml(String(children ?? ''))
  return raw(
    `<${tag} id="${escapeAttr(id)}" hx-swap-oob="${escapeAttr(oobValue)}">${childStr}</${tag}>`,
  )
}
