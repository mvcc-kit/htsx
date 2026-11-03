import { beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { cloudflare, cloudflarePlatform, type WorkerContext } from '../adapter-cloudflare'
import { assetsFromDir, buildCloudflare, parseJsonc, validateWrangler } from '../adapter-cloudflare-build'
import { VENDOR_PATH } from '../index'
import { page } from '../testing'
import { workerApp } from './fixtures/site/app'
import worker from './fixtures/site/worker'

const ROOT = path.join(import.meta.dir, 'fixtures', 'site')
const OUT = path.join(ROOT, '.htsx', 'cloudflare')
const MANIFEST = 'cloudflare-manifest.json'
// lido antes de qualquer build: confere que o arquivo versionado (importado pelo worker.ts) está em dia
const committedManifest = await Bun.file(path.join(ROOT, MANIFEST)).json()

describe('modo Cloudflare: wrangler', () => {
  it('lê JSONC com comentários, "//" dentro de string e vírgula no fim', () => {
    expect(parseJsonc('{ // c\n "a": "http://x", /* b */ "b": [1,], }')).toEqual({ a: 'http://x', b: [1] })
  })

  it('aponta cada erro de configuração com a correção', () => {
    const errs = validateWrangler({ main: 'w.ts', site: {}, assets: { directory: 'dist' } }, 'wrangler.jsonc', path.join(ROOT, '.htsx/cloudflare'), ROOT)
    expect(errs).toEqual([
      'tire "site" de wrangler.jsonc: Workers Sites foi substituído por Static Assets ("assets")',
      'defina "assets.binding" (ex.: "ASSETS") em wrangler.jsonc para o Worker ler as páginas pré-renderizadas',
      '"assets.directory" em wrangler.jsonc é "dist", mas o build grava em ".htsx/cloudflare"; use o mesmo caminho',
      'adicione "compatibility_flags": ["nodejs_als"] em wrangler.jsonc: o htsx usa AsyncLocalStorage para o contexto da requisição',
    ])
    expect(validateWrangler({ assets: { binding: 'ASSETS' } }, 'w.json', OUT, ROOT)).toEqual(['defina "main" em w.json (o Worker), ou tire "assets.binding" se o site for só estático'])
  })
})

describe('modo Cloudflare: build', () => {
  let result: Awaited<ReturnType<typeof buildCloudflare>>
  beforeAll(async () => { result = await buildCloudflare(workerApp, { root: ROOT, manifest: MANIFEST }) })

  it('pré-renderiza o que pode e deixa o resto para o Worker', () => {
    expect([...result.manifest.prerendered].sort()).toEqual(['/', '/blog', '/blog/ola', '/blog/segundo-post', '/sobre'])
    expect(result.dynamic).toEqual(['/contato', '/ola'])
  })

  it('manifesto do fixture está em dia (o worker.ts importa ele)', async () => {
    expect(committedManifest).toEqual(result.manifest)
  })

  it('_headers com vendor immutable + os do projeto; _redirects; .assetsignore', async () => {
    const headers = await Bun.file(path.join(OUT, '_headers')).text()
    expect(headers).toBe(`/*\n  X-Frame-Options: DENY\n\n${VENDOR_PATH}*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Robots-Tag: noindex\n\n/_htsx/partial/*\n  Cache-Control: public, max-age=300, stale-while-revalidate=86400\n  X-Robots-Tag: noindex\n`)
    expect(await Bun.file(path.join(OUT, '_redirects')).text()).toBe('/x-antigo /sobre 301\n/antigo /sobre 308\n')
    expect(await Bun.file(path.join(OUT, '.assetsignore')).text()).toBe('_worker.js\n_routes.json\n')
    expect(await Bun.file(path.join(OUT, 'robots.txt')).exists()).toBe(true)
  })

  it('_headers dentro de static/ → erro', async () => {
    const tmp = path.join(import.meta.dir, '..', '.cache', 'adapters', 'cf-bad')
    await Bun.write(path.join(tmp, 'static', '_headers'), '')
    await expect(buildCloudflare(workerApp, { root: tmp, wrangler: false })).rejects.toThrow('htsx: _headers deve ficar na raiz do projeto, não em static/')
  })
})

describe('modo Cloudflare: Worker', () => {
  let env: { ASSETS: Awaited<ReturnType<typeof assetsFromDir>>; SAUDACAO: string }
  const fromAssets: string[] = []
  const waited: unknown[] = []
  const ctx: WorkerContext = { waitUntil: p => { waited.push(p) } }
  const call = (p: string, init?: RequestInit) => worker.fetch(new Request('https://site.dev' + p, init), env, ctx)

  beforeAll(async () => {
    await buildCloudflare(workerApp, { root: ROOT, manifest: MANIFEST })
    const assets = await assetsFromDir(OUT)
    env = { ASSETS: { fetch: r => { fromAssets.push(new URL(typeof r === 'string' ? r : r.url).pathname); return assets.fetch(r) } }, SAUDACAO: 'Olá do Worker' }
  })

  it('página pré-renderizada vem do binding de assets', async () => {
    const res = await call('/sobre')
    expect(fromAssets).toEqual(['/sobre'])
    expect(await (await page(res)).text('h1')).toBe('Sobre')
  })

  it('barra no fim de página pré-renderizada → 308', async () => {
    const res = await call('/sobre/?x=1')
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('/sobre?x=1')
  })

  it('rota dinâmica lê env e usa ctx.waitUntil via cloudflarePlatform', async () => {
    const res = await call('/ola')
    expect(await (await page(res)).text('p')).toBe('Olá do Worker')
    expect(waited.length).toBe(1)
  })

  it('ação de formulário no Worker', async () => {
    const post = (email: string) => call('/contato', { method: 'POST', body: new URLSearchParams({ email }), headers: { origin: 'https://site.dev' } })
    const bad = await post('x')
    expect(bad.status).toBe(400)
    expect(await (await page(bad)).text('[role=alert]')).toBe('E-mail inválido')
    expect(await (await page(await post('a@b.com'))).text('p')).toBe('Recebido')
  })

  it('sem o binding → erro com o trecho do wrangler', async () => {
    const w = cloudflare(workerApp, { manifest: { prerendered: ['/sobre'] } })
    await expect(w.fetch(new Request('https://x/sobre'), {}, ctx)).rejects.toThrow('htsx: binding "ASSETS" não existe no env; declare "assets": { "binding": "ASSETS", "directory": ".htsx/cloudflare" } no wrangler.jsonc')
  })

  it('cloudflarePlatform fora do Worker explica o motivo', () => {
    expect(() => cloudflarePlatform({ platform: undefined, prerendering: true })).toThrow(/não existe no prerender/)
    expect(() => cloudflarePlatform({ platform: undefined, prerendering: false })).toThrow(/rode o app com cloudflare\(app\)/)
  })

  it('página pré-renderizada com acento no caminho vem dos assets', async () => {
    const { defineApp, route } = await import('../app')
    const tmp = path.join(import.meta.dir, '..', '.cache', 'adapters', 'cf-acento')
    const app = defineApp({ prerender: true, routes: [route('/olá', { page: () => <p>oi</p> })] })
    const r = await buildCloudflare(app, { root: tmp, wrangler: false, vendor: false })
    expect(r.manifest.prerendered).toEqual(['/olá'])
    const seen: string[] = []
    const assets = await assetsFromDir(r.outDir)
    const w = cloudflare(app, { manifest: r.manifest })
    const res = await w.fetch(new Request('https://x/ol%C3%A1'), { ASSETS: { fetch: (q: Request | string) => { seen.push('assets'); return assets.fetch(q) } } }, ctx)
    expect(seen).toEqual(['assets'])
    expect(await res.text()).toBe('<p>oi</p>')
  })
})

