// Rotas no formato do SvelteKit: `/blog/[slug]`, `/docs/[...path]`, `/[[lang]]/sobre`, `/item/[id=int]`.
// Lógica pura: sem plataforma, sem I/O.

export interface RouteParam {
  name: string
  matcher?: string
  optional: boolean
  rest: boolean
}

export interface ParsedRoute {
  id: string
  pattern: RegExp
  params: RouteParam[]
}

/** Função que valida um parâmetro (ex.: `int: v => /^\d+$/.test(v)`). */
export type ParamMatcher = (value: string) => boolean

const PARAM_RE = /^(\[)?(\.\.\.)?([a-zA-Z_][\w]*)(?:=([a-zA-Z_][\w]*))?\]?$/

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Converte o id da rota em expressão regular e lista de parâmetros. Lança erro em id inválido. */
export function parseRouteId(id: string): ParsedRoute {
  if (!id.startsWith('/')) throw new Error(`htsx: rota ${JSON.stringify(id)} precisa começar com "/"`)
  if (id !== '/' && id.endsWith('/')) throw new Error(`htsx: rota ${JSON.stringify(id)} não pode terminar com "/"; use ${JSON.stringify(id.slice(0, -1))}`)
  const params: RouteParam[] = []
  if (id === '/') return { id, pattern: /^\/$/, params }

  let source = ''
  for (const segment of id.slice(1).split('/')) {
    if (!segment) throw new Error(`htsx: rota ${JSON.stringify(id)} tem "//"`)
    if (/^\[\[[^[\]]+\]\]$/.test(segment) || /^\[[^[\]]+\]$/.test(segment)) {
      const m = PARAM_RE.exec(segment.slice(1, -1))
      if (!m) throw new Error(`htsx: parâmetro inválido ${JSON.stringify(segment)} em ${JSON.stringify(id)}; use [nome], [[nome]], [...nome] ou [nome=matcher]`)
      const [, optional, rest, name, matcher] = m
      if (optional && rest) throw new Error(`htsx: ${JSON.stringify(segment)} em ${JSON.stringify(id)}: parâmetro não pode ser opcional e rest ao mesmo tempo`)
      params.push({ name: name!, matcher, optional: !!optional, rest: !!rest })
      source += rest ? '(?:/(.*))?' : optional ? '(?:/([^/]+))?' : '/([^/]+)'
      continue
    }
    if (segment.includes('[') || segment.includes(']')) {
      throw new Error(`htsx: segmento ${JSON.stringify(segment)} em ${JSON.stringify(id)} mistura texto e parâmetro; use um segmento só para o parâmetro`)
    }
    // a URL chega codificada (/olá → /ol%C3%A1): compara com o segmento codificado
    source += '/' + escapeRe(encodeURI(segment))
  }
  const names = params.map(p => p.name)
  const dup = names.find((n, i) => names.indexOf(n) !== i)
  if (dup) throw new Error(`htsx: parâmetro "${dup}" repetido em ${JSON.stringify(id)}`)
  return { id, pattern: new RegExp(`^${source || '/'}$`), params }
}

/**
 * Ordem de tentativa, como no SvelteKit: segmento fixo antes de parâmetro,
 * parâmetro com matcher antes de sem, opcional e rest por último.
 */
export function compareRoutes(a: ParsedRoute, b: ParsedRoute): number {
  const sa = a.id.split('/'), sb = b.id.split('/')
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const ra = rank(sa[i]), rb = rank(sb[i])
    if (ra !== rb) return ra - rb
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function rank(segment: string | undefined): number {
  if (segment === undefined) return 3.5      // rota mais curta antes de opcional/rest
  if (segment.startsWith('[...')) return 5
  if (segment.startsWith('[[')) return 4
  if (segment.startsWith('[')) return segment.includes('=') ? 1 : 2
  return 0
}

/** Tenta casar `pathname` com a rota; devolve os parâmetros decodificados ou `null`. */
export function matchRoute(
  route: ParsedRoute,
  pathname: string,
  matchers: Record<string, ParamMatcher> = {},
): Record<string, string> | null {
  const m = route.pattern.exec(pathname)
  if (!m) return null
  const params: Record<string, string> = {}
  for (const [i, p] of route.params.entries()) {
    const raw = m[i + 1]
    if (raw === undefined) {
      if (p.rest) params[p.name] = ''
      continue
    }
    let value: string
    try { value = decodeURIComponent(raw) } catch { return null }
    if (p.matcher) {
      const fn = matchers[p.matcher]
      if (!fn) throw new Error(`htsx: matcher "${p.matcher}" de ${JSON.stringify(route.id)} não existe; registre em defineApp({ matchers: { ${p.matcher}: v => ... } })`)
      if (!fn(value)) return null
    }
    params[p.name] = value
  }
  return params
}

/** Monta a URL de uma rota com os parâmetros (usado no prerender de `entries`). */
export function resolveRoute(route: ParsedRoute, params: Record<string, string | undefined>): string {
  let path = ''
  for (const segment of route.id.slice(1).split('/')) {
    const p = route.params.find(x => segment === `[${x.rest ? '...' : ''}${x.name}${x.matcher ? '=' + x.matcher : ''}]` || segment === `[[${x.name}${x.matcher ? '=' + x.matcher : ''}]]`)
    if (!p) { if (segment) path += '/' + segment; continue }
    const v = params[p.name]
    if (v === undefined || v === '') {
      if (p.optional || p.rest) continue
      throw new Error(`htsx: falta o parâmetro "${p.name}" para montar ${JSON.stringify(route.id)}`)
    }
    path += '/' + (p.rest ? v.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(v))
  }
  return path || '/'
}

// ── Tipos: parâmetros a partir do id da rota ────────────────────────────────

type Segments<S extends string> = S extends `${infer A}/${infer B}` ? A | Segments<B> : S
type ParamOf<Seg extends string> =
  Seg extends `[[${infer N}]]` ? { [K in Strip<N>]?: string } :
  Seg extends `[...${infer N}]` ? { [K in Strip<N>]: string } :
  Seg extends `[${infer N}]` ? { [K in Strip<N>]: string } :
  {}
type Strip<N extends string> = N extends `${infer Name}=${string}` ? Name : N
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never
type Flatten<T> = { [K in keyof T]: T[K] }

/** `ParamsOf<'/blog/[slug]/[[page]]'>` → `{ slug: string; page?: string }`. */
export type ParamsOf<Id extends string> = Flatten<UnionToIntersection<ParamOf<Segments<Id>>>>
