import { beforeAll, describe, expect, it } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileRoutes, type App } from '../app'
import { buildStatic } from '../adapter-static'
import type { AssetsFetcher, WorkerContext } from '../adapter-cloudflare'
import { assetsFromDir, buildCloudflare } from '../adapter-cloudflare-build'
import { scanRoutes, syncRoutes } from '../routes'
import { page } from '../testing'

const ROOT = path.join(import.meta.dir, 'fixtures', 'fs-site')
let app: App
const req = (p: string, init: RequestInit = {}) => app.respond(new Request('https://site.dev' + p, init))

beforeAll(async () => {
  await syncRoutes({ root: ROOT })
  app = (await import(path.join(ROOT, 'src', 'app.ts'))).app
})

describe('rotas por arquivos: htsx sync', () => {
  it('gera manifesto com grupos, endpoints e matchers', async () => {
    expect(app.routes.map(r => r.id).sort()).toEqual(['/', '/api/posts.json', '/blog', '/blog/[slug]', '/item/[id=int]', '/sobre'])
  })

  it('tipos gerados ($types) compilam com o app', () => {
    const r = Bun.spawnSync(['bunx', 'tsc', '--noEmit', '-p', ROOT], { cwd: ROOT })
    expect(r.stdout.toString()).toBe('')
  }, 30_000)

  it('nome de arquivo inválido → erro com a correção', async () => {
    const tmp = path.join(import.meta.dir, '..', '.cache', 'fs-bad')
    await rm(tmp, { recursive: true, force: true })
    await mkdir(path.join(tmp, 'src', 'routes', 'x'), { recursive: true })
    await Bun.write(path.join(tmp, 'src', 'routes', '+page.svelte'), '')
    await Bun.write(path.join(tmp, 'src', 'routes', 'x', '+pagina.tsx'), '')
    const err = await scanRoutes(tmp, 'src/routes').then(() => null, e => e as Error)
    expect(err?.message).toContain('src/routes/+page.svelte: use +page.tsx')
    expect(err?.message).toContain('src/routes/x/+pagina.tsx: nome desconhecido')
  })

  it('+page.tsx sem export default (load no lugar errado) → erro', () => {
    const level = { dir: 'src/routes' }
    expect(() => fileRoutes({ routes: [{ id: '/', levels: [level], page: { load: () => ({}) } as never }] }))
      .toThrow('htsx: src/routes/+page.tsx precisa de export default com o componente; load e actions vão em +page.server.ts')
    expect(() => fileRoutes({ routes: [{ id: '/', levels: [{ dir: 'src/routes', layout: {} as never }], page: { default: () => 'x' } }] }))
      .toThrow('htsx: src/routes/+layout.tsx precisa de export default com o componente; load vai em +layout.server.ts')
  })

  it('mesma URL em dois grupos → erro com as pastas', async () => {
    const tmp = path.join(import.meta.dir, '..', '.cache', 'fs-dup')
    await rm(tmp, { recursive: true, force: true })
    for (const g of ['(a)', '(b)']) await Bun.write(path.join(tmp, 'src', 'routes', g, 'x', '+page.tsx'), 'export default () => "x"\n')
    await syncRoutes({ root: tmp, pkg: '@repo/htsx' })
    const err = await import(path.join(tmp, '.htsx', 'routes.ts')).then(() => null, e => e as Error)
    expect(err?.message).toContain('htsx: a rota "/x" aparece em mais de uma pasta (src/routes/(a)/x, src/routes/(b)/x)')
  })
})

describe('rotas por arquivos: dados descendo dos layouts', () => {
  it('layout raiz com dados de locals (hook) envolve a página', async () => {
    const p = await page(await req('/', { headers: { cookie: 'user=Ana' } }))
    expect(await p.text('h1')).toBe('Início de Meu site')
    expect(await p.byTestId('user')).toMatchObject({ text: 'Ana' })
  })

  it('layout aninhado usa parent(); página recebe dados de todos os níveis', async () => {
    const p = await page(await req('/blog/ola'))
    expect(await p.text('[data-testid=blog] h2')).toBe('Meu site / Blog')
    expect(await p.text('article h1')).toBe('Olá, mundo')
    expect(await p.text('small')).toBe('notas · visitante')
  })

  it('grupo (marketing) não entra na URL e usa o layout raiz', async () => {
    const p = await page(await req('/sobre'))
    expect(await p.text('h1')).toBe('Sobre')
    expect(await p.text('header b')).toBe('Meu site')
  })

  it('htmx parcial: só a página, sem layouts', async () => {
    expect(await (await req('/sobre', { headers: { 'hx-request': 'true' } })).text()).toBe('<h1>Sobre</h1>')
  })

  it('+error.tsx mais próximo, dentro dos layouts que carregaram', async () => {
    const res = await req('/blog/nada')
    expect(res.status).toBe(404)
    const p = await page(res)
    expect(await p.byTestId('erro-post')).toMatchObject({ text: 'Post "nada" não existe' })
    expect(await p.text('[data-testid=blog] h2')).toBe('Meu site / Blog')
    expect(await p.text('header b')).toBe('Meu site')
  })

  it('404 sem rota: +error.tsx da raiz com o layout raiz', async () => {
    const p = await page(await req('/nao-existe'))
    expect(await p.text('[data-testid=erro-raiz] h1')).toBe('404')
    expect(await p.text('[data-testid=erro-raiz] p')).toBe('Não encontrado')
    expect(await p.text('header b')).toBe('Meu site')
  })

  it('matcher de src/params', async () => {
    expect((await req('/item/abc')).status).toBe(404)
    expect(await (await page(await req('/item/7'))).text('p')).toBe('item 7')
  })

  it('ação de +page.server.ts com fail() e sucesso', async () => {
    const post = (texto: string) => req('/blog/ola?/comentar', { method: 'POST', body: new URLSearchParams({ texto }), headers: { origin: 'https://site.dev' } })
    const bad = await post('')
    expect(bad.status).toBe(400)
    expect(await (await page(bad)).text('[role=alert]')).toBe('Escreva algo')
    expect(await (await page(await post('legal'))).text('[role=alert]')).toBe('ok: legal')
  })

  it('+server.ts como endpoint', async () => {
    expect(await (await req('/api/posts.json')).json()).toEqual(['ola', 'segundo'])
  })

  it('modo estático: só as rotas com prerender (herdado do grupo e da página)', async () => {
    const out = path.join(import.meta.dir, '..', '.cache', 'fs-static')
    const r = await buildStatic(app, { root: ROOT, outDir: out, vendor: false, strict: false })
    expect(r.files).toEqual(['/404.html', '/blog', '/sobre'])
    expect(await (await page(await Bun.file(path.join(out, 'sobre.html')).text())).text('header b')).toBe('Meu site')
  })

})

describe('rotas por arquivos no modo Cloudflare Workers', () => {
  const committed = Bun.file(path.join(ROOT, 'cloudflare-manifest.json')).json()
  let worker: { fetch(req: Request, env: object, ctx: WorkerContext): Promise<Response> }
  let env: { ASSETS: AssetsFetcher }
  const fromAssets: string[] = []
  const waited: unknown[] = []
  const ctx: WorkerContext = { waitUntil: p => { waited.push(p) } }
  const call = (p: string, init: RequestInit = {}) => worker.fetch(new Request('https://site.dev' + p, init), env, ctx)

  beforeAll(async () => {
    const r = await buildCloudflare(app, { root: ROOT, manifest: 'cloudflare-manifest.json' })
    expect(r.dynamic.sort()).toEqual(['/', '/api/posts.json', '/blog/[slug]', '/item/[id=int]'])
    expect(await committed).toEqual(r.manifest)   // o worker.ts importa o arquivo versionado
    const assets = await assetsFromDir(r.outDir)
    env = { ASSETS: { fetch: req => { fromAssets.push(new URL(typeof req === 'string' ? req : req.url).pathname); return assets.fetch(req) } } }
    worker = (await import(path.join(ROOT, 'src', 'worker.ts'))).default
  })

  it('página pré-renderizada (layout do grupo) vem do binding de assets', async () => {
    const p = await page(await call('/sobre'))
    expect(fromAssets).toEqual(['/sobre'])
    expect(await p.text('h1')).toBe('Sobre')
  })

  it('rota dinâmica no Worker: layouts, parent(), locals do cookie', async () => {
    const p = await page(await call('/blog/ola', { headers: { cookie: 'user=Bia' } }))
    expect(await p.text('small')).toBe('notas · Bia')
    expect(await p.text('[data-testid=blog] h2')).toBe('Meu site / Blog')
  })

  it('ação, endpoint, +error aninhado e 404 no Worker', async () => {
    const bad = await call('/blog/ola?/comentar', { method: 'POST', body: new URLSearchParams({ texto: '' }), headers: { origin: 'https://site.dev' } })
    expect(bad.status).toBe(400)
    expect(await (await call('/api/posts.json')).json()).toEqual(['ola', 'segundo'])
    expect(await (await page(await call('/blog/x'))).byTestId('erro-post')).toMatchObject({ text: 'Post "x" não existe' })
    expect((await call('/nada')).status).toBe(404)
  })
})

