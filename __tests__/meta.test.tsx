// /meta: regras puras, integração com renderPage e defineApp, e o Chrome real.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { head, raw, renderPage, renderToString } from '../index'
import { Alpine, Htmx, Link, Meta, Navigation, Title } from '../meta'
import { defineApp, route } from '../app'
import { applyMeta, dedupeTags, existingTagPattern, linkKey, metaKey, metaMarker, resolveMarkers } from '../src/meta/logic'
import { withoutStrictMode } from './setup'
import { findChrome, open, type App } from '../testing'

const tag = (key: string | null, html: string) => ({ key, html })

describe('regras', () => {
  it('chaves: name, property e canonical são únicos; o resto pode repetir', () => {
    expect(metaKey({ name: 'description' })).toBe('meta:name:description')
    expect(metaKey({ property: 'og:title' })).toBe('meta:property:og:title')
    expect(metaKey({ charset: 'utf-8' })).toBe('meta:charset')
    expect(metaKey({ content: 'x' })).toBeNull()
    expect(linkKey({ rel: 'canonical' })).toBe('link:rel:canonical')
    expect(linkKey({ rel: 'icon' })).toBeNull()
  })

  it('a última vence; sem chave, repete', () => {
    expect(dedupeTags([tag('a', '1'), tag('a', '2'), tag(null, '3'), tag(null, '3')]).map(t => t.html)).toEqual(['2', '3', '3'])
  })

  it('a ordem vem do documento, não da renderização, e as marcas somem', () => {
    const html = `${metaMarker(1)}<b>${metaMarker(0)}</b>`
    const out = resolveMarkers(html, [tag('a', 'renderizou-primeiro'), tag('a', 'renderizou-depois')])
    expect(out.html).toBe('<b></b>')
    expect(out.tags.map(t => t.html)).toEqual(['renderizou-depois', 'renderizou-primeiro'])
    expect(resolveMarkers('x', [tag('a', '1')]).tags).toHaveLength(1)
  })

  it('acha a tag já escrita, inclusive com ":" no valor', () => {
    expect(existingTagPattern('meta:property:og:title')!.test('<meta property="og:title" content="x">')).toBe(true)
    expect(existingTagPattern('meta:name:a.b')!.test('<meta name="aXb">')).toBe(false)
    expect(existingTagPattern('link:rel:canonical')!.test('<link href="/x" rel="canonical">')).toBe(true)
  })

  it('entra antes de </head> e troca o que já existia', () => {
    const { html } = applyMeta('<html><head><title>velho</title><meta name="d" content="v"><meta name="e"></head><body>x</body></html>', [
      tag('title', '<title>novo</title>'), tag('meta:name:d', '<meta name="d" content="n">'),
    ])
    expect(html).toBe('<html><head><meta name="e"><title>novo</title><meta name="d" content="n"></head><body>x</body></html>')
  })

  it('parcial leva só o título; <html> sem <head> avisa o que ficou de fora', () => {
    expect(applyMeta('<b>x</b>', [tag('title', '<title>t</title>'), tag('m', '<meta>')])).toEqual({ html: '<title>t</title><b>x</b>', dropped: [] })
    expect(applyMeta('<html><body></body></html>', [tag('m', '<meta>')]).dropped).toHaveLength(1)
  })
})

describe('renderPage', () => {
  const Child = () => <section><Title>Child</Title><Meta name="description" content={'a"<b'} /><Link rel="canonical" href="https://x.com/" /></section>

  it('leva ao <head> de qualquer ponto, com escape, e o filho vence o pai', async () => {
    const html = await renderPage(() => <html><head><Title>Parent</Title></head><body><Child /></body></html>)
    expect(html).toBe('<!DOCTYPE html><html><head><title>Child</title><meta name="description" content="a&quot;&lt;b"><link rel="canonical" href="https://x.com/"></head><body><section></section></body></html>')
  })

  it('componente que recebe filhos: o filho vence, embora renderize antes', async () => {
    const Parent = ({ children }: { children?: unknown }) => <div><Title>Parent</Title>{children as string}</div>
    const html = await renderPage(() => <html><head></head><body><Parent><Title>Child</Title></Parent></body></html>)
    expect(html).toContain('<title>Child</title>')
    expect(html).not.toContain('Parent')
    expect(html).not.toContain('htsx-meta')
  })

  it('funciona com componente assíncrono', async () => {
    const Slow = async () => { await Promise.resolve(); return <Title>Slow</Title> }
    expect(await renderPage(() => <html><head></head><body><Slow /></body></html>)).toContain('<head><title>Slow</title></head>')
  })

  it('o título escapa conteúdo e não some', async () => {
    expect(await renderPage(() => <html><head><Title>{'<script>'}</Title></head><body></body></html>)).toContain('<title>&lt;script&gt;</title>')
  })

  it('renderizações simultâneas não se misturam', async () => {
    const page = (t: string) => renderPage(async () => { await Promise.resolve(); return <html><head><Title>{t}</Title></head></html> })
    const [a, b] = await Promise.all([page('a'), page('b')])
    expect(a).toContain('<title>a</title>')
    expect(b).toContain('<title>b</title>')
  })

  it('trocam o que head() escreveu', async () => {
    const html = await renderPage(() => <html><head>{raw(head({ title: 'Padrão', description: 'antes' }))}</head><body><Child /></body></html>)
    expect(html).not.toContain('Padrão')
    expect(html).not.toContain('antes')
    expect(html).toContain('<title>Child</title>')
  })

  it('<html> sem <head> é erro no modo estrito', async () => {
    await expect(renderPage(() => <html><body><Meta name="a" /></body></html>)).rejects.toThrow(/sem <head>/)
  })

  describe('fora do modo estrito', () => {
    withoutStrictMode()
    it('continua renderizando', async () => {
      expect(await renderPage(() => <html><body><Meta name="a" /></body></html>)).toContain('<body></body>')
    })
  })

  it('fora de renderPage, sai onde foi escrito', async () => {
    expect(await renderToString(() => <head><Title>x</Title><Htmx vendor="/v/" /></head>)).toBe('<head><title>x</title><script src="/v/htmx.min.js"></script></head>')
  })

  it('Htmx: config antes do script, com nonce', async () => {
    const html = await renderPage(() => <html><head><Htmx vendor="/v/" nonce="n" config={{ timeout: 5 }} /></head></html>)
    expect(html).toContain('<meta name="htmx-config" content="{&quot;timeout&quot;:5}"><script src="/v/htmx.min.js" nonce="n"></script>')
  })

  it('Htmx, Alpine e Navigation: plugins antes do núcleo e sem duplicar', async () => {
    const html = await renderPage(() => (
      <html><head>
        <Htmx vendor="/v/" />
        <Alpine vendor="/v/" plugins={['mask']} />
        <Navigation base="/v/" />
        <Htmx vendor="/outro/" />
      </head></html>
    ))
    expect(html.indexOf('alpine-mask')).toBeLessThan(html.indexOf('alpine.min.js'))
    expect(html).toContain('/v/htsx-nav.css')
    expect(html).not.toContain('/v/htmx.min.js')
    expect(html).toContain('/outro/htmx.min.js')
  })
})

describe('defineApp', () => {
  const Layout = ({ children }: { children?: unknown }) => <html><head><Title>Layout</Title></head><body>{children as string}</body></html>
  const app = defineApp({
    layout: Layout,
    errorPage: ({ status }) => <html><head></head><body><Title>{`Erro ${status}`}</Title></body></html>,
    routes: [
      route('/', { page: () => <main><Title>Página</Title><Meta name="d" /></main> }),
      route('/sem', { page: () => <main>x</main> }),
    ],
  })
  const get = async (p: string, headers: Record<string, string> = {}) => (await app.respond(new Request(`http://x${p}`, { headers }))).text()

  it('a página vence o layout; sem título na página, fica o do layout', async () => {
    expect(await get('/')).toBe('<!DOCTYPE html><html><head><title>Página</title><meta name="d"></head><body><main></main></body></html>')
    expect(await get('/sem')).toContain('<title>Layout</title>')
  })

  it('resposta parcial do htmx leva só o título', async () => {
    expect(await get('/', { 'hx-request': 'true' })).toBe('<title>Página</title><main></main>')
  })

  it('página de erro também', async () => {
    expect(await get('/nada')).toContain('<title>Erro 404</title>')
  })
})

const VENDOR = path.join(import.meta.dir, '..', 'vendor')

describe.skipIf(!findChrome())('/meta no Chrome real', () => {
  let chrome: App
  beforeAll(async () => {
    chrome = await open(async req => {
      const { pathname } = new URL(req.url)
      if (pathname.startsWith('/v/')) return new Response(Bun.file(path.join(VENDOR, path.basename(pathname))), { headers: { 'content-type': 'text/javascript' } })
      if (pathname === '/frag') return new Response(await renderToString(() => <b>Fragmento</b>))
      const html = await renderPage(() => (
        <html><head><Htmx vendor="/v/" config={{ timeout: 1234 }} /><Alpine vendor="/v/" /></head>
          <body>
            <Title>Do corpo</Title>
            <button hx-get="/frag" hx-target="#alvo">Carregar</button>
            <div id="alvo"></div>
            <div x-data="{ n: 7 }"><span id="n" x-text="n"></span></div>
          </body></html>
      ))
      return new Response(html, { headers: { 'content-type': 'text/html' } })
    }, '/')
  })
  afterAll(async () => { await chrome?.close() })

  it('título, config do htmx, htmx e Alpine funcionam', async () => {
    expect(await chrome.evaluate<string>('document.title')).toBe('Do corpo')
    expect(await chrome.evaluate<number>('htmx.config.timeout')).toBe(1234)
    await chrome.waitFor('id:n')
    expect(await chrome.text('id:n')).toBe('7')
    await chrome.press('text:Carregar')
    await chrome.waitFor('text:Fragmento')
  })
})
