// Rotas por arquivos (opcional), no modelo do SvelteKit, tudo no servidor:
//   +layout.tsx / +layout.server.ts → layouts aninhados; `load` recebe `parent()`
//   +page.tsx / +page.server.ts     → página; `load`, `actions`, `prerender`, `entries`
//   +server.ts                      → GET/POST/... (endpoint)
//   +error.tsx                      → página de erro mais próxima
//   +name.partial.tsx               → trecho da página com URL própria (`?/name`), pedido pelo htmx
// Os dados descem: cada layout recebe os dados dele e dos layouts acima; a página recebe todos.
// Lógica pura: recebe os módulos já importados (o manifesto gerado no sync do htsx.config.ts).
import { route, type ErrorPage, type Layout, type RequestEvent, type Route, type RouteDef, type RoutePartial } from './app'
import type { ParamMatcher } from './routing'
import type { ActionFailure } from './errors'
import { createElement as h } from '../jsx-runtime'

type Data = Record<string, unknown>
type AnyFn = (...args: any[]) => any

export type MaybePromise<T> = T | Promise<T>

// ── Tipos usados pelos `$types.d.ts` gerados ──
/** Dados devolvidos pelo `load` de um módulo (`{}` se não houver ou devolver nada). */
export type LoadData<M> = M extends { load: (...args: any[]) => infer R } ? (Awaited<R> extends void | undefined ? {} : Exclude<Awaited<R>, void | undefined>) : {}
/** Dados do pai com os do filho por cima (como o `data` do SvelteKit). */
export type MergeData<Parent, Own> = Omit<Parent, keyof Own> & Own
type UnwrapActionResult<R> = R extends ActionFailure<infer F> ? F : Exclude<R, void>
/** União dos resultados das ações de um módulo (o `data` do `fail()` ou o objeto devolvido). */
export type ActionDataOf<M> = M extends { actions: infer A }
  ? { [K in keyof A]: A[K] extends (...args: any[]) => infer R ? UnwrapActionResult<Awaited<R>> : never }[keyof A]
  : undefined

/** Evento do `load` em arquivos: o da requisição mais `parent()`, os dados dos layouts acima. */
export type ServerLoadEvent<Params = Record<string, string>, Parent = Data> = RequestEvent<Params> & {
  parent(): Promise<Parent>
}

export interface LayoutServerModule { load?: (event: ServerLoadEvent<any, any>) => MaybePromise<Data | void>; prerender?: boolean | 'auto' }
export interface LayoutModule { default: AnyFn }
export interface PageServerModule {
  load?: (event: ServerLoadEvent<any, any>) => MaybePromise<Data | void>
  actions?: Record<string, AnyFn>
  prerender?: boolean | 'auto'
  entries?: () => MaybePromise<Array<Record<string, string>>>
}
export interface PageModule { default: AnyFn }
export interface ErrorModule { default: AnyFn }
export interface PartialModule { default: RoutePartial }
export interface EndpointModule {
  GET?: AnyFn; POST?: AnyFn; PUT?: AnyFn; PATCH?: AnyFn; DELETE?: AnyFn; OPTIONS?: AnyFn
  prerender?: boolean | 'auto'
  entries?: () => MaybePromise<Array<Record<string, string>>>
}

/** Uma pasta no caminho da rota (da raiz até a pasta da rota). */
export interface RouteLevel {
  /** Pasta de origem, para as mensagens (ex.: `src/routes/(site)/blog`). */
  dir: string
  layout?: LayoutModule
  layoutServer?: LayoutServerModule
  error?: ErrorModule
}

export interface RouteFiles {
  /** Id da rota sem grupos (ex.: `/blog/[slug]`). */
  id: string
  /** Pastas da raiz até a rota; a última é a pasta da rota. */
  levels: RouteLevel[]
  page?: PageModule
  pageServer?: PageServerModule
  endpoint?: EndpointModule
  /** `+name.partial.tsx` da pasta da rota. */
  partials?: Record<string, PartialModule>
}

export interface FileRoutesInput {
  routes: RouteFiles[]
  /** Pasta raiz das rotas (layout, load e +error da raiz), usada no 404 sem rota. */
  root?: RouteLevel
  /** Matchers de `src/params/<nome>.ts` (`export function match`). */
  params?: Record<string, { match: ParamMatcher }>
}

export interface FileRoutes {
  routes: Route[]
  errorPage: ErrorPage
  matchers: Record<string, ParamMatcher>
}

interface LevelState {
  /** Dados acumulados até cada nível que carregou com sucesso. */
  data: Array<Data | undefined>
}
const STATE = new WeakMap<RequestEvent, LevelState>()

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

function asData(value: unknown, where: string): Data {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`htsx: load de ${where} devolveu ${Array.isArray(value) ? 'array' : typeof value}; devolva um objeto, ex.: return { posts }`)
  }
  return value as Data
}

/** Roda os `load` dos layouts (em paralelo; cada `parent()` espera os de cima) e o da página. */
async function runLoads(r: RouteFiles, event: RequestEvent, withPage = true): Promise<Data> {
  const state: LevelState = { data: [] }
  STATE.set(event, state)
  let merged: Promise<Data> = Promise.resolve({})
  const steps: Array<Promise<Data>> = []
  for (const level of r.levels) {
    const load = level.layoutServer?.load
    if (load) {
      const parent = merged
      const own = Promise.resolve().then(() => load({ ...event, parent: () => parent }))
      merged = Promise.all([parent, own]).then(([p, o]) => ({ ...p, ...asData(o, `${level.dir}/+layout.server.ts`) }))
    }
    steps.push(merged)
  }
  const parent = merged
  const pageLoad = withPage ? r.pageServer?.load : undefined
  const page = pageLoad ? Promise.resolve().then(() => pageLoad({ ...event, parent: () => parent })) : Promise.resolve(undefined)

  // espera tudo antes de lançar, para não sobrar Promise rejeitada sem tratamento
  const settled = await Promise.allSettled([...steps, page])
  for (const [i, s] of settled.slice(0, -1).entries()) {
    if (s.status !== 'fulfilled') break
    state.data[i] = s.value as Data
  }
  const failed = settled.find(s => s.status === 'rejected') as PromiseRejectedResult | undefined
  if (failed) throw failed.reason
  return { ...(await parent), ...asData((settled.at(-1) as PromiseFulfilledResult<unknown>).value, `${r.levels.at(-1)!.dir}/+page.server.ts`) }
}

/**
 * Dados de cada nível (raiz → folha). Sem `load` rodado (erro antes, ou endpoint), só os níveis
 * sem `load` em nenhum nível acima têm dados (`{}`); o resto fica `undefined`.
 */
function levelData(r: RouteFiles, event: RequestEvent): Array<Data | undefined> {
  const state = STATE.get(event)
  if (state) return r.levels.map((_, i) => state.data[i])
  const firstLoad = r.levels.findIndex(l => l.layoutServer?.load)
  return r.levels.map((_, i) => (firstLoad === -1 || i < firstLoad ? {} : undefined))
}

/** Envolve `children` nos layouts dos níveis 0..`upTo`, da folha para a raiz, com os dados de cada nível. */
function wrap(r: RouteFiles, event: RequestEvent, children: unknown, upTo: number): unknown {
  const data = levelData(r, event)
  let node = children
  for (let i = upTo; i >= 0; i--) {
    const level = r.levels[i]!
    // sem dados (o load deste nível falhou ou não rodou): pula este layout, mantém os de cima
    if (!level.layout || data[i] === undefined) continue
    node = level.layout.default({ children: node, data: data[i], params: event.params, event })
  }
  return node
}

function errorFor(r: RouteFiles): ErrorPage {
  return ({ status, message, event }) => {
    // +error.tsx mais próximo, mas acima do primeiro nível sem dados: o erro não pode ficar
    // dentro de um layout cujo load falhou (como no SvelteKit)
    const data = levelData(r, event)
    const broken = data.findIndex(d => d === undefined)
    let at = (broken === -1 ? r.levels.length : broken) - 1
    while (at >= 0 && !r.levels[at]!.error) at--
    const node = at >= 0 ? r.levels[at]!.error!.default({ status, message, event }) : [h('h1', {}, String(status)), h('p', {}, message)]
    // fica dentro dos layouts até a pasta do +error.tsx (sem +error: só o layout raiz)
    return event.isFragment ? node : wrap(r, event, node, Math.max(at, 0))
  }
}

/** Converte o manifesto de arquivos em rotas do `defineApp`: `defineApp({ ...fileRoutes(manifest), handle })`. */
export function fileRoutes(input: FileRoutesInput): FileRoutes {
  const routes: Route[] = []
  for (const r of input.routes) {
    const dir = r.levels.at(-1)!.dir
    if (r.page && typeof r.page.default !== 'function') throw new Error(`htsx: ${dir}/+page.tsx precisa de export default com o componente; load e actions vão em +page.server.ts`)
    for (const l of r.levels) {
      if (l.layout && typeof l.layout.default !== 'function') throw new Error(`htsx: ${l.dir}/+layout.tsx precisa de export default com o componente; load vai em +layout.server.ts`)
      if (l.error && typeof l.error.default !== 'function') throw new Error(`htsx: ${l.dir}/+error.tsx precisa de export default com o componente`)
    }
    if (r.pageServer && !r.page) throw new Error(`htsx: ${dir}/+page.server.ts existe sem ${dir}/+page.tsx; crie a página ou troque por +server.ts`)
    if (!r.page && !r.endpoint) continue
    const hasLayout = r.levels.some(l => l.layout)
    // páginas herdam `prerender` do +layout.server.ts mais próximo; +server.ts sozinho não herda (como no SvelteKit)
    const from = [...r.levels].reverse().find(l => l.layoutServer?.prerender !== undefined)
    const inherited = r.page ? from?.layoutServer?.prerender : undefined
    if (inherited && r.pageServer?.actions && r.pageServer.prerender === undefined) {
      throw new Error(`htsx: ${from!.dir}/+layout.server.ts marca prerender, mas ${dir}/+page.server.ts tem actions, que precisam de servidor; ponha export const prerender = false em ${dir}/+page.server.ts`)
    }
    const def: RouteDef<string, Data, Record<string, AnyFn>> = {
      prerender: r.pageServer?.prerender ?? r.endpoint?.prerender ?? inherited,
      entries: r.pageServer?.entries ?? r.endpoint?.entries,
      errorPage: errorFor(r),
    }
    if (r.page) {
      def.load = event => runLoads(r, event)
      def.page = props => r.page!.default(props)
      def.layout = hasLayout ? (({ children, event }) => wrap(r, event, children, r.levels.length - 1)) as Layout : false
      if (r.pageServer?.actions) def.actions = r.pageServer.actions
    }
    if (r.partials && Object.keys(r.partials).length > 0) {
      def.partials = {}
      for (const [name, module] of Object.entries(r.partials)) {
        if (typeof module.default?.handle !== 'function') throw new Error(`htsx: ${dir}/+${name}.partial.tsx precisa de export default partial({ ... })`)
        def.partials[name] = module.default
      }
      if (inherited) throw new Error(`htsx: ${from!.dir}/+layout.server.ts marca prerender, mas ${dir} tem parciais, que precisam de servidor; ponha prerender: false em ${dir}/+page.server.ts`)
      // Os `load` dos layouts continuam valendo: é neles que costuma estar a exigência de login.
      def.guard = event => runLoads(r, event, false)
    }
    for (const m of METHODS) {
      const fn = r.endpoint?.[m]
      if (fn) (def as Record<string, unknown>)[m] = fn
    }
    try {
      routes.push(route(r.id, def as RouteDef<string, unknown, {}>))
    } catch (err) {
      throw new Error(`${(err as Error).message} (em ${dir})`)
    }
  }

  const ids = routes.map(r => r.id)
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) {
    const dirs = input.routes.filter(r => r.id === dup).map(r => r.levels.at(-1)!.dir)
    throw new Error(`htsx: a rota ${JSON.stringify(dup)} aparece em mais de uma pasta (${dirs.join(', ')}); grupos (nome) não mudam a URL`)
  }

  // 404 sem rota: +error.tsx e +layout.tsx da raiz
  const root = input.root ?? input.routes[0]?.levels[0]
  const rootRoute: RouteFiles = { id: '/', levels: [root ?? { dir: 'src/routes' }] }
  const rootError = errorFor(rootRoute)
  const errorPage: ErrorPage = async props => {
    if (!STATE.has(props.event) && root?.layoutServer?.load) {
      try { await runLoads(rootRoute, props.event) } catch { /* layout raiz falhou: erro sem layout */ }
    }
    return rootError(props)
  }

  const matchers: Record<string, ParamMatcher> = {}
  for (const [name, mod] of Object.entries(input.params ?? {})) {
    if (typeof mod.match !== 'function') throw new Error(`htsx: src/params/${name}.ts precisa exportar function match(valor: string): boolean`)
    matchers[name] = mod.match
  }
  return { routes, errorPage, matchers }
}
