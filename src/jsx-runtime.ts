/// <reference path="../jsx.d.ts" />
import { escapeHtml } from './escape'
import { serializeAttrs } from './attrs'
import { VOID_ELEMENTS, RAW_TEXT_ELEMENTS } from './elements'
import { strictFail } from './strict'

export class HtmlSafeString extends String {
  readonly __htmlSafe = true as const
}

export function raw(html: string): HtmlSafeString {
  return new HtmlSafeString(html)
}

interface RenderCtx {
  escape: boolean
  tag?: string
}

function renderChildren(c: unknown, ctx: RenderCtx): string | Promise<string> {
  if (c === null || c === undefined || c === false || c === true) return ''
  if (typeof c === 'number') return String(c)
  if (c instanceof HtmlSafeString) return c.toString()
  if (typeof c === 'string') {
    if (ctx.escape) return escapeHtml(c)
    throw new Error(
      `htsx: texto comum dentro de <${ctx.tag}> pode fechar a tag; use raw() só com conteúdo gerado pelo servidor, ou raw(safeJson(dados)) para dados`,
    )
  }
  if (c instanceof Promise) return c.then(v => renderChildren(v, ctx))
  if (Array.isArray(c)) {
    const parts = c.map(x => renderChildren(x, ctx))
    if (parts.some(p => p instanceof Promise)) {
      return Promise.all(parts).then(arr => arr.join(''))
    }
    return (parts as string[]).join('')
  }
  strictFail(`filho ${describeChild(c)} em <${ctx.tag ?? 'componente'}> não é desenhado; ${childFix(c)}`)
  return ''
}

function describeChild(c: unknown): string {
  if (c instanceof Date) return 'do tipo Date'
  if (typeof c === 'object') return `do tipo objeto (${Object.prototype.toString.call(c).slice(8, -1)})`
  return `do tipo ${typeof c}`
}

function childFix(c: unknown): string {
  if (c instanceof Date) return 'converta para texto, ex.: data.toLocaleDateString("pt-BR")'
  if (typeof c === 'bigint') return 'converta para texto com String(valor)'
  if (typeof c === 'function') return 'chame a função ou use como componente: <Comp />'
  return 'escolha o campo a mostrar ou serialize com JSON.stringify(valor)'
}

const VALID_TAG = /^[a-zA-Z][a-zA-Z0-9:._-]*$/

type Tag<P extends Record<string, unknown>> = string | ((props: P) => unknown)

/**
 * Estilo `createElement`/`h`: filhos também como argumentos extras.
 * `createElement('ul', {}, h('li', {}, 'a'), 'b')`.
 */
export function createElement<P extends Record<string, unknown>>(
  tag: Tag<P>,
  props: P | null,
  ...extraChildren: unknown[]
): HtmlSafeString | Promise<HtmlSafeString> {
  const { children: propsChildren, ...rest } = props ?? ({} as P)
  // merge extra children (React.createElement style) with props.children
  const children = extraChildren.length > 0
    ? (propsChildren !== undefined
        ? [propsChildren, ...extraChildren]
        : extraChildren.length === 1 ? extraChildren[0] : extraChildren)
    : propsChildren

  // component function
  if (typeof tag === 'function') {
    const result = tag({ ...rest, children } as unknown as P)
    if (result instanceof HtmlSafeString) return result
    // retorno passa pelo mesmo caminho dos filhos: texto é escapado
    return toSafe(renderChildren(result, { escape: true }))
  }

  // o nome sai sem escape no HTML: nome vindo de fora injetaria atributos
  if (!VALID_TAG.test(tag)) throw new Error(`htsx: nome de elemento inválido ${JSON.stringify(tag)}`)
  const attrs = serializeAttrs(rest as Record<string, unknown>, tag)
  const open = `<${tag}${attrs}>`

  if (VOID_ELEMENTS.has(tag)) {
    return new HtmlSafeString(open)
  }

  const isRaw = RAW_TEXT_ELEMENTS.has(tag)
  const ctx: RenderCtx = { escape: !isRaw, tag }

  const childResult = renderChildren(children, ctx)

  if (childResult instanceof Promise) {
    return childResult.then(c => new HtmlSafeString(`${open}${c}</${tag}>`))
  }

  return new HtmlSafeString(`${open}${childResult}</${tag}>`)
}

function toSafe(r: string | Promise<string>): HtmlSafeString | Promise<HtmlSafeString> {
  return r instanceof Promise ? r.then(c => new HtmlSafeString(c)) : new HtmlSafeString(r)
}

/**
 * Runtime automático do JSX (`jsx: react-jsx`): `jsx(tipo, props, key)`.
 * A `key` só serve para listas no React; aqui é ignorada (não vira filho nem atributo).
 */
export function jsx<P extends Record<string, unknown>>(tag: Tag<P>, props: P, _key?: unknown): HtmlSafeString | Promise<HtmlSafeString> {
  return createElement(tag, props)
}

export const jsxs = jsx
export const jsxDEV = jsx

/** Renderiza qualquer nó (JSX, lista, Promise, texto) em HTML; texto comum é escapado. */
export async function toHtml(node: unknown): Promise<string> {
  return String(await Fragment({ children: node }))
}

export function Fragment(props: { children?: unknown }): HtmlSafeString | Promise<HtmlSafeString> {
  return toSafe(renderChildren(props.children, { escape: true }))
}
