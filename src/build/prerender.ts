// Prerender (build): renderiza as rotas marcadas com `prerender` e segue os links <a href>
// das páginas geradas, como o SvelteKit. Compartilhado pelos adaptadores estático e Cloudflare.
import type { App, Route } from '../app/app'
import { matchRoute, resolveRoute } from '../app/routing'
import { HX_REQUEST } from '../htmx-headers'
import { OUTLET_ID, PARTIALS_PATH } from '../outlet'

export interface PrerenderOptions {
  /** Origem usada nas requisições de build. Padrão `http://localhost`. */
  origin?: string
  /** Caminhos extras para começar (além das rotas sem parâmetros e de `entries()`). */
  entries?: string[]
  /** Arquivos estáticos já existentes (ex.: `/logo.png`), para não tratar link para eles como quebrado. */
  assets?: Set<string>
  /** Link para página que não existe: `'fail'` (padrão), `'warn'` ou `'ignore'`. */
  onMissing?: 'fail' | 'warn' | 'ignore'
}

export interface PrerenderedFile {
  path: string
  /** Caminho do arquivo relativo à pasta de saída (ex.: `blog/ola.html`). */
  file: string
  body: Uint8Array
  contentType: string
}

export interface PrerenderResult {
  files: PrerenderedFile[]
  redirects: Array<{ from: string; to: string; status: number }>
  /** Rotas que ficam dinâmicas (não marcadas com prerender). */
  dynamic: Route[]
}

export function isPrerenderable(app: App, r: Route): boolean | 'auto' {
  return r.def.prerender ?? app.options.prerender ?? false
}

/** Arquivo de saída para o caminho, respeitando `trailingSlash`. */
export function outputFile(path: string, isHtml: boolean, trailingSlash: 'never' | 'always'): string {
  const clean = decodeURIComponent(path).replace(/^\/|\/$/g, '')
  if (!isHtml) return clean
  if (!clean) return 'index.html'
  return trailingSlash === 'always' ? `${clean}/index.html` : `${clean}.html`
}

export async function prerender(app: App, opts: PrerenderOptions = {}): Promise<PrerenderResult> {
  const origin = (opts.origin ?? 'http://localhost').replace(/\/$/, '')
  const slash = app.options.trailingSlash ?? 'never'
  const onMissing = opts.onMissing ?? 'fail'
  const assets = opts.assets ?? new Set<string>()
  const files: PrerenderedFile[] = []
  const redirects: PrerenderResult['redirects'] = []
  const seen = new Set<string>()
  const queue: Array<{ path: string; from: string | null }> = []
  const reached = new Set<Route>()
  const problems: string[] = []

  // mesma forma da URL real (codificada), para /olá e /ol%C3%A1 serem o mesmo caminho
  const normalize = (p: string) => { const u = new URL(p, origin).pathname; return u !== '/' ? u.replace(/\/+$/, '') : u }
  const enqueue = (path: string, from: string | null) => {
    const p = normalize(path)
    if (seen.has(p)) return
    seen.add(p)
    queue.push({ path: p, from })
  }

  const prerenderable = app.routes.filter(r => isPrerenderable(app, r))
  for (const r of prerenderable) {
    const required = r.parsed.params.some(p => !p.optional && !p.rest)
    if (!required) enqueue(resolveRoute(r.parsed, {}), null)
    for (const params of (await r.def.entries?.()) ?? []) enqueue(resolveRoute(r.parsed, params as Record<string, string>), null)
  }
  for (const e of opts.entries ?? []) enqueue(e, null)

  const routeOf = (path: string) => app.routes.find(r => matchRoute(r.parsed, path, app.options.matchers))

  while (queue.length) {
    const { path, from } = queue.shift()!
    const r = routeOf(path)
    if (!r) {
      if (assets.has(path) || assets.has(path + '.html') || assets.has(path + '/index.html')) continue
      const msg = `link para ${path}${from ? ` em ${from}` : ''} não leva a nenhuma rota nem arquivo`
      if (onMissing === 'fail') problems.push(msg)
      else if (onMissing === 'warn') console.warn(`htsx: ${msg}`)
      continue
    }
    if (!isPrerenderable(app, r)) continue
    if (r.def.partials) problems.push(`rota ${r.id} tem partials, que precisam de servidor; tire prerender da rota ou use um modo com servidor`)
    reached.add(r)

    const requestPath = slash === 'always' && path !== '/' && !/\.[a-z0-9]+$/i.test(path) ? path + '/' : path
    const res = await app.respond(new Request(origin + requestPath, { headers: { accept: 'text/html,*/*' } }), { prerendering: true })
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location') ?? '/'
      redirects.push({ from: path, to, status: res.status })
      if (to.startsWith('/')) enqueue(to.split(/[?#]/)[0]!, path)
      continue
    }
    if (res.status !== 200) {
      problems.push(`prerender de ${path} respondeu ${res.status}${from ? ` (link em ${from})` : ''}`)
      continue
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    const isHtml = contentType.startsWith('text/html')
    if (!isHtml && !/\.[a-z0-9]+$/i.test(path)) {
      problems.push(`rota ${r.id} gera ${contentType.split(';')[0]} em ${path} sem extensão; ponha a extensão no id (ex.: "/feed.xml") para o servidor estático saber o tipo`)
      continue
    }
    const body = new Uint8Array(await res.arrayBuffer())
    files.push({ path, file: outputFile(path, isHtml, slash), body, contentType })
    if (isHtml && r.def.layout === undefined && new TextDecoder().decode(body).includes(`id="${OUTLET_ID}"`)) {
      const partial = await prerenderPartial(app, origin + requestPath, path, slash, contentType)
      if (typeof partial === 'string') problems.push(partial)
      else files.push(partial)
    }
    if (isHtml) for (const link of await links(new TextDecoder().decode(body), origin + path, origin)) enqueue(link, path)
  }

  for (const r of prerenderable) {
    if (isPrerenderable(app, r) === true && !reached.has(r)) {
      problems.push(`rota ${r.id} está marcada com prerender, mas nenhuma página leva a ela; declare entries() na rota ou passe entries no build`)
    }
  }
  if (problems.length) throw new Error(`htsx: prerender falhou:\n${problems.map(p => `  - ${p}`).join('\n')}`)

  return { files, redirects, dynamic: app.routes.filter(r => !isPrerenderable(app, r)) }
}

/** O parcial da página com <Outlet> vira arquivo, porque o host estático ignora cabeçalhos. Texto: o problema. */
async function prerenderPartial(app: App, url: string, path: string, slash: 'never' | 'always', contentType: string): Promise<PrerenderedFile | string> {
  const res = await app.respond(new Request(url, {
    headers: { accept: 'text/html,*/*', [HX_REQUEST.Request]: 'true', [HX_REQUEST.Boosted]: 'true', [HX_REQUEST.Target]: OUTLET_ID },
  }), { prerendering: true })
  if (res.status !== 200) return `parcial de ${path} respondeu ${res.status}`
  return {
    path: PARTIALS_PATH + path,
    file: `${PARTIALS_PATH.slice(1)}/${outputFile(path, true, slash)}`,
    body: new Uint8Array(await res.arrayBuffer()),
    contentType,
  }
}

/** Links internos (`<a href>`) de uma página, sem query nem âncora. */
async function links(html: string, base: string, origin: string): Promise<string[]> {
  const out: string[] = []
  await new HTMLRewriter()
    .on('a[href]', {
      element(el) {
        const href = el.getAttribute('href')!
        if (/^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('#')) return
        if (el.getAttribute('rel')?.split(/\s+/).includes('external') || el.hasAttribute('download')) return
        try {
          const u = new URL(href.replace(/&amp;/g, '&'), base)
          if (u.origin === origin) out.push(u.pathname)
        } catch { /* href inválido: ignora */ }
      },
    })
    .transform(new Response(html))
    .text()
  return out
}
