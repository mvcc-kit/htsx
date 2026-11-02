export { HtmlSafeString, raw } from './src/jsx-runtime'
export { jsx, jsxs, Fragment } from './src/jsx-runtime'
export type { Child, Children } from './src/jsx-types'
export { HX_HEADERS } from './src/htmx-headers'
export { clx } from './src/clx'
export { safeUrl } from './src/safe-url'
export { storeInit, alpinePlugin } from './src/alpine'
export type { AlpinePluginName } from './src/alpine'
export { htmxResponse } from './src/htmx-response'
export type { HtmxResponseOpts } from './src/htmx-response'
export { head } from './src/head'
export type { HeadOpts } from './src/head'
export { withContext, useContext, maybeContext } from './src/context'
export {
  isHtmx, isBoosted, hxTarget, hxTrigger, hxTriggerName,
  hxCurrentUrl, hxPrompt, isHistoryRestore,
} from './src/htmx-detect'
export type { ReqLike } from './src/htmx-detect'
export { OOB } from './src/oob'
export type { OOBProps, OOBSwap } from './src/oob'
export { ErrorBoundary } from './src/error-boundary'
export type { ErrorBoundaryProps } from './src/error-boundary'
export { Suspense, suspenseRegistry, resolveSuspense } from './src/suspense'
export type { SuspenseProps, SuspenseRegistry } from './src/suspense'
export { defineEvents } from './src/events'
export type { EventMap, EventEmitter } from './src/events'
export { sseEvent, sseResponse } from './src/sse'
export type { SseEventOpts, SseResponseOpts } from './src/sse'
export { csrf, CsrfField } from './src/csrf'
export type { CsrfOptions, CsrfFieldProps } from './src/csrf'
export { cache, cacheContext, cacheSize } from './src/cache'
export type { CacheOptions } from './src/cache'
export { flash } from './src/flash'
export type { FlashMessage, FlashType, CookieOpts as FlashCookieOpts } from './src/flash'
export { Form, Field, formContext } from './src/forms'
export type { FormProps, FieldProps } from './src/forms'
export { slot } from './src/slots'
export type { Slots, SlotComponentProps } from './src/slots'
export {
  confirmAttrs, Indicator, transitionAttrs, transitionName,
} from './src/htmx-ux'
export type { IndicatorProps } from './src/htmx-ux'

type AnyNode = unknown

import { withContext as _withContext } from './src/context'

export interface RenderOptions<Ctx = unknown> {
  context?: Ctx
}

export function renderPage<Ctx = unknown>(
  factory: () => AnyNode,
  opts?: RenderOptions<Ctx>,
): Promise<string> {
  const run = async () => {
    const body = await Promise.resolve(factory())
    return `<!DOCTYPE html>${String(body)}`
  }
  return opts && 'context' in opts
    ? _withContext(opts.context, run)
    : run()
}

export function renderToString<Ctx = unknown>(
  factory: () => AnyNode,
  opts?: RenderOptions<Ctx>,
): Promise<string> {
  const run = async () => String(await Promise.resolve(factory()))
  return opts && 'context' in opts
    ? _withContext(opts.context, run)
    : run()
}

// ── Type helpers ──────────────────────────────────────────────────────────────

import { HtmlSafeString as _HtmlSafeString } from './src/jsx-runtime'
import type { Children } from './src/jsx-types'

export type RenderResult =
  | string
  | _HtmlSafeString
  | Promise<string | _HtmlSafeString>

export type Component<P = object> = (
  props: P,
) => RenderResult

export type ParentComponent<P = object> = Component<
  P & { children?: Children }
>

export type FC<P = object> = Component<P>

export type PropsWithChildren<P = object> = P & { children?: Children }

// Factory functions — ergonomic alternative to explicit type annotations

export function defineComponent<P = object>(
  fn: Component<P>,
): Component<P> {
  return fn
}

export function defineLayout<P = object>(
  fn: ParentComponent<P>,
): ParentComponent<P> {
  return fn
}
