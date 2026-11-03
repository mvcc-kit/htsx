// Falhas reproduzidas na auditoria de 02/11/2026. Cada teste falhava antes da correção.
import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { contentSecurityPolicy, createElement as h, createNonce, csrf, defineEvents, ErrorBoundary, renderPage, UserContent, flash, htmxResponse, inspector, OOB, raw, renderToString, resolveSuspense, sseEvent, sseResponse, Suspense, suspenseRegistry, withContext } from '../index'
import { defineApp, getRequestEvent, localPath, redirect, route } from '../app'
import { Head } from '../meta'
import { symlinkSync } from 'node:fs'
import { createCookies } from '../src/app/cookies'
import { createHtmxContext } from '../src/app/htmx'
import { fileServer, outputPath } from '../src/build/files'
import { cssValue } from '../src/escape'
import { withoutStrictMode } from './setup'

const JS = 'javascript:alert(1)'
const app = defineApp({
  routes: [
    route('/', { page: () => <p>x</p> }),
    route('/go', { load: ({ url }) => redirect(303, url.searchParams.get('to')!), page: () => null }),
    route('/boom', { load: () => { throw new Error('segredo interno') }, page: () => null }),
  ],
  handleError: () => ({ message: 'Erro tratado' }),
})
const get = (p: string, headers: Record<string, string> = {}) => app.respond(new Request(`https://site.dev${p}`, { headers }))

describe('open redirect', () => {
  it('barra no fim não leva a outro site', async () => {
    for (const p of ['//evil.com/', '///evil.com/', '//evil.com//']) {
      const res = await get(p)
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toBe('/evil.com')
    }
  })

  it('mantém a query e o redirecionamento normal', async () => {
    expect((await get('/sobre/?a=1')).headers.get('location')).toBe('/sobre?a=1')
  })
})

describe('javascript: em redirecionamento', () => {
  it('redirect() recusa, e o htmx não recebe a URL', async () => {
    const quiet = console.error
    console.error = () => {}
    const res = await app.respond(new Request(`https://site.dev/go?to=${encodeURIComponent(JS)}`, { headers: { 'hx-request': 'true' } }))
    console.error = quiet
    expect(res.status).toBe(500)
    expect(res.headers.get('hx-redirect')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
  })

  it('caminho normal continua funcionando', async () => {
    expect((await get('/go?to=/ok')).headers.get('location')).toBe('/ok')
    expect((await get('/go?to=https://site.dev/ok')).headers.get('location')).toBe('https://site.dev/ok')
  })

  it('event.htmx.redirect e location recusam', () => {
    const response = new Headers()
    const hx = createHtmxContext(new Headers(), response)
    expect(() => hx.redirect(JS)).toThrow(/esquema perigoso/)
    expect(() => hx.location(JS)).toThrow(/esquema perigoso/)
    hx.redirect('/ok')
    expect(response.get('hx-redirect')).toBe('/ok')
  })
})

describe('atributos e elementos', () => {
  describe('fora do modo estrito', () => {
    withoutStrictMode()

    it('URL perigosa é trocada em todo atributo de URL, com qualquer capitalização', async () => {
      const cases: Array<[string, Record<string, string>, string]> = [
        ['button', { formAction: JS }, 'formaction'],
        ['a', { HREF: JS }, 'HREF'],
        ['a', { 'xlink:href': JS }, 'xlink:href'],
        ['object', { data: JS }, 'data'],
        ['video', { poster: JS }, 'poster'],
      ]
      for (const [tag, props, attr] of cases) {
        const html = await renderToString(() => h(tag, props))
        expect(html).toContain(`${attr}="#"`)
        expect(html).not.toContain('javascript')
      }
    })

    it('nome herdado de Object não vira código no HTML', async () => {
      const html = await renderToString(() => h('a', { constructor: 'x', toString: 'y' } as never))
      expect(html).toBe('<a constructor="x" toString="y"></a>')
    })

    it('função em atributo não vira código no HTML', async () => {
      expect(await renderToString(() => h('a', { title: () => 'segredo' } as never))).toBe('<a></a>')
    })
  })

  it('função em atributo é erro no modo estrito', () => {
    expect(() => h('a', { title: () => 'x' } as never)).toThrow(/recebeu uma função/)
  })

  it('nome de elemento inválido é erro, com ou sem modo estrito', () => {
    expect(() => h('img src=x onerror=alert(1)', {})).toThrow(/nome de elemento inválido/)
    expect(() => h('a>', {})).toThrow(/nome de elemento inválido/)
    for (const ok of ['div', 'my-element', 'svg:rect']) expect(() => h(ok, {})).not.toThrow()
  })

  it('valor CSS não cria outra propriedade, mas aceita ; dentro de url() e aspas', () => {
    expect(cssValue('red; position: fixed')).toBe('red')
    expect(cssValue('url(data:image/png;base64,AA)')).toBe('url(data:image/png;base64,AA)')
    expect(cssValue("'a;b'")).toBe("'a;b'")
    expect(cssValue(10)).toBe('10')
  })
})

describe('OOB', () => {
  it('aceita lista e componente assíncrono; texto continua escapado', async () => {
    expect(await renderToString(() => OOB({ target: 'a', children: [raw('<b>1</b>'), raw('<b>2</b>')] }))).toBe('<div id="a" hx-swap-oob="true"><b>1</b><b>2</b></div>')
    expect(await renderToString(() => OOB({ target: 'a', children: Promise.resolve(raw('<b>1</b>')) }))).toBe('<div id="a" hx-swap-oob="true"><b>1</b></div>')
    expect(await renderToString(() => OOB({ target: 'a', children: '<script>' }))).toContain('&lt;script&gt;')
  })
})

describe('ErrorBoundary', () => {
  it('fallback aceita lista, sem virar texto escapado; texto continua escapado', async () => {
    const Boom = () => { throw new Error('x') }
    const render = (fallback: () => unknown) => renderToString(() => ErrorBoundary({ fallback, children: (() => { try { return Boom() } catch (e) { return Promise.reject(e) } })() }))
    expect(await render(() => [raw('<i>a</i>'), raw('<i>b</i>')])).toBe('<i>a</i><i>b</i>')
    expect(await render(() => '<b>')).toBe('&lt;b&gt;')
  })
})

describe('Suspense', () => {
  it('texto vindo de fora é escapado', async () => {
    const out = await withContext(suspenseRegistry(), async () => {
      Suspense({ id: 'a', fallback: 'f', children: Promise.resolve('<img src=x onerror=alert(1)>') })
      return resolveSuspense('a')
    })
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('fallback aceita lista; falha sem pedido do cliente não derruba o processo', async () => {
    const html = await withContext(suspenseRegistry(), async () => {
      Suspense({ id: 'erro', fallback: 'f', children: Promise.reject(new Error('falhou')) })
      await Bun.sleep(0)
      return renderToString(() => Suspense({ id: 'b', fallback: [raw('<i>1</i>')], children: '' }))
    })
    expect(html).toContain('<i>1</i>')
  })
})

describe('CSRF', () => {
  const opts = { secret: 'x'.repeat(32), sessionId: 'id-secreto-da-sessao' }

  it('o token, que vai para o HTML, não carrega o id da sessão', async () => {
    const token = await csrf.sign(opts)
    expect(token.split('.')).toHaveLength(2)
    expect(token).not.toContain(btoa(opts.sessionId).replace(/=+$/, ''))
    expect(await csrf.verify(token, opts)).toBe(true)
  })

  it('continua preso à sessão e recusa formato velho, data forjada e sufixo', async () => {
    const token = await csrf.sign(opts)
    expect(await csrf.verify(token, { ...opts, sessionId: 'outra' })).toBe(false)
    const [ts, sig] = token.split('.') as [string, string]
    expect(await csrf.verify(`aWQ.${ts}.${sig}`, opts)).toBe(false)
    expect(await csrf.verify(`${ts}abc.${sig}`, opts)).toBe(false)
    expect(await csrf.verify(`${Number(ts) + 1}.${sig}`, opts)).toBe(false)
  })
})

describe('SSE', () => {
  it('CR sozinho não cria outro evento', () => {
    const frame = sseEvent('a\revent: admin\rdata: forjado')
    expect(frame.split(/\r\n|\r|\n/)).toEqual(['event: message', 'data: a', 'data: event: admin', 'data: data: forjado', '', ''])
  })

  it('cliente que sai encerra o gerador', async () => {
    let closed = false
    async function* events() {
      try { for (let i = 0; ; i++) yield `data: ${i}\n\n` } finally { closed = true }
    }
    const reader = sseResponse(events).body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(closed).toBe(true)
  })
})

describe('HX-Trigger', () => {
  it('htmxResponse aceita emoji e acento', async () => {
    const res = await htmxResponse(() => raw('x'), { trigger: { a: 'ação 😀' } })
    expect(JSON.parse(res.headers.get('hx-trigger')!)).toEqual({ a: 'ação 😀' })
  })

  it('defineEvents não aceita nomes herdados de Object', () => {
    const { emit } = defineEvents({ a: () => 1 }) as unknown as { emit(name: string): unknown }
    expect(() => emit('constructor')).toThrow(/não registrado/)
  })
})

describe('cookies', () => {
  const read = (cookie: string) => createCookies(new Request('http://x', { headers: { cookie } }), true)

  it('repetido vale o primeiro; nomes de Object não existem', () => {
    expect(read('a=1; a=2').get('a')).toBe('1')
    expect(read('').get('constructor')).toBeUndefined()
    expect(read('__proto__=x').getAll()).toEqual({ ['__proto__']: 'x' } as Record<string, string>)
  })

  it('path e domain não injetam atributos', () => {
    expect(() => read('').set('s', 'v', { path: '/; Domain=evil.com' })).toThrow(/não pode ter/)
    expect(() => read('').set('s', 'v', { domain: 'a\r\nb' })).toThrow(/não pode ter/)
    expect(() => flash.setCookie('v', { path: '/; x' })).toThrow(/não pode ter/)
    expect(() => flash.clearCookie({ domain: 'a;b' })).toThrow(/não pode ter/)
  })

  it('SameSite=None sempre com Secure', () => {
    const local = createCookies(new Request('http://x'), false)
    local.set('s', 'v', { sameSite: 'None' })
    expect(local.headers.at(-1)).toContain('Secure')
    expect(() => local.set('s', 'v', { sameSite: 'None', secure: false })).toThrow(/precisa de Secure/)
  })
})

describe('respostas', () => {
  it('cabeçalhos de segurança por padrão; a rota vence; false desliga', async () => {
    const res = await get('/')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    const custom = defineApp({
      securityHeaders: { 'content-security-policy': "default-src 'self'" },
      routes: [route('/', { GET: () => new Response('x', { headers: { 'x-frame-options': 'DENY' } }) })],
    })
    const own = await custom.respond(new Request('http://x/'))
    expect(own.headers.get('x-frame-options')).toBe('DENY')
    expect(own.headers.get('content-security-policy')).toBe("default-src 'self'")
    const off = defineApp({ securityHeaders: false, routes: [route('/', { page: () => <p>x</p> })] })
    expect((await off.respond(new Request('http://x/'))).headers.get('x-frame-options')).toBeNull()
  })

  it('handleError que falha não derruba a resposta nem vaza o erro', async () => {
    const quiet = console.error
    console.error = () => {}
    const broken = defineApp({
      handleError: () => { throw new Error('falhou de novo') },
      routes: [route('/', { load: () => { throw new Error('segredo interno') }, page: () => null })],
    })
    const res = await broken.respond(new Request('http://x/'))
    console.error = quiet
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('segredo')
  })

  it('erro inesperado não vaza a mensagem', async () => {
    const res = await get('/boom')
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('Erro tratado')
  })
})

describe('build e desenvolvimento', () => {
  const tmp: string[] = []
  afterAll(async () => { await Promise.all(tmp.map(d => rm(d, { recursive: true, force: true }))) })

  it('prerender não grava fora da pasta de saída', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'htsx-out-'))
    tmp.push(dir)
    expect(() => outputPath(dir, '../fora.html')).toThrow(/fora da pasta de saída/)
    expect(() => outputPath(dir, 'a/../../fora.html')).toThrow(/fora da pasta de saída/)
    expect(outputPath(dir, 'a/b.html')).toBe(path.join(dir, 'a/b.html'))
  })

  it('inspector() some em produção', () => {
    const before = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    expect(inspector()).toBe('')
    process.env.NODE_ENV = before
    expect(inspector()).toContain('__htsx')
  })
})

describe('auditoria 2: cache e cabeçalhos do cliente', () => {
  const Layout = ({ children }: { children?: unknown }) => <html><head></head><body>{children as string}</body></html>
  const layoutApp = defineApp({
    layout: Layout,
    routes: [
      route('/', { page: () => <p>x</p> }),
      route('/login', { load: ({ cookies }) => { cookies.set('sid', '1') }, page: () => <p>x</p> }),
      route('/own', { load: ({ cookies, setHeaders }) => { cookies.set('sid', '1'); setHeaders({ 'cache-control': 'private, max-age=5' }) }, page: () => <p>x</p> }),
    ],
  })
  const call = (p: string, headers: Record<string, string> = {}) => layoutApp.respond(new Request(`https://x.dev${p}`, { headers }))

  it('todo cabeçalho que muda a resposta está no Vary, também em erro', async () => {
    for (const res of [await call('/'), await call('/', { 'hx-request': 'true' }), await call('/nada')]) {
      const vary = res.headers.get('vary')!
      for (const name of ['HX-Request', 'HX-Boosted', 'HX-Target', 'HX-History-Restore-Request']) expect(vary).toContain(name)
    }
  })

  it('resposta que grava cookie não vai para cache compartilhado; a rota pode escolher', async () => {
    expect((await call('/login')).headers.get('cache-control')).toBe('private, no-store')
    expect((await call('/own')).headers.get('cache-control')).toBe('private, max-age=5')
    expect((await call('/')).headers.get('cache-control')).toBeNull()
  })

  it('cabeçalho do cliente não liga o prerender nem pula handle', async () => {
    let handled = 0
    const guarded = defineApp({
      handle: ({ event, resolve }) => { handled++; return resolve(event) },
      routes: [route('/', { page: ({ params }) => { void params; return <p>{String(getRequestEvent().prerendering)}</p> } })],
    })
    const headers = { 'x-htsx-prerender': 'true', 'x-middleware-subrequest': 'src/hooks', 'hx-request': 'true', 'hx-boosted': 'true' }
    expect(await (await guarded.respond(new Request('https://x.dev/', { headers }))).text()).toBe('<p>false</p>')
    expect(handled).toBe(1)
  })
})

describe('auditoria 2: formulário e limites', () => {
  const app2 = defineApp({
    bodyLimit: 100,
    routes: [route('/', {
      actions: { save: async ({ request }) => ({ size: (await request.formData()).get('a')?.toString().length }) },
      page: ({ form }) => <p>{`ok ${form?.size ?? ''}`}</p>,
    })],
  })
  const post = (body: BodyInit, headers: Record<string, string> = {}) => app2.respond(new Request('https://x.dev/?/save', {
    method: 'POST', body, duplex: 'half',
    headers: { origin: 'https://x.dev', 'content-type': 'application/x-www-form-urlencoded', ...headers },
  } as RequestInit))

  it('corpo declarado grande demais dá 413 sem ler', async () => {
    const res = await post('a=' + 'x'.repeat(200))
    expect(res.status).toBe(413)
  })

  it('corpo sem tamanho declarado para ao passar do limite', async () => {
    const stream = (size: number) => new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('a=' + 'x'.repeat(size))); c.close() },
    })
    const quiet = console.error
    console.error = () => {}
    const res = await post(stream(500))
    console.error = quiet
    expect(res.status).toBe(413)
    expect(await post(stream(10)).then(r => r.text())).toContain('ok 10')
  })

  it('corpo dentro do limite passa', async () => {
    expect(await (await post('a=abc')).text()).toContain('ok 3')
  })

  it('bodyLimit: false desliga', async () => {
    const open = defineApp({ bodyLimit: false, routes: [route('/', { actions: { default: () => ({}) }, page: () => <p>x</p> })] })
    const res = await open.respond(new Request('https://x.dev/', { method: 'POST', body: 'a='.padEnd(20_000_000, 'x'), headers: { origin: 'https://x.dev', 'content-type': 'text/plain' } }))
    expect(res.status).toBe(200)
  })

  describe('fora do modo estrito', () => {
    withoutStrictMode()
    it('404 de ação não lista as ações da rota', async () => {
      const res = await defineApp({ routes: [route('/', { actions: { secretAdminAction: () => ({}) }, page: () => null })] })
        .respond(new Request('https://x.dev/?/nada', { method: 'POST', body: 'a=1', headers: { origin: 'https://x.dev', 'content-type': 'text/plain' } }))
      expect(res.status).toBe(404)
      expect(await res.text()).not.toContain('secretAdminAction')
    })
  })
})

describe('auditoria 2: utilitários', () => {
  it('localPath só aceita caminho deste site', () => {
    for (const ok of ['/', '/a', '/a?b=1#c', '/a//b']) expect(localPath(ok)).toBe(ok)
    for (const bad of ['//evil.com', '/\\evil.com', '/\t/evil.com', 'https://evil.com', 'javascript:alert(1)', 'a', '', null, undefined, '/a\nb']) expect(localPath(bad, '/home')).toBe('/home')
  })

  it('CSP: padrão sem unsafe, com o que foi pedido', () => {
    const base = contentSecurityPolicy()
    expect(base).toContain("script-src 'self'")
    expect(base).not.toContain('unsafe')
    expect(base).toContain("object-src 'none'")
    expect(base).toContain("base-uri 'none'")
    expect(contentSecurityPolicy({ alpine: true })).toContain("'unsafe-eval'")
    const full = contentSecurityPolicy({ nonce: 'abc', connect: ['https://api.x.dev'], scripts: ['https://c.dev'], frames: ['https://c.dev'] })
    expect(full).toContain("'nonce-abc'")
    expect(full).toContain("connect-src 'self' https://api.x.dev")
    expect(full).toContain('frame-src https://c.dev')
  })

  it('CSP recusa injeção de diretiva', () => {
    expect(() => contentSecurityPolicy({ connect: ["https://a.dev; script-src 'unsafe-inline'"] })).toThrow(/origem inválida/)
    expect(() => contentSecurityPolicy({ scripts: ["'unsafe-inline'"] })).toThrow(/origem inválida/)
    expect(() => contentSecurityPolicy({ nonce: "x'; script-src *" })).toThrow(/nonce inválido/)
  })

  it('createNonce muda a cada chamada e cabe na CSP', () => {
    const a = createNonce()
    expect(a).not.toBe(createNonce())
    expect(() => contentSecurityPolicy({ nonce: a })).not.toThrow()
  })

  it('UserContent desliga htmx e Alpine no trecho', async () => {
    const html = await renderToString(() => UserContent({ html: '<a hx-get="/x">y</a>', class: 'a"b' }))
    expect(html).toBe('<div class="a&#34;b" hx-disable="true" x-ignore><a hx-get="/x">y</a></div>')
  })

  it('<Head nonce> entrega o nonce ao htmx', async () => {
    const html = await renderPage(() => <html><Head nonce="abc" vendor="/v/" /><body></body></html>)
    expect(html).toContain('inlineScriptNonce')
    expect(html).toContain('selfRequestsOnly')
    expect(html).toContain('nonce="abc"')
  })

  it('flash vence e não é aceito como outro token', async () => {
    const secret = 'x'.repeat(32)
    const token = await flash.serialize([{ type: 'info', text: 'oi' }], { secret })
    expect(await flash.parse(token, { secret })).toHaveLength(1)
    expect(await flash.parse(token, { secret, maxAge: -1 })).toEqual([])
    expect(await csrf.verify(token, { secret, sessionId: 's' })).toBe(false)
  })

  it('cookies com prefixo seguem as regras, em vez de sumir no navegador', () => {
    const jar = createCookies(new Request('http://localhost'), false)
    jar.set('__Host-sid', 'v')
    expect(jar.headers.at(-1)).toContain('Secure')
    expect(() => jar.set('__Host-sid', 'v', { path: '/a' })).toThrow(/__Host-/)
    expect(() => jar.set('__Host-sid', 'v', { domain: 'x.dev' })).toThrow(/__Host-/)
    expect(() => jar.set('__Secure-sid', 'v', { secure: false })).toThrow(/__Secure-/)
    expect(() => jar.set('big', 'x'.repeat(5000))).toThrow(/bytes/)
  })

  describe('fileServer', () => {
    const made: string[] = []
    afterAll(async () => { await Promise.all(made.map(d => rm(d, { recursive: true, force: true }))) })

    it('link simbólico para fora da pasta e barra invertida não servem o arquivo', async () => {
      const base = await mkdtemp(path.join(tmpdir(), 'htsx-fs-'))
      const outside = await mkdtemp(path.join(tmpdir(), 'htsx-secret-'))
      made.push(base, outside)
      await Bun.write(path.join(outside, 'secret.txt'), 'segredo')
      await Bun.write(path.join(base, 'ok.txt'), 'ok')
      symlinkSync(path.join(outside, 'secret.txt'), path.join(base, 'link.txt'))
      const files = fileServer(base)
      expect(files('http://x/ok.txt')?.status).toBe(200)
      expect(files('http://x/link.txt')).toBeNull()
      expect(files('http://x/a%5C..%5Cok.txt')).toBeNull()
    })
  })
})
