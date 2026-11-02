/**
 * Builder de Response HTMX com HX-* headers tipados.
 */
import { HX_HEADERS } from './htmx-headers'

export interface HtmxResponseOpts {
  trigger?:   string | Record<string, unknown>
  retarget?:  string
  reswap?:    string
  reselect?:  string
  pushUrl?:   string
  redirect?:  string
  refresh?:   boolean
  status?:    number
}

export async function htmxResponse(
  factory: () => unknown,
  opts: HtmxResponseOpts = {},
): Promise<Response> {
  const body = await Promise.resolve(factory())
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
  }

  if (opts.trigger != null) {
    headers[HX_HEADERS.Trigger] =
      typeof opts.trigger === 'string' ? opts.trigger : JSON.stringify(opts.trigger)
  }
  if (opts.retarget) headers[HX_HEADERS.Retarget] = opts.retarget
  if (opts.reswap)   headers[HX_HEADERS.Reswap]   = opts.reswap
  if (opts.reselect) headers[HX_HEADERS.Reselect] = opts.reselect
  if (opts.pushUrl)  headers[HX_HEADERS.PushUrl]  = opts.pushUrl
  if (opts.redirect) headers[HX_HEADERS.Redirect] = opts.redirect
  if (opts.refresh)  headers[HX_HEADERS.Refresh]  = 'true'

  return new Response(String(body), {
    status: opts.status ?? 200,
    headers,
  })
}
