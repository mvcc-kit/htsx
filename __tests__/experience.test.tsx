// O que a pessoa percebe: redirecionamento, leitor de tela, carregamento, envio duplo, e o que ajuda quem programa.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { Image, renderToString } from '../index'
import { Head, Outlet, Title } from '../meta'
import { defineApp, fail, href, partial, redirect, route, type StandardSchema } from '../kit'
import { fileServer } from '../src/build/files'
import { createLiveReload, injectLiveReload, LIVE_RELOAD_PATH } from '../src/build/live-reload'
import { htmxRedirectHeaders } from '../src/app/request'
import { start } from '../src/build/commands'
import config from './fixtures/fs-site/htsx.config'
import { findChrome, open, type App } from '../testing'

describe('redirecionamento com htmx', () => {
  it('no Outlet, sem recarregar; fora dele ou para outro site, recarrega', () => {
    const inside = JSON.parse(htmxRedirectHeaders('/done', true, 'p')['hx-location']!)
    expect(inside).toMatchObject({ path: '/done', target: '#p', select: '#p' })
    expect(inside.headers).toEqual({ 'HX-Boosted': 'true', 'HX-Target': 'p' })
    expect(htmxRedirectHeaders('/done', false, 'p')).toEqual({ 'hx-redirect': '/done' })
    expect(htmxRedirectHeaders('https://x.dev/a', true, 'p')).toEqual({ 'hx-redirect': 'https://x.dev/a' })
    expect(htmxRedirectHeaders('//evil.com', true, 'p')).toEqual({ 'hx-redirect': '//evil.com' })
  })

  it('não responde 3xx ao htmx; sem htmx, continua 303', async () => {
    const app = defineApp({ routes: [route('/', { load: () => redirect(303, '/a'), page: () => null })] })
    const viaHtmx = await app.respond(new Request('http://x/', { headers: { 'hx-request': 'true' } }))
    expect(viaHtmx.status).toBe(200)
    expect(viaHtmx.headers.get('location')).toBeNull()
    expect(viaHtmx.headers.get('hx-redirect')).toBe('/a')
    const plain = await app.respond(new Request('http://x/'))
    expect(plain.status).toBe(303)
    expect(plain.headers.get('location')).toBe('/a')
  })
})

describe('href', () => {
  it('monta o link, com escape', () => {
    expect(href('/')).toBe('/')
    expect(href('/about')).toBe('/about')
    expect(href('/blog/[slug]', { slug: 'a b/c' })).toBe('/blog/a%20b%2Fc')
    expect(href('/[[lang]]/x', {})).toBe('/x')
  })

  it('parâmetro errado é erro de tipo', () => {
    // @ts-expect-error falta slug
    expect(() => href('/blog/[slug]')).toThrow(/falta o parâmetro/)
    // @ts-expect-error nome errado
    expect(() => href('/blog/[slug]', { id: 'x' })).toThrow(/falta o parâmetro/)
  })
})

describe('Image', () => {
  it('adia por padrão, e priority inverte', async () => {
    expect(await renderToString(() => <Image src="/a.webp" alt="A" width={10} height={20} />)).toBe('<img loading="lazy" decoding="async" src="/a.webp" alt="A" width="10" height="20">')
    expect(await renderToString(() => <Image src="/a.webp" alt="" width={10} height={20} priority />)).toContain('loading="eager" decoding="async" fetchpriority="high"')
  })
})

describe('recarga no dev', () => {
  it('entra antes de </body>, e sem ele vai no fim', () => {
    expect(injectLiveReload('<body>x</body>')).toMatch(/^<body>x<script>.*<\/script><\/body>$/)
    expect(injectLiveReload('x')).toMatch(/^x<script>/)
  })

  it('avisa os conectados, juntando mudanças seguidas', async () => {
    const live = createLiveReload(1)
    const reader = live.response().body!.getReader()
    await reader.read()
    live.notify(); live.notify()
    const { value } = await reader.read()
    expect(new TextDecoder().decode(value)).toContain('event: reload')
    live.close()
  })

  it('o servidor de dev injeta o script e mostra a pilha; a produção, não', async () => {
    const root = path.join(import.meta.dir, 'fixtures', 'fs-site')
    const dev = await start(config, root, { watch: true, port: 0 })
    const prod = await start(config, root, { port: 0 })
    const page = (server: typeof dev, p: string) => fetch(`http://localhost:${server.port}${p}`, { headers: { accept: 'text/html' } })
    try {
      expect(await (await page(dev, '/about')).text()).toContain('EventSource')
      expect((await page(dev, LIVE_RELOAD_PATH)).headers.get('content-type')).toContain('event-stream')
      expect(await (await page(prod, '/about')).text()).not.toContain('EventSource')
      expect((await page(prod, LIVE_RELOAD_PATH)).status).toBe(404)
    } finally {
      await dev.stop(); await prod.stop()
    }
  }, 20000)

  it('event.dev controla a pilha do erro', async () => {
    const quiet = console.error
    console.error = () => {}
    const app = defineApp({ routes: [route('/', { load: () => { throw new Error('detalhe interno') }, page: () => null })] })
    const dev = await (await app.respond(new Request('http://x/'), { dev: true })).text()
    const prod = await (await app.respond(new Request('http://x/'))).text()
    console.error = quiet
    expect(dev).toContain('detalhe interno')
    expect(prod).not.toContain('detalhe interno')
  })
})

const assets = fileServer(path.join(import.meta.dir, 'nao-existe'), { vendor: true })
const pageInput: StandardSchema<{ n: number }> = {
  '~standard': { version: 1, vendor: 't', validate: v => ({ value: { n: Number((v as { n?: string }).n) } }) },
}

describe.skipIf(!findChrome())('no Chrome real', () => {
  let chrome: App
  let posts = 0
  let release: (() => void) | undefined
  const Slow = partial({ input: pageInput, render: ({ input }) => <p id="slow">{`Carregou ${input.n}`}</p> })
  const Layout = ({ children }: { children?: unknown }) => (
    <html><Head alpine={false} /><body hx-boost="true"><nav id="menu"><a href="/start">Início</a> <a href="/other">Outra</a> <a href="/long#fim">Âncora</a> <a href="/hanging">Lenta</a> <a href="/gone">Sem rede</a></nav><Outlet>{children as string}</Outlet></body></html>
  )
  const app = defineApp({
    layout: Layout,
    routes: [
      route('/start', {
        partials: { slow: Slow },
        actions: {
          go: () => redirect(303, '/other'),
          invalid: () => fail(422, { message: 'obrigatório' }),
          counted: async () => { posts++; await Bun.sleep(150); return { ok: true } },
        },
        page: ({ form }) => (
          <main>
            <Title>Início</Title>
            <h1>Página inicial</h1>
            <form method="post" action="?/go"><button>Enviar e redirecionar</button></form>
            <form method="post" action="?/invalid"><input id="field" name="a" aria-invalid={form ? 'true' : undefined} /><button>Enviar inválido</button></form>
            <form method="post" action="?/counted"><button id="counted">Enviar uma vez</button></form>
            <button hx-post="?/go" hx-target="#t">Redirecionar com hx-post</button>
            <div id="t"></div>
            {Slow.lazy({ n: 7 }, { fallback: 'Aguarde' })}
            <p>{(form as { message?: string } | undefined)?.message ?? ''}</p>
          </main>
        ),
      }),
      route('/other', { page: () => <main><Title>Outra página</Title><h1>Conteúdo da outra</h1></main> }),
      route('/focus', { page: () => <main><Title>Foco</Title><input id="auto" autofocus /></main> }),
      route('/long', { page: () => <main><Title>Longa</Title><div style={{ height: '4000px' }}></div><h2 id="fim">Fim</h2></main> }),
      route('/gone', { page: () => <main><Title>Sem rede</Title><h1>Carga completa</h1></main> }),
      route('/hanging', {
        load: () => new Promise<void>(resolve => { release = resolve }),
        page: () => <main><Title>Lenta</Title><h1>Terminou</h1></main>,
      }),
    ],
  })
  beforeAll(async () => { chrome = await open(async req => assets(req) ?? app.respond(req), '/start') })
  afterAll(async () => { await chrome?.close() })
  const ev = <T,>(e: string) => chrome.evaluate<T>(e)
  const until = async (expr: string, ms = 3000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await ev<boolean>(expr).catch(() => false)) return true
      await Bun.sleep(10)
    }
    return false
  }
  const home = async () => { await chrome.goto('/start'); await chrome.waitFor('text:Página inicial'); await ev('window.__same = true') }

  it('redirect() depois de formulário mantém o layout e não recarrega', async () => {
    await home()
    await chrome.press('text:Enviar e redirecionar')
    await chrome.waitFor('text:Conteúdo da outra')
    expect(await ev<string>('location.pathname')).toBe('/other')
    expect(await until(`document.title === 'Outra página'`)).toBe(true)
    expect(await ev<number>(`document.querySelectorAll('#menu').length`)).toBe(1)
    expect(await ev<number>(`document.querySelectorAll('#htsx-page').length`)).toBe(1)
    expect(await ev<boolean>('window.__same === true')).toBe(true)
  })

  it('redirect() com hx-post leva à página de destino, em vez de cair no alvo', async () => {
    await home()
    await ev(`document.querySelector('[hx-post]').click()`).catch(() => {})
    expect(await until(`location.pathname === '/other' && !!document.querySelector('h1') && document.querySelector('h1').textContent.includes('outra')`)).toBe(true)
    expect(await ev<number>(`document.querySelectorAll('#menu').length`)).toBe(1)
  })

  it('navegar anuncia o título e leva o foco ao conteúdo', async () => {
    await home()
    await chrome.press('text:Outra')
    await chrome.waitFor('text:Conteúdo da outra')
    expect(await until(`document.getElementById('htsx-announcer')?.textContent === 'Outra página'`)).toBe(true)
    expect(await ev<string>(`document.getElementById('htsx-announcer').getAttribute('aria-live')`)).toBe('polite')
    expect(await ev<string>('document.activeElement.id')).toBe('htsx-page')
  })

  it('autofocus tem prioridade', async () => {
    await chrome.goto('/focus')
    await ev(`(() => { const a = document.createElement('a'); a.href = '/focus'; a.id = 'again'; a.textContent = 'x'; document.getElementById('menu').appendChild(a); htmx.process(a) })()`)
    await chrome.press('id:again')
    expect(await until(`document.activeElement.id === 'auto'`)).toBe(true)
  })

  it('âncora rola até o trecho depois da troca', async () => {
    await home()
    await chrome.press('text:Âncora')
    await chrome.waitFor('id:fim')
    expect(await until(`scrollY > 2000`)).toBe(true)
    expect(await ev<string>('location.hash')).toBe('#fim')
  })

  it('navegação lenta mostra o indicador, e ele some ao terminar', async () => {
    await home()
    await chrome.press('text:Lenta')
    expect(await until(`document.documentElement.classList.contains('htsx-navigating')`)).toBe(true)
    expect(await ev<string>(`document.getElementById('htsx-page').getAttribute('aria-busy')`)).toBe('true')
    for (let i = 0; i < 300 && !release; i++) await Bun.sleep(5)
    release?.()
    await chrome.waitFor('text:Terminou')
    expect(await until(`!document.documentElement.classList.contains('htsx-navigating')`)).toBe(true)
  })

  it('duplo clique envia uma vez só, e o botão volta depois', async () => {
    await home()
    posts = 0
    await ev(`(() => { const b = document.getElementById('counted'); b.click(); b.click(); b.click() })()`)
    expect(await until(`document.title !== ''`)).toBe(true)
    await Bun.sleep(400)
    expect(posts).toBe(1)
    expect(await ev<number>(`document.querySelectorAll('[data-htsx-pending]').length`)).toBe(0)
  })

  it('erro de validação leva o foco ao campo inválido', async () => {
    await home()
    await chrome.press('text:Enviar inválido')
    await chrome.waitFor('text:obrigatório')
    expect(await until(`document.activeElement.id === 'field'`)).toBe(true)
  })

  it('lazy: fallback primeiro, e o trecho chega sozinho', async () => {
    await home()
    await chrome.waitFor('id:slow')
    expect(await chrome.text('id:slow')).toBe('Carregou 7')
    expect(await ev<string>('location.pathname')).toBe('/start')
  })

  it('sem rede, a navegação vira carga completa', async () => {
    await home()
    await ev(`(() => { const send = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.send = function () { setTimeout(() => this.onerror(new ProgressEvent('error'))); XMLHttpRequest.prototype.send = send } })()`)
    await chrome.press('text:Sem rede')
    let done = false
    for (let i = 0; i < 300 && !done; i++) {
      done = await ev<boolean>(`location.pathname === '/gone' && !window.__same`).catch(() => false)
      await Bun.sleep(10)
    }
    expect(done).toBe(true)
  })
})
