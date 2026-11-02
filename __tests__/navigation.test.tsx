// Navegação fluida: o que sai no HTML, com ou sem defineApp, e o comportamento no Chrome real com CSP estrita.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { head, Navigation, NAVIGATION_FILES, navigationCss, navigationJs, renderPage, renderToString, VENDOR_PATH } from '../index'
import { defineApp, route } from '../app'
import { buildStatic } from '../adapter-static'
import { copyVendor, fileServer } from '../src/build/files'
import { NAVIGATION_SHA256 } from '../src/vendor-path'
import { findChrome, open, type App } from '../testing'

describe('Navigation no HTML', () => {
  it('sem base sai embutido, com nonce', async () => {
    const html = await renderToString(() => <Navigation nonce="n" />)
    expect(html).toContain(`<style nonce="n">${navigationCss}</style>`)
    expect(html).toContain('<script nonce="n">')
    expect(html).not.toContain('htmx-config')
  })

  it('com base sai em arquivos, para CSP sem unsafe-inline', async () => {
    const html = await renderToString(() => <Navigation base="/x/" />)
    expect(html).toBe('<link rel="stylesheet" href="/x/htsx-nav.css"><script defer src="/x/htsx-nav.js"></script>')
  })

  it('head(): só com o pedido; vendor vira base; htmx ganha a mesma transição', () => {
    expect(head({ title: 'a' })).not.toContain('htsx-nav')
    const h = head({ navigation: true, htmx: true, vendor: '/v/' })
    expect(h).toContain('href="/v/htsx-nav.css"')
    expect(h).toContain(`<meta name="htmx-config" content='{"globalViewTransitions":true}'>`)
    expect(h.indexOf('htmx-config')).toBeLessThan(h.indexOf('htmx.min.js'))
  })

  it('transição respeita quem pede menos movimento', () => {
    expect(navigationCss).toContain('@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}}')
    expect(navigationCss).toContain('prefers-reduced-motion:reduce')
  })

  it('o hash do caminho acompanha o conteúdo, para o cache immutable não ficar velho', () => {
    expect(new Bun.CryptoHasher('sha256').update(navigationCss + navigationJs).digest('hex')).toBe(NAVIGATION_SHA256)
  })
})

describe('Navigation nos arquivos', () => {
  let dir: string
  beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), 'htsx-nav-')) })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it("copyVendor: 'navigation' copia só a navegação; false, nada", async () => {
    expect(await copyVendor(dir, 'navigation')).toEqual([`${VENDOR_PATH}htsx-nav.css`, `${VENDOR_PATH}htsx-nav.js`])
    expect(await copyVendor(dir, false)).toEqual([])
    expect(await Bun.file(path.join(dir, VENDOR_PATH, 'htsx-nav.js')).text()).toBe(NAVIGATION_FILES['htsx-nav.js'])
  })

  it('fileServer serve com tipo certo e cache immutable', async () => {
    const res = fileServer(dir, { vendor: true })(`http://x${VENDOR_PATH}htsx-nav.css`)!
    expect(res.headers.get('content-type')).toContain('text/css')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(await res.text()).toBe(navigationCss)
    expect(fileServer(dir, { vendor: true })(`http://x${VENDOR_PATH}toString`)).toBeNull()
  })

  it('buildStatic com página sem layout: doctype e arquivos no lugar', async () => {
    const out = path.join(dir, 'site')
    const app = defineApp({
      prerender: true,
      routes: [route('/', { page: () => <html><head><Navigation base={VENDOR_PATH} /></head><body>oi</body></html> })],
    })
    await buildStatic(app, { root: dir, outDir: 'site', vendor: 'navigation', fallback: false })
    expect(await Bun.file(path.join(out, 'index.html')).text()).toStartWith('<!DOCTYPE html><html>')
    expect(await Bun.file(path.join(out, VENDOR_PATH, 'htsx-nav.css')).exists()).toBe(true)
    expect(await Bun.file(path.join(out, VENDOR_PATH, 'alpine.min.js')).exists()).toBe(false)
  })

  it('sem layout, fragmento continua sem doctype', async () => {
    const app = defineApp({ routes: [route('/', { page: () => <b>oi</b> })] })
    expect(await (await app.respond(new Request('http://x/'))).text()).toBe('<b>oi</b>')
  })
})

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'"

async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url)
  const asset = fileServer('/nonexistent', { vendor: true })(req)
  if (asset) return asset
  const links = (
    <>
      <a id="b" href="/b">B</a>
      <a id="c" href="/c" data-no-prefetch>C</a>
      <a id="fora" href="https://example.com/">fora</a>
    </>
  )
  const html = await renderPage(() => (
    <html>
      <head><title>{pathname}</title><Navigation base={VENDOR_PATH} /></head>
      <body><h1 data-testid="p">{pathname}</h1>{links}</body>
    </html>
  ))
  return new Response(html, { headers: { 'content-type': 'text/html', 'content-security-policy': CSP } })
}

describe.skipIf(!findChrome())('Navigation no Chrome real, com CSP estrita', () => {
  let app: App
  beforeAll(async () => { app = await open(handler, '/a') })
  afterAll(async () => { await app?.close() })

  const prefetched = () => app.evaluate<string[]>(`[...document.querySelectorAll('link[rel=prefetch]')].map(l => new URL(l.href).pathname)`)
  const focus = (id: string) => app.evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`)

  it('sai do modo de compatibilidade', async () => {
    expect(await app.evaluate<string>('document.compatMode')).toBe('CSS1Compat')
  })

  it('a regra de transição está ativa com o CSS em arquivo', async () => {
    const found = await app.evaluate<boolean>(`[...document.styleSheets].some(s => [...s.cssRules].some(r => r.cssText.includes('view-transition')))`)
    expect(found).toBe(true)
  })

  it('focar o link pré-carrega; opt-out e outra origem ficam de fora; sem repetir', async () => {
    await focus('c')
    await focus('fora')
    expect(await prefetched()).toEqual([])
    await focus('b')
    await focus('b')
    expect(await prefetched()).toEqual(['/b'])
  })

  it('o clique continua sendo navegação real', async () => {
    await app.press('id:b')
    await app.waitFor('text:/b')
    expect(await app.evaluate<string>('location.pathname')).toBe('/b')
  })
})
