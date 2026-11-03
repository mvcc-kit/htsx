// Núcleo da aplicação: rotas, load, ações de formulário, hooks e erros.
// Lógica sem plataforma: recebe Request e devolve Response. Os adaptadores
// (estático e Cloudflare Workers) só chamam `app.respond()`.
import { Fragment, raw, toHtml } from '../jsx-runtime'
import { withContext, maybeContext } from '../context'
import { cacheContext } from '../cache'
import { withMeta } from '../meta/collector'
import { isStrict } from '../strict'
import { OUTLET_ID, wantsOutlet } from '../outlet'
import { createHtmxContext, type HtmxContext } from './htmx'
import { HX_REQUEST } from '../htmx-headers'
import { canonicalPath, isCrossSiteForm, routePath, secureCookiesByDefault, wantsHtml, wantsJsonOnly } from './request'
import { HTMX_VARY, htmlResponse, mergeHeaders, withCookies, withSecurityHeaders } from './response'
import { partialNameFromQuery } from './partial-logic'
import { ActionFailure, HttpError, Redirect } from './errors'
import { createCookies, type Cookies } from './cookies'
import { compareRoutes, matchRoute, parseRouteId, type ParamMatcher, type ParamsOf, type ParsedRoute } from './routing'
import type { Children } from '../jsx-types'

type MaybePromise<T> = T | Promise<T>
type Node = unknown

/** Informação da plataforma (no Cloudflare: `{ env, ctx, caches, cf }`). */
export interface Platform {
  [key: string]: unknown
}

export interface RequestEvent<Params = Record<string, string>> {
  request: Request
  url: URL
  params: Params
  /** Id da rota que casou (ex.: `/blog/[slug]`), ou `null` quando nenhuma casou. */
  route: { id: string | null }
  /** Dados da requisição preenchidos pelos hooks (ex.: usuário logado). */
  locals: Record<string, unknown>
  platform: Platform | undefined
  cookies: Cookies
  /** Acrescenta cabeçalhos à resposta (ex.: cache-control). */
  setHeaders(headers: Record<string, string>): void
  /** `true` durante o prerender (build estático). */
  prerendering: boolean
  /** Requisição htmx que não é `hx-boost`: a página sai sem layout. */
  isFragment: boolean
  /** O que o htmx mandou no pedido e o que a resposta manda ele fazer. */
  htmx: HtmxContext
  getClientAddress(): string
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'
const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

type Action<P> = (event: RequestEvent<P>) => MaybePromise<unknown>
type UnwrapAction<R> = R extends ActionFailure<infer F> ? F : Exclude<R, void>
type ActionData<A> = {
  [K in keyof A]: A[K] extends (...args: any[]) => infer R ? UnwrapAction<Awaited<R>> : never
}[keyof A]

export interface PageProps<P, D, F> {
  params: P
  data: D
  /** Resultado da última ação de formulário (ou do `fail()`), quando houver. */
  form: F | undefined
  event: RequestEvent<P>
}

/**
 * Definição da rota. Escreva `load` e `actions` antes de `page`: o TypeScript infere
 * da esquerda para a direita, e `page` usa os tipos de `data` e `form` deles.
 */
export interface RouteDef<Id extends string, D, A> {
  /** Busca os dados da página no servidor. Pode lançar error() ou redirect(). */
  load?: (event: RequestEvent<ParamsOf<Id>>) => MaybePromise<D>
  /** Componente da página. Recebe `data` do load e `form` da ação. */
  page?: (props: PageProps<ParamsOf<Id>, Awaited<D>, ActionData<A>>) => Node
  /** Ações de formulário (POST). `?/name` escolhe a ação; sem nome, usa `default`. */
  actions?: A & Record<string, Action<ParamsOf<Id>>>
  /** Trechos da página com URL própria (`?/name`), pedidos pelo htmx. Veja `partial()`. */
  partials?: Record<string, RoutePartial>
  /** Roda antes de cada parcial (ex.: exigir login), porque o `load` da página não roda nesse pedido. */
  guard?: (event: RequestEvent<ParamsOf<Id>>) => MaybePromise<unknown>
  /** Layout desta rota; `false` desliga o layout do app. */
  layout?: Layout | false
  /** `true`: gera HTML no build; `'auto'`: gera no build e também atende dinamicamente. */
  prerender?: boolean | 'auto'
  /** Valores dos parâmetros para o prerender de rotas dinâmicas. */
  entries?: () => MaybePromise<Array<ParamsOf<Id>>>
  /** Página de erro desta rota (no lugar da do app); devolve o documento inteiro. */
  errorPage?: ErrorPage
  GET?: (event: RequestEvent<ParamsOf<Id>>) => MaybePromise<Response>
  POST?: (event: RequestEvent<ParamsOf<Id>>) => MaybePromise<Response>
  PUT?: (event: RequestEvent<ParamsOf<Id>>) => MaybePromise<Response>
  PATCH?: (event: RequestEvent<ParamsOf<Id>>) => MaybePromise<Response>
  DELETE?: (event: RequestEvent<ParamsOf<Id>>) => MaybePromise<Response>
  OPTIONS?: (event: RequestEvent<ParamsOf<Id>>) => MaybePromise<Response>
}

/** O que o roteador precisa de um parcial. */
export interface RoutePartial {
  bind(name: string, owner: string): void
  handle(event: RequestEvent): Promise<string>
}

export interface Route {
  readonly id: string
  readonly parsed: ParsedRoute
  readonly def: RouteDef<string, unknown, Record<string, Action<any>>>
}

/** Declara uma rota. O id define os parâmetros tipados: `route('/blog/[slug]', { page: ({ params }) => params.slug })`. */
export function route<const Id extends string, D = undefined, A = {}>(id: Id, def: RouteDef<Id, D, A>): Route {
  const r = { id, parsed: parseRouteId(id), def: def as Route['def'] }
  if (def.actions && 'default' in def.actions && Object.keys(def.actions).length > 1) {
    throw new Error(`htsx: rota ${JSON.stringify(id)}: com ações nomeadas não use "default"; dê nome a todas`)
  }
  if (def.actions && def.POST) throw new Error(`htsx: rota ${JSON.stringify(id)} tem actions e POST; escolha um dos dois`)
  if (def.prerender && def.partials) throw new Error(`htsx: rota ${JSON.stringify(id)} tem partials e prerender; parciais precisam de servidor`)
  for (const [name, part] of Object.entries(def.partials ?? {})) part.bind(name, `rota ${JSON.stringify(id)}`)
  if (def.prerender && def.actions) throw new Error(`htsx: rota ${JSON.stringify(id)} tem actions e prerender; ações precisam de servidor`)
  return r
}

export type Layout = (props: { children?: Children; event: RequestEvent }) => Node
export type ErrorPage = (props: { status: number; message: string; event: RequestEvent }) => Node
export type Handle = (input: { event: RequestEvent; resolve: (event: RequestEvent) => Promise<Response> }) => MaybePromise<Response>
export type HandleError = (input: { error: unknown; event: RequestEvent; status: number; message: string }) => MaybePromise<{ message: string } | void>

export interface AppOptions {
  routes: Route[]
  /** Layout padrão das páginas (o `<html>`). Requisições htmx parciais saem sem ele. */
  layout?: Layout
  /** Middleware de toda requisição. Combine vários com `sequence()`. */
  handle?: Handle
  /** Chamado em erro inesperado: registre e devolva uma mensagem segura para o usuário. */
  handleError?: HandleError
  /** Página de erro (404, 500...). */
  errorPage?: ErrorPage
  matchers?: Record<string, ParamMatcher>
  /** Valor padrão de `prerender` das rotas. */
  prerender?: boolean | 'auto'
  /** Barra no fim da URL: `'never'` (padrão) redireciona `/sobre/` para `/sobre`. */
  trailingSlash?: 'never' | 'always'
  /** Checagem de origem em POST/PUT/PATCH/DELETE de formulário. */
  csrf?: { checkOrigin?: boolean; trustedOrigins?: string[] }
  /** Cabeçalhos de segurança: objeto soma ao padrão; `false` desliga. Não valem para arquivos estáticos. */
  securityHeaders?: Record<string, string> | false
  /** Tamanho máximo do corpo da requisição, em bytes. Padrão 10 MB; `false` desliga. */
  bodyLimit?: number | false
  /** Contexto extra para `useContext()` nos componentes. */
  context?: (event: RequestEvent) => Record<string | symbol, unknown>
}

export interface RespondOptions {
  platform?: Platform
  getClientAddress?: () => string
  prerendering?: boolean
}

export interface App {
  readonly routes: readonly Route[]
  readonly options: AppOptions
  respond(request: Request, opts?: RespondOptions): Promise<Response>
  /** Atalho para `Bun.serve({ fetch: app.fetch })` em desenvolvimento. */
  fetch(request: Request): Promise<Response>
}

const EVENT = Symbol.for('htsx.request_event')

/** O evento da requisição atual, de dentro de qualquer componente ou função chamada pela rota. */
export function getRequestEvent(): RequestEvent {
  const ev = maybeContext<{ [EVENT]?: RequestEvent }>()?.[EVENT]
  if (!ev) throw new Error('htsx: getRequestEvent() chamado fora de uma requisição do app')
  return ev
}

/** Encadeia vários `handle`: o primeiro envolve o segundo, e assim por diante. */
export function sequence(...handlers: Handle[]): Handle {
  return ({ event, resolve }) => {
    const run = (i: number, ev: RequestEvent): MaybePromise<Response> =>
      i === handlers.length ? resolve(ev) : handlers[i]!({ event: ev, resolve: e => Promise.resolve(run(i + 1, e)) })
    return run(0, event)
  }
}


const renderNode = toHtml

export function defineApp(options: AppOptions): App {
  const routes = [...options.routes].sort((a, b) => compareRoutes(a.parsed, b.parsed))
  const ids = routes.map(r => r.id)
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) throw new Error(`htsx: rota ${JSON.stringify(dup)} declarada duas vezes`)
  const matchers = options.matchers ?? {}
  for (const r of routes) {
    for (const p of r.parsed.params) {
      if (p.matcher && !matchers[p.matcher]) throw new Error(`htsx: matcher "${p.matcher}" de ${JSON.stringify(r.id)} não existe; registre em defineApp({ matchers: { ${p.matcher}: v => ... } })`)
    }
  }

  // rotas sem parâmetro: busca direta, sem testar expressões regulares
  const fixed = new Map(routes.filter(r => r.parsed.params.length === 0).map(r => [encodeURI(r.id), r]))

  function find(pathname: string): { route: Route; params: Record<string, string> } | null {
    const exact = fixed.get(pathname)
    if (exact) return { route: exact, params: {} }
    for (const r of routes) {
      const params = matchRoute(r.parsed, pathname, matchers)
      if (params) return { route: r, params }
    }
    return null
  }

  async function errorResponse(event: RequestEvent, status: number, message: string, headers: Headers): Promise<Response> {
    if (wantsJsonOnly(event.request.headers.get('accept'))) {
      return Response.json({ message }, { status, headers })
    }
    const errorPage = routes.find(r => r.id === event.route.id)?.def.errorPage ?? options.errorPage
    const plain = async () => `<h1>${status}</h1><p>${String(await Fragment({ children: message }))}</p>`
    let page: string
    try {
      page = errorPage ? await withMeta(() => renderNode(errorPage({ status, message, event }))) : await plain()
    } catch (err) {
      // a própria página de erro falhou (ex.: um layout): responde a versão simples, sem quebrar a resposta
      console.error('htsx: a página de erro falhou ao renderizar', err)
      page = await plain()
    }
    headers.set('content-type', 'text/html; charset=utf-8')
    headers.append('vary', HTMX_VARY)
    return new Response(event.isFragment ? page : `<!DOCTYPE html>${page}`, { status, headers })
  }

  async function renderPage(route: Route, event: RequestEvent, form: unknown, status: number, headers: Headers): Promise<Response> {
    const data = route.def.load ? await route.def.load(event) : undefined
    const layout = route.def.layout === false ? undefined : route.def.layout ?? options.layout
    const partial = route.def.layout === undefined && wantsOutlet(event.request.headers)
    const html = await withMeta(async () => {
      const body = await renderNode(route.def.page!({ params: event.params, data, form, event }))
      if (event.isFragment) return body
      if (!layout) return /^\s*<html[\s>]/i.test(body) ? `<!DOCTYPE html>${body}` : body
      // Layout próprio da rota pode ser outro: nesse caso vai a página inteira, e o cliente escolhe o trecho.
      if (partial) return `<div id="${OUTLET_ID}" hx-history-elt="true">${body}</div>`
      return `<!DOCTYPE html>${await renderNode(layout({ children: raw(body), event }))}`
    })
    headers.set('content-type', 'text/html; charset=utf-8')
    if (layout) headers.append('vary', HTMX_VARY)
    return htmlResponse(event.request, html, status, headers)
  }

  async function runAction(route: Route, event: RequestEvent, headers: Headers): Promise<Response> {
    const actions = route.def.actions!
    const key = [...event.url.searchParams.keys()].find(k => k.startsWith('/'))
    const name = key ? key.slice(1) : 'default'
    const action = actions[name]
    if (!action) {
      // A lista de ações ajuda quem programa, mas não deve ir para qualquer visitante.
      if (isStrict()) {
        const known = Object.keys(actions).map(n => n === 'default' ? 'action=""' : `action="?/${n}"`).join(', ')
        return errorResponse(event, 404, `Ação "${name}" não existe nesta rota (use ${known})`, headers)
      }
      return errorResponse(event, 404, 'Não encontrado', headers)
    }
    const result = await action(event)
    if (result instanceof Response) return mergeHeaders(result, headers)
    if (result instanceof ActionFailure) return renderPage(route, event, result.data, result.status, headers)
    if (!route.def.page) return Response.json(result ?? null, { headers })
    return renderPage(route, event, result ?? undefined, 200, headers)
  }

  async function resolve(event: RequestEvent, match: { route: Route } | null, headers: Headers): Promise<Response> {
    if (!match) return errorResponse(event, 404, 'Não encontrado', headers)
    const { def } = match.route
    const method = event.request.method.toUpperCase() as Method | 'HEAD'
    if (def.partials && (method === 'GET' || method === 'HEAD')) {
      const name = partialNameFromQuery(event.url.searchParams)
      if (name !== null) {
        if (!Object.hasOwn(def.partials, name)) return errorResponse(event, 404, 'Não encontrado', headers)
        await def.guard?.(event as never)
        const html = await withMeta(() => def.partials![name]!.handle(event))
        headers.set('content-type', 'text/html; charset=utf-8')
        // pedaço de página: não deve aparecer em buscadores
        headers.set('x-robots-tag', 'noindex')
        const res = await htmlResponse(event.request, html, 200, headers)
        return method === 'HEAD' ? new Response(null, res) : res
      }
    }
    const endpoint = def[method === 'HEAD' ? 'GET' : method as Method]
    if (endpoint && !(method === 'GET' && def.page && wantsHtml(event.request.headers.get('accept')))) {
      const res = mergeHeaders(await endpoint(event), headers)
      return method === 'HEAD' ? new Response(null, res) : res
    }
    if (def.page && (method === 'GET' || method === 'HEAD')) {
      const res = await renderPage(match.route, event, undefined, 200, headers)
      return method === 'HEAD' ? new Response(null, res) : res
    }
    if (def.actions && method === 'POST') return runAction(match.route, event, headers)
    const allow = METHODS.filter(m => def[m] || (m === 'GET' && def.page) || (m === 'POST' && def.actions))
    headers.set('allow', [...allow, ...(allow.includes('GET') ? ['HEAD'] : [])].join(', '))
    return errorResponse(event, 405, `Método ${method} não permitido`, headers)
  }

  async function respond(incoming: Request, opts: RespondOptions = {}): Promise<Response> {
    const limited = limitRequestBody(incoming, options.bodyLimit ?? DEFAULT_BODY_LIMIT)
    if (limited === null) return new Response('Corpo da requisição grande demais', { status: 413 })
    const request = limited
    const url = new URL(request.url)
    const slash = options.trailingSlash ?? 'never'
    if (request.method === 'GET' || request.method === 'HEAD') {
      const canonical = canonicalPath(url.pathname, slash)
      if (canonical !== url.pathname) return new Response(null, { status: 308, headers: { location: canonical + url.search } })
    }
    const match = find(routePath(url.pathname))
    const headers = new Headers()
    const isHtmxReq = request.headers.get(HX_REQUEST.Request) === 'true'
    let htmx: HtmxContext | undefined
    const event: RequestEvent = {
      request,
      url,
      params: match?.params ?? {},
      route: { id: match?.route.id ?? null },
      locals: {},
      platform: opts.platform,
      cookies: createCookies(request, secureCookiesByDefault(url)),
      setHeaders(h) {
        for (const [k, v] of Object.entries(h)) {
          if (k.toLowerCase() === 'set-cookie') throw new Error('htsx: use event.cookies.set() em vez de setHeaders({ "set-cookie" })')
          if (headers.has(k)) throw new Error(`htsx: cabeçalho "${k}" definido duas vezes com setHeaders`)
          headers.set(k, v)
        }
      },
      prerendering: !!opts.prerendering,
      isFragment: isHtmxReq && request.headers.get(HX_REQUEST.Boosted) !== 'true' && request.headers.get(HX_REQUEST.HistoryRestore) !== 'true',
      // Sob demanda: a maioria das rotas não usa.
      get htmx() { return (htmx ??= createHtmxContext(request.headers, headers)) },
      getClientAddress: opts.getClientAddress ?? (() => { throw new Error('htsx: getClientAddress() não está disponível nesta plataforma') }),
    }

    const csrf = options.csrf ?? {}
    if ((csrf.checkOrigin ?? true) && isCrossSiteForm({
      method: request.method,
      contentType: request.headers.get('content-type'),
      origin: request.headers.get('origin'),
      self: url.origin,
      trusted: csrf.trustedOrigins ?? [],
    })) {
      return new Response(`Envio de formulário ${request.method} entre sites bloqueado`, { status: 403 })
    }

    const ctx = { [EVENT]: event, ...cacheContext(), ...options.context?.(event) }
    const res = await withContext(ctx, async () => {
      try {
        const handle = options.handle ?? (({ event: e, resolve: r }) => r(e))
        return await handle({ event, resolve: e => safeResolve(e, match, headers) })
      } catch (err) {
        return fromError(err, event, headers)
      }
    })
    return withCookies(withSecurityHeaders(res, options.securityHeaders), event.cookies.headers)
  }

  async function safeResolve(event: RequestEvent, match: { route: Route } | null, headers: Headers): Promise<Response> {
    try { return await resolve(event, match, headers) } catch (err) { return fromError(err, event, headers) }
  }

  async function fromError(err: unknown, event: RequestEvent, headers: Headers): Promise<Response> {
    if (err instanceof Redirect) {
      headers.set('location', err.location)
      // htmx segue redirecionamento sozinho, mas troca só o alvo; HX-Redirect faz navegação completa
      if (event.request.headers.get(HX_REQUEST.Request) === 'true') headers.set('hx-redirect', err.location)
      return new Response(null, { status: err.status, headers })
    }
    if (err instanceof HttpError) return errorResponse(event, err.status, err.message, headers)
    const fallback = { message: 'Erro interno' }
    let safe: { message: string } = fallback
    try {
      safe = (await options.handleError?.({ error: err, event, status: 500, message: 'Erro interno' })) ?? fallback
    } catch (handlerError) {
      console.error('htsx: handleError falhou', handlerError)
    }
    if (!options.handleError) console.error(err)
    return errorResponse(event, 500, safe.message, headers)
  }

  return {
    routes,
    options,
    respond,
    fetch: request => respond(request),
  }
}

const DEFAULT_BODY_LIMIT = 10 * 1024 * 1024

/**
 * Recusa corpo grande demais antes de ler (`null`). Sem Content-Length, conta os bytes enquanto
 * chegam: ler `formData()` depois de passar do limite falha com 413.
 */
function limitRequestBody(request: Request, limit: number | false): Request | null {
  if (limit === false || !request.body) return request
  const declared = Number(request.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared)) return declared > limit ? null : request
  let received = 0
  const counted = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength
      if (received > limit) controller.error(new HttpError(413, 'Corpo da requisição grande demais'))
      else controller.enqueue(chunk)
    },
  }))
  return new Request(request, { body: counted, duplex: 'half' } as RequestInit)
}
