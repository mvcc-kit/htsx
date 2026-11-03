/**
 * HTMX request detection — framework-agnostic.
 * Aceita Request padrão, Headers, ou qualquer objeto { headers: Headers }.
 */
import { HX_REQUEST } from './htmx-headers'

export type ReqLike = Request | Headers | { headers: Headers }

function getHeaders(r: ReqLike): Headers {
  if (r instanceof Headers) return r
  if (typeof Request !== 'undefined' && r instanceof Request) return r.headers
  // duck-type fallback (Hono Context, Node IncomingMessage adapter, etc.)
  const candidate = (r as { headers?: unknown }).headers
  if (candidate instanceof Headers) return candidate
  if (candidate && typeof candidate === 'object') {
    // pode ser objeto plain {key: value} — converte
    const h = new Headers()
    for (const [k, v] of Object.entries(candidate as Record<string, string | string[]>)) {
      if (Array.isArray(v)) v.forEach(vv => h.append(k, vv))
      else if (v != null) h.set(k, String(v))
    }
    return h
  }
  throw new Error('htmx-detect: argumento sem .headers válido')
}

/** `HX-Request: true` → request feita pelo HTMX (não navegação direta). */
export function isHtmx(r: ReqLike): boolean {
  return getHeaders(r).get(HX_REQUEST.Request) === 'true'
}

/** `HX-Boosted: true` → request veio de link/form com hx-boost. */
export function isBoosted(r: ReqLike): boolean {
  return getHeaders(r).get(HX_REQUEST.Boosted) === 'true'
}

/** ID do elemento target do request (ou null). */
export function hxTarget(r: ReqLike): string | null {
  return getHeaders(r).get(HX_REQUEST.Target)
}

/** ID do elemento que disparou o request. */
export function hxTrigger(r: ReqLike): string | null {
  return getHeaders(r).get(HX_REQUEST.Trigger)
}

/** Atributo name do elemento que disparou. */
export function hxTriggerName(r: ReqLike): string | null {
  return getHeaders(r).get(HX_REQUEST.TriggerName)
}

/** URL atual do browser quando o request foi feito. */
export function hxCurrentUrl(r: ReqLike): string | null {
  return getHeaders(r).get(HX_REQUEST.CurrentUrl)
}

/** Resposta do user em hx-prompt. */
export function hxPrompt(r: ReqLike): string | null {
  return getHeaders(r).get(HX_REQUEST.Prompt)
}

/** Indica se a request foi feita via History API restore (back/forward). */
export function isHistoryRestore(r: ReqLike): boolean {
  return getHeaders(r).get(HX_REQUEST.HistoryRestore) === 'true'
}
