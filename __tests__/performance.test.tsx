// Não baixar o que já foi baixado nem o que a página não usa.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { renderPage, VENDOR_PATH } from '../index'
import { Head, Outlet, Title } from '../meta'
import { defineApp, partial, route } from '../kit'
import { buildStatic } from '../adapter-static'
import { fileServer } from '../src/build/files'
import { etagMatches, weakEtag } from '../src/app/etag'
import { findChrome, open, type App } from '../testing'

describe('Alpine sob demanda', () => {
  it('<Head> não baixa o Alpine: só informa onde ele está, com plugins antes do núcleo', async () => {
    const html = await renderPage(() => <html><Head alpine={{ plugins: ['mask'] }} vendor="/v/" /><body></body></html>)
    expect(html).toContain('<meta name="htsx-alpine" content="/v/alpine-mask.min.js /v/alpine.min.js">')
    expect(html).not.toContain('<script defer src="/v/alpine')
  })

  it('sem a navegação, carrega sempre', async () => {
    const html = await renderPage(() => <html><Head navigation={false} vendor="/v/" /><body></body></html>)
    expect(html).toContain('src="/v/alpine.min.js"')
    expect(html).not.toContain('htsx-alpine')
  })

  it('alpine={false} não deixa rastro', async () => {
    expect(await renderPage(() => <html><Head alpine={false} vendor="/v/" /><body></body></html>)).not.toContain('alpine')
  })
})

describe('ETag', () => {
  it('muda com o conteúdo e tem formato fraco', async () => {
    expect(await weakEtag('a')).toMatch(/^W\/"[0-9a-f]{32}"$/)
    expect(await weakEtag('a')).not.toBe(await weakEtag('b'))
  })

  it('compara como o navegador manda', () => {
    expect(etagMatches('W/"a"', 'W/"a"')).toBe(true)
    expect(etagMatches('"a"', 'W/"a"')).toBe(true)
    expect(etagMatches('"x", W/"a"', 'W/"a"')).toBe(true)
    expect(etagMatches('*', 'W/"a"')).toBe(true)
    expect(etagMatches('W/"b"', 'W/"a"')).toBe(false)
    expect(etagMatches(null, 'W/"a"')).toBe(false)
  })

  const List = partial({ render: () => <ul>lista</ul> })
  let version = 1
  const app = defineApp({
    routes: [
      route('/', { partials: { list: List }, page: () => <p>{`v${version}`}</p>, actions: { default: () => ({}) } }),
      route('/own', { load: ({ setHeaders }) => { setHeaders({ etag: '"manual"' }) }, page: () => <p>x</p> }),
    ],
  })
  const get = (p: string, headers: Record<string, string> = {}) => app.respond(new Request(`http://x${p}`, { headers }))

  it('página sem mudança volta 304, sem corpo; depois de mudar, volta 200', async () => {
    const first = await get('/')
    const etag = first.headers.get('etag')!
    expect(await first.text()).toBe('<p>v1</p>')
    const again = await get('/', { 'if-none-match': etag })
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
    expect(again.headers.get('x-content-type-options')).toBe('nosniff')
    version = 2
    expect((await get('/', { 'if-none-match': etag })).status).toBe(200)
  })

  it('parcial também; ETag da rota é respeitado; POST não leva', async () => {
    const partialEtag = (await get('/?/list')).headers.get('etag')!
    expect((await get('/?/list', { 'if-none-match': partialEtag })).status).toBe(304)
    expect((await get('/own')).headers.get('etag')).toBe('"manual"')
    const post = await app.respond(new Request('http://x/', { method: 'POST', headers: { origin: 'http://x', 'content-type': 'application/x-www-form-urlencoded' }, body: '' }))
    expect(post.status).toBe(200)
    expect(post.headers.get('etag')).toBeNull()
  })
})

describe('site estático', () => {
  let dir: string
  const Layout = ({ children }: { children?: unknown }) => (
    <html><Head alpine={false} /><body hx-boost="true"><nav id="menu"><a id="to-b" href="/b">B</a></nav><Outlet preload>{children as string}</Outlet></body></html>
  )
  const app = defineApp({
    prerender: true,
    layout: Layout,
    routes: [
      route('/a', { page: () => <main><Title>A</Title><h1>Conteúdo A</h1></main> }),
      route('/b', { page: () => <main><Title>B</Title><h1>Conteúdo B</h1></main> }),
    ],
  })
  beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), 'htsx-perf-')) })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it("vendor: 'auto' publica só o que as páginas citam", async () => {
    const { files } = await buildStatic(app, { root: dir, outDir: 'auto', vendor: 'auto', fallback: false })
    const vendor = files.filter(f => f.startsWith(VENDOR_PATH)).map(f => f.slice(VENDOR_PATH.length)).sort()
    expect(vendor).toEqual(['htmx.min.js', 'htsx-nav.css', 'htsx-nav.js'])
    for (const f of vendor) expect(await Bun.file(path.join(dir, 'auto', VENDOR_PATH, f)).exists()).toBe(true)
  })

  describe.skipIf(!findChrome())('no Chrome real, com cache do host', () => {
    let chrome: App
    const requests: string[] = []
    beforeAll(async () => {
      await buildStatic(app, { root: dir, outDir: 'cached', vendor: 'auto', fallback: false })
      const files = fileServer(path.join(dir, 'cached'), { html: true })
      chrome = await open(req => {
        const { pathname } = new URL(req.url)
        requests.push(pathname)
        const res = files(req)
        if (!res) return new Response('x', { status: 404 })
        if (pathname.startsWith('/_htsx/partial/')) res.headers.set('cache-control', 'public, max-age=300')
        return res
      }, '/a')
    })
    afterAll(async () => { await chrome?.close() })

    it('pré-carrega ao focar, e o clique não baixa de novo', async () => {
      requests.length = 0
      await chrome.evaluate(`document.getElementById('to-b').focus()`)
      for (let i = 0; i < 200 && !requests.includes('/_htsx/partial/b'); i++) await Bun.sleep(5)
      await Bun.sleep(150)
      await chrome.press('id:to-b')
      await chrome.waitFor('text:Conteúdo B')
      expect(requests.filter(r => r === '/_htsx/partial/b')).toHaveLength(1)
      expect(requests).not.toContain('/b')
    })

  })
})

describe.skipIf(!findChrome())('Alpine sob demanda no Chrome real', () => {
  let chrome: App
  const requests: string[] = []
  const assets = fileServer(path.join(import.meta.dir, 'nao-existe'), { vendor: true })
  const Layout = ({ children }: { children?: unknown }) => (
    <html><Head /><body hx-boost="true"><nav><a href="/plain">Simples</a> <a href="/rich">Com Alpine</a></nav><Outlet>{children as string}</Outlet></body></html>
  )
  const app = defineApp({
    layout: Layout,
    routes: [
      route('/plain', { page: () => <main><Title>Simples</Title><h1>Sem Alpine</h1></main> }),
      route('/rich', { page: () => <main><Title>Rica</Title><div x-data="{ n: 41 }"><span id="count" x-text="n + 1"></span></div></main> }),
    ],
  })
  beforeAll(async () => {
    chrome = await open(async req => {
      requests.push(new URL(req.url).pathname)
      return assets(req) ?? app.respond(req)
    }, '/plain')
  })
  afterAll(async () => { await chrome?.close() })
  const alpineRequests = () => requests.filter(r => r.endsWith('alpine.min.js'))

  it('página sem x-data não baixa o Alpine', async () => {
    await chrome.waitFor('text:Sem Alpine')
    await Bun.sleep(100)
    expect(alpineRequests()).toEqual([])
    expect(await chrome.evaluate<boolean>('!!window.htmx && !window.Alpine')).toBe(true)
  })

  it('ao navegar para uma página que usa, baixa uma vez e funciona', async () => {
    await chrome.press('text:Com Alpine')
    for (let i = 0; i < 300 && (await chrome.text('id:count').catch(() => null)) !== '42'; i++) await Bun.sleep(10)
    expect(await chrome.text('id:count')).toBe('42')
    expect(alpineRequests()).toHaveLength(1)
  })

  it('primeira visita a uma página que usa também funciona', async () => {
    requests.length = 0
    await chrome.goto('/rich')
    for (let i = 0; i < 300 && (await chrome.text('id:count').catch(() => null)) !== '42'; i++) await Bun.sleep(10)
    expect(await chrome.text('id:count')).toBe('42')
  })
})
