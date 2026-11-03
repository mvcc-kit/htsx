// <Head> e <Outlet>: padrões, partes do servidor e navegação no Chrome real, com servidor e estático.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { renderPage, renderToString, VENDOR_PATH } from '../index'
import { Head, Outlet, Title } from '../meta'
import { defineApp, route } from '../app'
import { buildStatic } from '../adapter-static'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileServer } from '../src/build/files'
import { DEFAULT_HTMX_CONFIG, resolveAlpineOptions, resolveHtmxConfig } from '../src/meta/logic'
import { navigationJs } from '../src/navigation'
import { OUTLET_ID, PARTIALS_PATH, wantsOutlet } from '../src/outlet'
import { findChrome, open, type App } from '../testing'

describe('regras do <Head>', () => {
  it('htmx: true e vazio usam o padrão, objeto soma, false desliga', () => {
    expect(resolveHtmxConfig(undefined)).toEqual({ ...DEFAULT_HTMX_CONFIG })
    expect(resolveHtmxConfig(true)).toEqual({ ...DEFAULT_HTMX_CONFIG })
    expect(resolveHtmxConfig({ timeout: 5, historyCacheSize: 3 })).toEqual({ ...DEFAULT_HTMX_CONFIG, historyCacheSize: 3, timeout: 5 })
    expect(resolveHtmxConfig(false)).toBeNull()
  })

  it('alpine: true e vazio carregam, objeto passa, false desliga', () => {
    expect(resolveAlpineOptions(undefined)).toEqual({})
    expect(resolveAlpineOptions({ plugins: ['mask'] })).toEqual({ plugins: ['mask'] })
    expect(resolveAlpineOptions(false)).toBeNull()
  })
})

describe('<Head>', () => {
  const render = (head: unknown) => renderPage(() => <html>{head as string}<body></body></html>)

  it('por padrão traz charset, viewport, htmx, Alpine e navegação do VENDOR_PATH', async () => {
    const html = await render(<Head />)
    for (const part of ['<meta charset="utf-8">', 'name="viewport"', `${VENDOR_PATH}htmx.min.js`, `${VENDOR_PATH}alpine.min.js`, `${VENDOR_PATH}htsx-nav.js`, 'historyCacheSize']) {
      expect(html).toContain(part)
    }
    expect(html.indexOf('charset')).toBeLessThan(html.indexOf('<script'))
  })

  it('false desliga cada parte, sem sobrar configuração', async () => {
    const html = await render(<Head htmx={false} alpine={false} navigation={false} />)
    for (const part of ['htmx', 'alpine', 'htsx-nav']) expect(html).not.toContain(part)
  })

  it('objeto configura; filhos e a página entram no mesmo <head>', async () => {
    const html = await renderPage(() => (
      <html><Head htmx={{ timeout: 9 }} alpine={{ plugins: ['mask'] }} vendor="/v/"><Title>Padrão</Title></Head><body><Title>Página</Title></body></html>
    ))
    expect(html).toContain('&quot;timeout&quot;:9')
    expect(html).toContain('/v/alpine-mask.min.js')
    expect(html).toContain('<title>Página</title>')
    expect(html).not.toContain('Padrão')
  })
})

describe('partial no servidor', () => {
  const Layout = ({ children }: { children?: unknown }) => <html><Head /><body hx-boost="true"><nav>menu</nav><Outlet>{children as string}</Outlet></body></html>
  const app = defineApp({
    layout: Layout,
    routes: [
      route('/', { page: () => <main><Title>Início</Title>oi</main> }),
      route('/propria', { layout: ({ children }) => <html><head></head><body>{children}</body></html>, page: () => <main>x</main> }),
    ],
  })
  const boost = { 'hx-request': 'true', 'hx-boosted': 'true', 'hx-target': OUTLET_ID }
  const get = (p: string, headers: Record<string, string> = {}) => app.respond(new Request(`http://x${p}`, { headers }))

  it('wantsOutlet só com boost, alvo certo e fora da restauração de histórico', () => {
    expect(wantsOutlet(new Headers(boost))).toBe(true)
    expect(wantsOutlet(new Headers({ ...boost, 'hx-target': 'outro' }))).toBe(false)
    expect(wantsOutlet(new Headers({ 'hx-target': OUTLET_ID }))).toBe(false)
    expect(wantsOutlet(new Headers({ ...boost, 'hx-history-restore-request': 'true' }))).toBe(false)
  })

  it('navegação recebe só o conteúdo e o título, com Vary', async () => {
    const res = await get('/', boost)
    expect(await res.text()).toBe(`<title>Início</title><div id="${OUTLET_ID}"><main>oi</main></div>`)
    expect(res.headers.get('vary')).toBe('HX-Request, HX-Target')
  })

  it('primeira visita e boost sem Outlet recebem a página inteira', async () => {
    expect(await (await get('/')).text()).toContain('<nav>menu</nav>')
    expect(await (await get('/', { 'hx-request': 'true', 'hx-boosted': 'true' })).text()).toContain('<nav>menu</nav>')
  })

  it('restauração de histórico recebe a página inteira', async () => {
    expect(await (await get('/', { 'hx-request': 'true', 'hx-history-restore-request': 'true' })).text()).toContain('<nav>menu</nav>')
  })

  it('rota com layout próprio recebe a página inteira', async () => {
    expect(await (await get('/propria', boost)).text()).toContain('<html>')
  })

  it('o cliente e o servidor usam o mesmo id', () => {
    expect(navigationJs).toContain(`getElementById('${OUTLET_ID}')`)
    expect(navigationJs).toContain(`'#${OUTLET_ID}'`)
  })

  it('fora do app, Outlet é só um trecho', async () => {
    expect(await renderToString(() => <Outlet>x</Outlet>)).toBe(`<div id="${OUTLET_ID}">x</div>`)
  })
})

const assets = fileServer(path.join(import.meta.dir, 'nao-existe'), { vendor: true })

function site() {
  const seen: string[] = []
  const Layout = ({ children }: { children?: unknown }) => (
    <html><Head alpine={false} /><body hx-boost="true"><nav id="menu"><a href="/a">A</a> <a href="/b">B</a> <a href="/nada">Nada</a></nav><Outlet>{children as string}</Outlet></body></html>
  )
  const app = defineApp({
    layout: Layout,
    routes: [
      route('/a', { page: () => <main><Title>Página A</Title><h1>Conteúdo A</h1></main> }),
      route('/b', { page: () => <main><Title>Página B</Title><h1>Conteúdo B</h1><button hx-get="/frag" hx-target="#alvo">Carregar</button><div id="alvo"></div></main> }),
      route('/frag', { layout: false, page: () => <b>Fragmento</b> }),
    ],
  })
  return { seen, app }
}

for (const mode of ['servidor', 'estático'] as const) {
  describe.skipIf(!findChrome())(`navegação com Outlet no Chrome real (${mode})`, () => {
    let chrome: App
    const { seen, app } = site()
    beforeAll(async () => {
      chrome = await open(async req => {
        const asset = assets(req)
        if (asset) return asset
        // estático: o host ignora os cabeçalhos e sempre entrega o arquivo inteiro
        const request = mode === 'estático' && !new URL(req.url).pathname.endsWith('/frag') ? new Request(req.url) : req
        const res = await app.respond(request)
        const text = await res.text()
        if (req.headers.get('hx-boosted')) seen.push(text.includes('<html') ? 'inteira' : 'parcial')
        return new Response(text, { status: res.status, headers: { 'content-type': 'text/html' } })
      }, '/a')
      await chrome.evaluate(`(document.getElementById('menu').dataset.mark = 'vivo', window.__mesmaPagina = true)`)
      await new Promise(r => setTimeout(r, 300))
    })
    afterAll(async () => { await chrome?.close() })
    const ev = <T,>(e: string) => chrome.evaluate<T>(e)

    it('troca só o conteúdo: título, URL e layout continuam certos', async () => {
      await chrome.press('text:B')
      await chrome.waitFor('text:Conteúdo B')
      expect(await ev<string>('location.pathname')).toBe('/b')
      await chrome.waitFor('text:Conteúdo B')
      for (let i = 0; i < 50 && (await ev<string>('document.title')) !== 'Página B'; i++) await new Promise(r => setTimeout(r, 20))
      expect(await ev<string>('document.title')).toBe('Página B')
      expect(await ev<boolean>('window.__mesmaPagina')).toBe(true)
      expect(await ev<string>(`document.getElementById('menu').dataset.mark`)).toBe('vivo')
      expect(await ev<number>(`document.querySelectorAll('#${OUTLET_ID}').length`)).toBe(1)
      expect(seen.at(-1)).toBe(mode === 'servidor' ? 'parcial' : 'inteira')
    })

    it('hx-get dentro da página não é afetado', async () => {
      await chrome.press('text:Carregar')
      await chrome.waitFor('text:Fragmento')
      expect(await ev<string>(`document.getElementById('alvo').textContent`)).toBe('Fragmento')
      expect(await ev<string>('location.pathname')).toBe('/b')
    })

    it('voltar restaura a página anterior, com layout e um só Outlet', async () => {
      await ev('history.back()')
      await chrome.waitFor('text:Conteúdo A')
      expect(await ev<string>('location.pathname')).toBe('/a')
      expect(await ev<number>(`document.querySelectorAll('#menu').length`)).toBe(1)
      expect(await ev<number>(`document.querySelectorAll('#${OUTLET_ID}').length`)).toBe(1)
    })

    it('erro cai para a navegação completa, sem tela presa', async () => {
      await chrome.press('text:Nada')
      // a página recarrega de verdade, e a avaliação em andamento se perde: tenta de novo até a condição valer
      let path = ''
      for (let i = 0; i < 200 && path !== '/nada'; i++) {
        path = await ev<string>('location.pathname').catch(() => '')
        await Bun.sleep(10)
      }
      expect(path).toBe('/nada')
      await chrome.waitFor('text:404')
      expect(await ev<unknown>('window.__mesmaPagina')).toBeUndefined()
    })
  })
}

describe('parciais em arquivo no build estático', () => {
  let dir: string
  const build = async (withOutlet: boolean) => {
    const Layout = ({ children }: { children?: unknown }) => (
      <html><Head alpine={false} /><body hx-boost="true"><nav id="menu"><a href="/a">A</a> <a href="/b?x=1">B</a> <a href="/quebrada">Quebrada</a></nav>{withOutlet ? <Outlet>{children as string}</Outlet> : children as string}</body></html>
    )
    const app = defineApp({
      prerender: true,
      layout: Layout,
      routes: [
        route('/a', { page: () => <main><Title>Página A</Title><h1>Conteúdo A</h1></main> }),
        route('/b', { page: () => <main><Title>Página B</Title><h1>Conteúdo B</h1></main> }),
        route('/quebrada', { page: () => <main><Title>Quebrada</Title><h1>Página completa</h1></main> }),
      ],
    })
    return buildStatic(app, { root: dir, outDir: withOutlet ? 'com' : 'sem', vendor: true, fallback: false })
  }
  beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), 'htsx-partials-')) })
  afterAll(() => rm(dir, { recursive: true, force: true }))
  const read = (f: string) => Bun.file(path.join(dir, f)).text()

  it('gera o parcial só com o conteúdo e o título', async () => {
    const { files } = await build(true)
    expect(files).toContain(`${PARTIALS_PATH}/a`)
    expect(await read('com/_htsx/partial/a.html')).toBe(`<title>Página A</title><div id="${OUTLET_ID}"><main><h1>Conteúdo A</h1></main></div>`)
  })

  it('a página completa avisa onde estão os parciais', async () => {
    const html = await read('com/a.html')
    expect(html).toContain(`<meta name="htsx-partials" content="${PARTIALS_PATH}">`)
    expect(html).not.toContain('htsx-meta')
  })

  it('sem Outlet, nenhum parcial', async () => {
    const { files } = await build(false)
    expect(files.filter(f => f.startsWith(PARTIALS_PATH))).toEqual([])
    expect(await read('sem/a.html')).not.toContain('htsx-partials')
  })

  describe.skipIf(!findChrome())('no Chrome real', () => {
    let chrome: App
    const requests: string[] = []
    beforeAll(async () => {
      await build(true)
      await rm(path.join(dir, 'com/_htsx/partial/quebrada.html'))
      const files = fileServer(path.join(dir, 'com'), { html: true })
      chrome = await open(req => {
        requests.push(new URL(req.url).pathname + new URL(req.url).search)
        return files(req) ?? new Response('nao existe', { status: 404 })
      }, '/a')
    })
    afterAll(async () => { await chrome?.close() })
    const ev = <T,>(e: string) => chrome.evaluate<T>(e)

    it('baixa só o parcial; a URL, o título e o resto da página ficam certos', async () => {
      await ev(`(window.__same = document.getElementById('menu'), window.__head = document.head)`).catch(() => {})
      requests.length = 0
      await chrome.press('text:B')
      await chrome.waitFor('text:Conteúdo B')
      for (let i = 0; i < 100 && (await ev<string>('document.title')) !== 'Página B'; i++) await Bun.sleep(10)
      // o pré-carregamento pode pedir o mesmo parcial; a página inteira, nunca
      expect([...new Set(requests.filter(r => !r.startsWith('/_htsx/vendor') && r !== '/favicon.ico'))]).toEqual([`${PARTIALS_PATH}/b?x=1`])
      expect(await ev<string>('location.pathname + location.search')).toBe('/b?x=1')
      expect(await ev<string>('document.title')).toBe('Página B')
      expect(await ev<boolean>(`window.__same === document.getElementById('menu') && window.__head === document.head`)).toBe(true)
    })

    it('voltar traz a página anterior pela URL real', async () => {
      requests.length = 0
      await ev('history.back()')
      await chrome.waitFor('text:Conteúdo A')
      expect(await ev<string>('location.pathname')).toBe('/a')
      expect(requests).toContain('/a')
    })

    it('parcial que falta cai para a navegação completa na URL real', async () => {
      await chrome.press('text:Quebrada')
      let path = ''
      for (let i = 0; i < 300 && path !== '/quebrada'; i++) {
        path = await ev<string>('location.pathname').catch(() => '')
        await Bun.sleep(10)
      }
      expect(path).toBe('/quebrada')
      await chrome.waitFor('text:Página completa')
    })
  })
})

it('só a navegação anima: hx-get dentro da página não vira transição da página inteira', () => {
  expect(DEFAULT_HTMX_CONFIG).not.toHaveProperty('globalViewTransitions')
  expect(navigationJs).toContain('transition:true')
})
