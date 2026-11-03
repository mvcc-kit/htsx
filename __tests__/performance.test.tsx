// Não baixar o que já foi baixado nem o que a página não usa.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { navigationJs, renderPage, sseEvent, sseResponse, VENDOR_PATH } from '../index'
import { Head, Outlet, Title } from '../meta'
import { defineApp, partial, route } from '../kit'
import { buildStatic } from '../adapter-static'
import { fileServer } from '../src/build/files'
import { etagMatches, weakEtag } from '../src/app/etag'
import { serve } from '../adapter-bun'
import { acceptsGzip, isCompressible } from '../src/adapters/compression'
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

describe('modo Bun: compressão', () => {
  it('só tipos de texto, sem SSE', () => {
    for (const type of ['text/html; charset=utf-8', 'text/css', 'application/json', 'text/javascript', 'image/svg+xml']) expect(isCompressible(type)).toBe(true)
    for (const type of ['image/png', 'text/event-stream', 'application/octet-stream', null]) expect(isCompressible(type)).toBe(false)
  })

  it('entende Accept-Encoding', () => {
    expect(acceptsGzip('gzip, deflate, br')).toBe(true)
    expect(acceptsGzip('GZIP;q=0.5')).toBe(true)
    expect(acceptsGzip('gzip;q=0')).toBe(false)
    expect(acceptsGzip('br')).toBe(false)
    expect(acceptsGzip(null)).toBe(false)
  })

  describe('no servidor', () => {
    let server: ReturnType<typeof serve>
    let dir: string
    const big = 'x'.repeat(5000)
    const app = defineApp({
      routes: [
        route('/big', { page: () => <p>{big}</p> }),
        route('/small', { page: () => <p>oi</p> }),
        route('/events', { GET: () => sseResponse(async function* () { yield sseEvent('um') }) }),
      ],
    })
    beforeAll(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'htsx-bun-'))
      await Bun.write(path.join(dir, 'site.css'), 'a{}'.repeat(1000))
      server = serve(app, { port: 0, hostname: '127.0.0.1', assets: dir })
    })
    afterAll(async () => { server.stop(true); await rm(dir, { recursive: true, force: true }) })
    const get = (p: string, headers: Record<string, string> = { 'accept-encoding': 'gzip' }) => fetch(`http://127.0.0.1:${server.port}${p}`, { headers, decompress: false } as RequestInit)

    it('HTML grande vai comprimido e continua íntegro', async () => {
      const res = await get('/big')
      expect(res.headers.get('content-encoding')).toBe('gzip')
      expect(res.headers.get('vary')).toContain('Accept-Encoding')
      const bytes = new Uint8Array(await res.arrayBuffer())
      expect(bytes.byteLength).toBeLessThan(500)
      expect(new TextDecoder().decode(Bun.gunzipSync(bytes))).toContain(big)
    })

    it('resposta pequena, cliente sem gzip e SSE não comprimem', async () => {
      expect((await get('/small')).headers.get('content-encoding')).toBeNull()
      expect((await get('/big', {})).headers.get('content-encoding')).toBeNull()
      const events = await get('/events')
      expect(events.headers.get('content-encoding')).toBeNull()
      expect(await events.text()).toContain('data: um')
    })

    it('o mesmo conteúdo comprimido sai igual, e mudança de arquivo não serve o antigo', async () => {
      const first = new Uint8Array(await (await get('/site.css')).arrayBuffer())
      const second = new Uint8Array(await (await get('/site.css')).arrayBuffer())
      expect(second).toEqual(first)
      await Bun.write(path.join(dir, 'site.css'), 'b{}'.repeat(2000))
      const changed = await get('/site.css')
      expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await changed.arrayBuffer())))).toStartWith('b{}')
    })

    it('arquivo estático comprime e volta 304 quando não mudou', async () => {
      const first = await get('/site.css')
      expect(first.headers.get('content-encoding')).toBe('gzip')
      const etag = first.headers.get('etag')!
      expect(etag).toMatch(/^W\//)
      expect(first.headers.get('x-content-type-options')).toBe('nosniff')
      await first.arrayBuffer()
      const again = await get('/site.css', { 'accept-encoding': 'gzip', 'if-none-match': etag })
      expect(again.status).toBe(304)
      expect((await again.arrayBuffer()).byteLength).toBe(0)
    })
  })
})

describe('performance com segurança', () => {
  it('SSE parado continua aberto, mesmo com limite curto; o resto segue o limite', async () => {
    let received = ''
    const app = defineApp({
      routes: [route('/events', { GET: () => sseResponse(async function* () {
        yield sseEvent('um')
        await Bun.sleep(2500)
        yield sseEvent('dois')
      }) })],
    })
    const server = serve(app, { port: 0, hostname: '127.0.0.1', assets: '/nao-existe', idleTimeout: 1 })
    try {
      received = await (await fetch(`http://127.0.0.1:${server.port}/events`)).text()
    } finally {
      server.stop(true)
    }
    expect(received).toContain('data: um')
    expect(received).toContain('data: dois')
  }, 8000)

  it('etag: false não calcula nem responde 304', async () => {
    const app = defineApp({ etag: false, routes: [route('/', { page: () => <p>x</p> })] })
    const res = await app.respond(new Request('http://x/', { headers: { 'if-none-match': '*' } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBeNull()
  })

  it('prerender recusa cookie e redirecionamento que criaria outra regra', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'htsx-pre-'))
    try {
      const cookie = defineApp({ prerender: true, routes: [route('/', { load: ({ cookies }) => { cookies.set('a', '1') }, page: () => <p>x</p> })] })
      await expect(buildStatic(cookie, { root: dir, outDir: 'a', vendor: false, fallback: false })).rejects.toThrow(/grava cookie/)
      const evil = defineApp({ prerender: true, routes: [route('/', { GET: () => new Response(null, { status: 301, headers: { location: '/a /b 301' } }) })] })
      await expect(buildStatic(evil, { root: dir, outDir: 'b', vendor: false, fallback: false })).rejects.toThrow(/espaço ou quebra/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('gzip: resposta com cookie não entra no cache, e o conteúdo de cada pessoa continua dela', async () => {
    let user = 'ana'
    const app = defineApp({
      routes: [route('/me', { load: ({ cookies }) => { cookies.set('seen', '1') }, page: () => <p>{`${user} ${'x'.repeat(3000)}`}</p> })],
    })
    const server = serve(app, { port: 0, hostname: '127.0.0.1', assets: '/nao-existe' })
    const read = async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/me`, { headers: { 'accept-encoding': 'gzip' }, decompress: false } as RequestInit)
      return new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await res.arrayBuffer())))
    }
    try {
      expect(await read()).toContain('ana')
      user = 'bia'
      expect(await read()).toContain('bia')
    } finally {
      server.stop(true)
    }
  })

  describe.skipIf(!findChrome())('pré-carregamento no Chrome real', () => {
    it('não pede link de saída', async () => {
      const requests: string[] = []
      const app = defineApp({
        routes: [
          route('/', { page: () => <html><Head alpine={false} htmx={false} /><body><a id="out" href="/logout">Sair</a><a id="ok" href="/next">Seguir</a></body></html> }),
          route('/logout', { page: () => <p>saiu</p> }),
          route('/next', { page: () => <p>seguiu</p> }),
        ],
      })
      const assets = fileServer(path.join(import.meta.dir, 'nao-existe'), { vendor: true })
      const chrome = await open(async req => {
        requests.push(new URL(req.url).pathname)
        return assets(req) ?? app.respond(req)
      }, '/')
      try {
        await chrome.evaluate(`document.getElementById('out').focus()`)
        await chrome.evaluate(`document.getElementById('ok').focus()`)
        for (let i = 0; i < 200 && !requests.includes('/next'); i++) await Bun.sleep(5)
        expect(requests).toContain('/next')
        expect(requests).not.toContain('/logout')
      } finally {
        await chrome.close()
      }
    })
  })
})

it('o script de navegação é JavaScript válido', () => {
  // Template string engole barra invertida: um erro aqui quebra a navegação de todo site.
  expect(() => new Function(navigationJs)).not.toThrow()
})
