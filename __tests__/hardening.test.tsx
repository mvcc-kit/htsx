// Falhas reproduzidas na auditoria de 02/11/2026. Cada teste falhava antes da correção.
import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createElement as h, csrf, defineEvents, flash, htmxResponse, inspector, OOB, raw, renderToString, resolveSuspense, sseEvent, sseResponse, Suspense, suspenseRegistry, withContext } from '../index'
import { defineApp, redirect, route } from '../app'
import { createCookies } from '../src/app/cookies'
import { createHtmxContext } from '../src/app/htmx'
import { outputPath } from '../src/build/files'
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
