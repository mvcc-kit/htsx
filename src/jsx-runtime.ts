/// <reference path="../jsx.d.ts" />
import { escapeHtml } from './escape'
import { serializeAttrs } from './attrs'
import { VOID_ELEMENTS, RAW_TEXT_ELEMENTS } from './elements'

export class HtmlSafeString extends String {
  readonly __htmlSafe = true as const
}

export function raw(html: string): HtmlSafeString {
  return new HtmlSafeString(html)
}

interface RenderCtx {
  escape: boolean
}

function renderChildren(c: unknown, ctx: RenderCtx): string | Promise<string> {
  if (c === null || c === undefined || c === false || c === true) return ''
  if (typeof c === 'number') return String(c)
  if (c instanceof HtmlSafeString) return c.toString()
  if (typeof c === 'string') return ctx.escape ? escapeHtml(c) : c
  if (c instanceof Promise) return c.then(v => renderChildren(v, ctx))
  if (Array.isArray(c)) {
    const parts = c.map(x => renderChildren(x, ctx))
    if (parts.some(p => p instanceof Promise)) {
      return Promise.all(parts).then(arr => arr.join(''))
    }
    return (parts as string[]).join('')
  }
  return ''
}

type Tag<P extends Record<string, unknown>> = string | ((props: P) => unknown)

export function jsx<P extends Record<string, unknown>>(
  tag: Tag<P>,
  props: P,
  ...extraChildren: unknown[]
): HtmlSafeString | Promise<HtmlSafeString> {
  const { children: propsChildren, ...rest } = props
  // merge extra children (React.createElement style) with props.children
  const children = extraChildren.length > 0
    ? (propsChildren !== undefined
        ? [propsChildren, ...extraChildren]
        : extraChildren.length === 1 ? extraChildren[0] : extraChildren)
    : propsChildren

  // component function
  if (typeof tag === 'function') {
    const result = tag({ ...rest, children } as unknown as P)
    if (result instanceof Promise) {
      return result.then(v => {
        if (v instanceof HtmlSafeString) return v
        return new HtmlSafeString(String(v))
      })
    }
    if (result instanceof HtmlSafeString) return result
    return new HtmlSafeString(String(result))
  }

  const attrs = serializeAttrs(rest as Record<string, unknown>)
  const open = `<${tag}${attrs}>`

  if (VOID_ELEMENTS.has(tag)) {
    return new HtmlSafeString(open)
  }

  const isRaw = RAW_TEXT_ELEMENTS.has(tag)
  const ctx: RenderCtx = { escape: !isRaw }

  const childResult = renderChildren(children, ctx)

  if (childResult instanceof Promise) {
    return childResult.then(c => new HtmlSafeString(`${open}${c}</${tag}>`))
  }

  return new HtmlSafeString(`${open}${childResult}</${tag}>`)
}

export const jsxs = jsx

export function Fragment(props: { children?: unknown }): HtmlSafeString | Promise<HtmlSafeString> {
  const result = renderChildren(props.children, { escape: true })
  if (result instanceof Promise) {
    return result.then(c => new HtmlSafeString(c))
  }
  return new HtmlSafeString(result)
}
