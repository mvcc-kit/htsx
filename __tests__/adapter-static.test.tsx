import { describe, expect, it } from 'bun:test'
import path from 'node:path'
import { buildStatic } from '../adapter-static'
import { defineApp, route } from '../app'
import { VENDOR_PATH } from '../index'
import { page } from '../testing'
import { staticApp, workerApp } from './fixtures/site/app'

const ROOT = path.join(import.meta.dir, 'fixtures', 'site')
const OUT = path.join(import.meta.dir, '..', '.cache', 'adapters', 'static')
const read = (f: string) => Bun.file(path.join(OUT, f)).text()
const buildError = (p: Promise<unknown>): Promise<Error> => p.then(() => { throw new Error('o build devia falhar') }, e => e as Error)

describe('modo estático: buildStatic', () => {
  it('gera páginas, endpoints, redirecionamentos, 404, assets e vendor', async () => {
    const r = await buildStatic(staticApp, { root: ROOT, outDir: OUT })
    expect(r.files).toEqual([
      '/404.html', '/', '/antigo', '/blog', '/blog/ola', '/blog/segundo-post', '/feed.xml', '/robots.txt', '/about',
      ...['alpine-anchor', 'alpine-collapse', 'alpine-focus', 'alpine-intersect', 'alpine-mask', 'alpine-morph', 'alpine-persist', 'alpine-sort', 'alpine', 'htmx'].map(f => `${VENDOR_PATH}${f}.min.js`),
      `${VENDOR_PATH}htsx-nav.css`, `${VENDOR_PATH}htsx-nav.js`,
    ].sort())
    expect(await (await page(await read('index.html'))).text('h1')).toBe('Início')
    expect(await (await page(await read('blog/segundo-post.html'))).text('p')).toBe('Outro <texto>')
    expect(await read('feed.xml')).toBe('<rss>2</rss>')
    expect(await read('antigo.html')).toContain('url=/about')
    expect(await read('404.html')).toContain('<h1>404</h1>')
    expect(await read('robots.txt')).toBe('User-agent: *\n')
    expect(await (await page(await read('about.html'))).attr('script', 'src')).toBe(`${VENDOR_PATH}htmx.min.js`)
  })

  it('rotas que precisam de servidor → erro com a lista e as opções', async () => {
    const err = await buildError(buildStatic(workerApp, { root: ROOT, outDir: OUT }))
    expect(err.message).toContain('/ola não está marcada com prerender')
    expect(err.message).toContain('/contato responde POST, que precisa de servidor')
    expect(err.message).toContain('strict: false')
  })

  it('strict: false deixa as rotas dinâmicas de fora', async () => {
    const r = await buildStatic(workerApp, { root: ROOT, outDir: OUT, strict: false })
    expect(r.files).not.toContain('/ola')
    expect(r.files).not.toContain('/contato')
  })

  it('link quebrado, rota sem extensão e rota não alcançada falham o build', async () => {
    const app = defineApp({
      prerender: true,
      routes: [
        route('/', { page: () => <a href="/nao-existe">x</a> }),
        route('/dados', { GET: () => Response.json({}) }),
        route('/p/[id]', { page: ({ params }) => params.id }),
      ],
    })
    const err = await buildError(buildStatic(app, { root: ROOT, outDir: OUT }))
    expect(err.message).toContain('link para /nao-existe em / não leva a nenhuma rota nem arquivo')
    expect(err.message).toContain('rota /dados gera application/json em /dados sem extensão')
    expect(err.message).toContain('rota /p/[id] está marcada com prerender, mas nenhuma página leva a ela; declare entries()')
  })

  it('entries() gera as páginas de rota dinâmica; trailingSlash always grava index.html', async () => {
    const app = defineApp({
      prerender: true,
      trailingSlash: 'always',
      routes: [route('/p/[id]', { entries: () => [{ id: '1' }, { id: '2' }], page: ({ params }) => <p>{params.id}</p> })],
    })
    const r = await buildStatic(app, { root: ROOT, outDir: OUT, vendor: false, fallback: false })
    expect(r.files).toEqual(['/p/1', '/p/2', '/robots.txt'])
    expect(await read('p/2/index.html')).toBe('<p>2</p>')
  })

  it('recusa outDir que apagaria o projeto, src/ ou a pasta static', async () => {
    for (const [outDir, msg] of [['.', 'é a raiz do projeto'], ['..', 'é a raiz do projeto ou está acima'], ['static', 'se sobrepõem'], ['static/sub', 'se sobrepõem']] as const) {
      expect((await buildError(buildStatic(staticApp, { root: ROOT, outDir }))).message).toContain(msg)
    }
    expect(await Bun.file(path.join(ROOT, 'static', 'robots.txt')).exists()).toBe(true)
  })

  it('rota [...rest] que pega tudo → erro em vez de 404.html errado', async () => {
    const app = defineApp({ prerender: true, routes: [route('/[...rest]', { entries: () => [{ rest: 'a' }], page: () => <p>x</p> })] })
    expect((await buildError(buildStatic(app, { root: ROOT, outDir: OUT, vendor: false }))).message).toContain('respondeu 200 (uma rota como [...rest] pega tudo?)')
  })
})
