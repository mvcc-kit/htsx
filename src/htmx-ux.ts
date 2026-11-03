/**
 * Pequenos helpers UX pro HTMX: confirmação, indicator, view transitions.
 * Funções/componentes leves — combinam atributos pra evitar boilerplate.
 */

import { jsx, HtmlSafeString } from './jsx-runtime'
import { escapeAttr } from './escape'

// ──────────── Confirm ────────────

/**
 * Atalho pra `hx-confirm`. Retorna o objeto de props pra spread no elemento.
 *
 * ```tsx
 * <button {...confirmAttrs('Apagar permanente?')} hx-delete="/x/1">×</button>
 * ```
 */
export function confirmAttrs(message: string): { 'hx-confirm': string } {
  return { 'hx-confirm': message }
}

// ──────────── Indicator ────────────

export interface IndicatorProps {
  /** ID/selector do indicator. Default '.htmx-indicator' (CSS class padrão). */
  selector?: string
  /** Conteúdo do indicator (spinner, texto, etc.). */
  children?: unknown
  /** Class custom. */
  class?: string
}

/**
 * Renderiza `<span class="htmx-indicator">{children}</span>` com class padrão
 * que HTMX reconhece (mostra durante request, esconde após).
 */
export function Indicator({
  children = '…',
  class: className,
}: IndicatorProps): HtmlSafeString | Promise<HtmlSafeString> {
  return jsx('span', {
    class: className ? `htmx-indicator ${className}` : 'htmx-indicator',
    children,
  })
}

// ──────────── View Transitions ────────────

/**
 * Habilita transição em swap HTMX 2.0. Retorna props pra spread.
 *
 * ```tsx
 * <a hx-get="/page" {...transitionAttrs()} hx-target="#main">Próximo</a>
 * ```
 */
export function transitionAttrs(
  swap: 'innerHTML' | 'outerHTML' = 'outerHTML',
): { 'hx-swap': string } {
  return { 'hx-swap': `${swap} transition:true` }
}

/**
 * Define `view-transition-name` (CSS) num elemento. Útil pra animação suave
 * entre páginas/parts.
 *
 * ```tsx
 * <article {...transitionName(`product-${id}`)}>...</article>
 * ```
 */
export function transitionName(name: string): { style: string } {
  if (!/^[a-zA-Z][\w-]*$/.test(name)) {
    throw new Error(`htsx: transitionName: nome inválido "${name}"`)
  }
  return { style: `view-transition-name: ${escapeAttr(name)}` }
}
