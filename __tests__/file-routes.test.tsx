import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileRoutes, type App } from '../app'
import type { AssetsFetcher, WorkerContext } from '../adapter-cloudflare'
import { assetsFromDir } from '../adapter-cloudflare-build'
import { staticAdapter } from '../config'
import { build, loadApp, sync, type LoadedApp } from '../project'
import { scanRoutes } from '../src/build/routes'
import { page } from '../testing'
import config from './fixtures/fs-site/htsx.config'

const ROOT = path.join(import.meta.dir, 'fixtures', 'fs-site')
let app: LoadedApp
const req = (p: string, init: RequestInit = {}) => app.respond(new Request('https://site.dev' + p, init))

beforeAll(async () => {
  app = await loadApp(config, ROOT)   // htsx.config.ts + src/routes + src/hooks.server.ts, sem CLI
})
afterAll(() => app.close())

describe('rotas por arquivos: htsx.config.ts', () => {
  it('monta o app com grupos, endpoints e matchers', async () => {
    expect(app.routes.map(r => r.id).sort()).toEqual(['/', '/api/notas', '/api/posts.json', '/blog', '/blog/[slug]', '/item/[id=int]', '/saudacao', '/sobre'])
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
    const err = await scanRoutes(tmp, 'src/routes').then(() => null, (e: Error) => e)
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
    const err = await sync({ adapter: staticAdapter() }, tmp).then(() => null, (e: Error) => e)
    expect(err?.message).toContain('a rota "/x" aparece em mais de uma pasta (src/routes/(a)/x, src/routes/(b)/x); grupos (nome) não mudam a URL')
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

  it('load de layout falha: +error.tsx acima dele, dentro só dos layouts que carregaram', async () => {
    const res = await req('/blog/ola?falhar')
    expect(res.status).toBe(503)
    const p = await page(res)
    expect(await p.byTestId('erro-post')).toBeNull()            // o +error do [slug] ficaria dentro do layout que falhou
    expect(await p.text('[data-testid=erro-raiz] p')).toBe('Blog fora do ar')
    expect(await p.text('[data-testid=blog] h2')).toBeNull()     // layout do blog pulado
    expect(await p.text('header b')).toBe('Meu site')             // layout raiz mantido
  })

  it('id inválido e +page.server.ts sem página: erro já no sync', async () => {
    const tmp = path.join(import.meta.dir, '..', '.cache', 'fs-bad-id')
    await rm(tmp, { recursive: true, force: true })
    await Bun.write(path.join(tmp, 'src', 'routes', 'a-[x]', '+page.tsx'), '')
    await Bun.write(path.join(tmp, 'src', 'routes', 'b', '+page.server.ts'), '')
    const err = await sync({ adapter: staticAdapter() }, tmp).then(() => null, (e: Error) => e)
    expect(err?.message).toContain('src/routes/a-[x]: segmento "a-[x]" em "/a-[x]" mistura texto e parâmetro')
    expect(err?.message).toContain('src/routes/b: +page.server.ts sem +page.tsx')
  })

  it('prerender herdado + actions → erro dizendo onde marcar prerender = false', () => {
    const mod = { default: () => 'x' }
    expect(() => fileRoutes({ routes: [{ id: '/f', levels: [{ dir: 'src/routes', layoutServer: { prerender: true } }, { dir: 'src/routes/f' }], page: mod, pageServer: { actions: { default: () => ({}) } } }] }))
      .toThrow('htsx: src/routes/+layout.server.ts marca prerender, mas src/routes/f/+page.server.ts tem actions, que precisam de servidor; ponha export const prerender = false em src/routes/f/+page.server.ts')
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

  it('modo estático pela configuração: só as rotas com prerender', async () => {
    const out = path.join(import.meta.dir, '..', '.cache', 'fs-static')
    const r = await build({ ...config, adapter: staticAdapter({ outDir: path.relative(ROOT, out), strict: false }) }, ROOT)
    expect(r.files).toContain('/sobre')
    expect(r.files).toContain('/blog')
    expect(r.files).not.toContain('/blog/ola')
    expect(await (await page(await Bun.file(path.join(out, 'sobre.html')).text())).text('header b')).toBe('Meu site')
  })


})

describe('rotas por arquivos no modo Cloudflare Workers (Worker empacotado de verdade)', () => {
  type W = { fetch(req: Request, env: object, ctx: WorkerContext): Promise<Response>; scheduled(c: unknown, env: object): Promise<void> }
  let worker: W
  let mod: Record<string, unknown>
  let env: Record<string, unknown>
  const fromAssets: string[] = []
  const waited: Promise<unknown>[] = []
  const ctx: WorkerContext = { waitUntil: p => { waited.push(p) } }
  const call = (p: string, init: RequestInit = {}) => worker.fetch(new Request('https://site.dev' + p, init), env, ctx)
  // bindings simulados com a mesma forma dos do Cloudflare (D1, R2, KV)
  const notas = ['primeira']
  const r2 = new Map<string, string>([['anexo.txt', 'conteúdo do R2']])

  beforeAll(async () => {
    const r = await build(config, ROOT)
    const assets = await assetsFromDir(r.outDir)
    env = {
      ASSETS: { fetch: req => { fromAssets.push(new URL(typeof req === 'string' ? req : req.url).pathname); return assets.fetch(req) } } satisfies AssetsFetcher,
      DB: { prepare: (sql: string) => ({ bind: (...v: string[]) => ({ run: async () => { if (sql.startsWith('insert')) notas.push(v[0]!) } }), all: async () => ({ results: notas.map(texto => ({ texto })) }) }) },
      BUCKET: { put: async (k: string, v: string) => { r2.set(k, v) }, get: async (k: string) => (r2.has(k) ? { text: async () => r2.get(k)! } : null) },
      KV: { get: async (k: string) => (k === 'flag' ? 'ligada' : null) },
      LOG: [] as string[],
    }
    mod = await import(path.join(r.outDir, '_worker.js'))
    worker = mod.default as W
  })

  it('o build gera um único _worker.js e o wrangler aponta para ele', async () => {
    const files = [...new Bun.Glob('*.js').scanSync(path.join(ROOT, '.htsx', 'cloudflare'))]
    expect(files).toEqual(['_worker.js'])
  })

  it('página pré-renderizada (layout do grupo) vem do binding de assets', async () => {
    const p = await page(await call('/sobre'))
    expect(fromAssets).toEqual(['/sobre'])
    expect(await p.text('h1')).toBe('Sobre')
  })

  it('rota dinâmica no Worker: layouts, parent(), locals do cookie (hooks.server.ts)', async () => {
    const p = await page(await call('/blog/ola', { headers: { cookie: 'user=Bia' } }))
    expect(await p.text('small')).toBe('notas · Bia')
    expect(await p.text('[data-testid=blog] h2')).toBe('Meu site / Blog')
  })

  it('D1, R2 e KV pelo env; ctx.waitUntil', async () => {
    const res = await call('/api/notas', { method: 'POST', body: JSON.stringify({ texto: 'nova' }), headers: { 'content-type': 'application/json' } })
    expect(res.status).toBe(201)
    await Promise.all(waited)
    expect(r2.get('ultima.txt')).toBe('nova')
    expect(await (await call('/api/notas')).json()).toEqual({ notas: ['primeira', 'nova'], anexo: 'conteúdo do R2', flag: 'ligada' })
  })

  it('src/worker.ts: Durable Object exportado e scheduled junto do fetch', async () => {
    const Contador = mod.Contador as new (s: unknown, e: unknown) => { fetch(): Promise<Response> }
    const c = new Contador({}, env)
    await c.fetch()
    expect(await (await c.fetch()).text()).toBe('2')
    await worker.scheduled({}, env)
    expect(env.LOG).toEqual(['scheduled'])
  })

  it('ação, endpoint, +error aninhado e 404 no Worker', async () => {
    const bad = await call('/blog/ola?/comentar', { method: 'POST', body: new URLSearchParams({ texto: '' }), headers: { origin: 'https://site.dev' } })
    expect(bad.status).toBe(400)
    expect(await (await call('/api/posts.json')).json()).toEqual(['ola', 'segundo'])
    expect(await (await page(await call('/blog/x'))).byTestId('erro-post')).toMatchObject({ text: 'Post "x" não existe' })
    expect((await call('/nada')).status).toBe(404)
  })

  it('wrangler com main errado → erro dizendo o caminho do Worker gerado', async () => {
    const tmp = path.join(import.meta.dir, '..', '.cache', 'fs-wrangler')
    await rm(tmp, { recursive: true, force: true })
    await Bun.write(path.join(tmp, 'src', 'routes', '+page.tsx'), 'export default () => "x"\n')
    await Bun.write(path.join(tmp, 'wrangler.jsonc'), JSON.stringify({ main: 'src/index.ts', compatibility_flags: ['nodejs_als'], assets: { binding: 'ASSETS', directory: '.htsx/cloudflare' } }))
    const err = await build(config, tmp).then(() => null, (e: Error) => e)
    expect(err?.message).toContain('"main" em wrangler.jsonc é "src/index.ts", mas o Worker gerado pelo build é ".htsx/cloudflare/_worker.js"')
  })
})

describe('event.platform igual em todo lugar (sem env de dev separado)', () => {
  it('loadApp() acha o htsx.config.ts e emula a plataforma pelo wrangler.jsonc', async () => {
    const loaded = await loadApp(undefined, ROOT)
    try {
      expect(loaded.platformSource).toBe('vars')   // sem wrangler instalado neste repo
      const res = await loaded.respond(new Request('https://site.dev/saudacao'))
      expect(await (await page(res)).text('p')).toBe('Olá do wrangler.jsonc')
    } finally {
      await loaded.close()
    }
  })
})
