/// <reference path="../jsx.d.ts" />
import { escapeHtml } from './escape'
import { serializeAttrs } from './attrs'
import { VOID_ELEMENTS, RAW_TEXT_ELEMENTS } from './elements'
import { strictFail } from './strict'

/** HTML pronto, que não passa por escape. Sem herdar de `String`: é criado a cada elemento. */
export class HtmlSafeString {
  readonly __htmlSafe = true as const
  constructor(private readonly html: string) {}
  toString(): string { return this.html }
  valueOf(): string { return this.html }
}

export function raw(html: string): HtmlSafeString {
  return new HtmlSafeString(html)
}

function renderChildren(c: unknown, escape: boolean, tag: string | undefined): string | Promise<string> {
  // Em ordem de frequência: é o caminho mais quente do render.
  if (typeof c === 'string') {
    if (escape) return escapeHtml(c)
    throw new Error(
      `htsx: texto comum dentro de <${tag}> pode fechar a tag; use raw() só com conteúdo gerado pelo servidor, ou raw(safeJson(dados)) para dados`
    )
  }
  if (c instanceof HtmlSafeString) return c.toString()
  if (c === null || c === undefined || c === false || c === true) return ''
  if (typeof c === 'number') return String(c)
  if (Array.isArray(c)) return renderList(c, escape, tag)
  if (c instanceof Promise) return c.then(v => renderChildren(v, escape, tag))
  strictFail(`filho ${describeChild(c)} em <${tag ?? 'componente'}> não é desenhado; ${childFix(c)}`)
  return ''
}

function renderList(list: readonly unknown[], escape: boolean, tag: string | undefined): string | Promise<string> {
  let out = ''
  for (let i = 0; i < list.length; i++) {
    const part = renderChildren(list[i], escape, tag)
    if (typeof part !== 'string') {
      // Só aqui paga por promessas: o resto da lista continua na ordem.
      const rest = [part, ...list.slice(i + 1).map(x => renderChildren(x, escape, tag))]
      return Promise.all(rest).then(parts => out + parts.join(''))
    }
    out += part
  }
  return out
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
// Os nomes usados são poucos e se repetem; o limite cobre nomes gerados em tempo de execução.
const knownTags = new Set<string>()

/** O nome sai sem escape no HTML: nome vindo de fora injetaria atributos. */
function assertValidTag(tag: string): void {
  if (knownTags.has(tag)) return
  if (!VALID_TAG.test(tag)) throw new Error(`htsx: nome de elemento inválido ${JSON.stringify(tag)}`)
  if (knownTags.size < 1000) knownTags.add(tag)
}

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
  const given = (props ?? {}) as P & { children?: unknown }
  // merge extra children (React.createElement style) with props.children
  const children = extraChildren.length > 0
    ? (given.children !== undefined
        ? [given.children, ...extraChildren]
        : extraChildren.length === 1 ? extraChildren[0] : extraChildren)
    : given.children

  // component function
  if (typeof tag === 'function') {
    const result = tag((extraChildren.length > 0 ? { ...given, children } : given) as unknown as P)
    if (result instanceof HtmlSafeString) return result
    // retorno passa pelo mesmo caminho dos filhos: texto é escapado
    return toSafe(renderChildren(result, true, undefined))
  }

  assertValidTag(tag)
  const open = `<${tag}${serializeAttrs(given, tag)}>`

  if (VOID_ELEMENTS.has(tag)) {
    return new HtmlSafeString(open)
  }

  const childResult = renderChildren(children, !RAW_TEXT_ELEMENTS.has(tag), tag)

  if (typeof childResult === 'string') return new HtmlSafeString(`${open}${childResult}</${tag}>`)
  return childResult.then(c => new HtmlSafeString(`${open}${c}</${tag}>`))
}

function toSafe(r: string | Promise<string>): HtmlSafeString | Promise<HtmlSafeString> {
  return typeof r === 'string' ? new HtmlSafeString(r) : r.then(c => new HtmlSafeString(c))
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
  return toSafe(renderChildren(props.children, true, undefined))
}
