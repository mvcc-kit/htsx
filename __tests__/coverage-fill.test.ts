/**
 * Testes pra fechar buracos de coverage identificados pelo --coverage.
 *
 * Alvos:
 *   - index.ts:91-99 — defineComponent / defineLayout
 *   - head.ts:58-66 — script object branch (defer/async/type/nonce)
 *   - flash.ts:111,156-157 — setCookie domain + readCookie domain branches
 */
import { describe, expect, it } from 'bun:test'
import { defineComponent, defineLayout, renderToString } from '../index'
import { head } from '../src/head'
import { flash } from '../src/flash'
import { jsx, createElement } from '../src/jsx-runtime'

const h = createElement

describe('coverage: defineComponent / defineLayout', () => {
  it('defineComponent retorna a função inalterada', async () => {
    const Greet = defineComponent<{ name: string }>(({ name }) =>
      h('span', {}, `Hi ${name}`),
    )
    const html = await renderToString(() =>
      h(Greet as never, { name: 'Ana' }),
    )
    expect(html).toBe('<span>Hi Ana</span>')
  })

  it('defineLayout aceita children opcionais', async () => {
    const Layout = defineLayout(({ children }) =>
      h('html', {}, h('body', {}, children)),
    )
    const html = await renderToString(() =>
      h(Layout as never, { children: 'content' }),
    )
    expect(html).toBe('<html><body>content</body></html>')
  })
})

describe('coverage: head() script object', () => {
  it('script com src + defer', () => {
    const out = head({ scripts: [{ src: '/x.js', defer: true }] })
    expect(out).toContain('<script src="/x.js" defer></script>')
  })

  it('script com async', () => {
    const out = head({ scripts: [{ src: '/y.js', async: true }] })
    expect(out).toContain('<script src="/y.js" async></script>')
  })

  it('script com type module', () => {
    const out = head({ scripts: [{ src: '/z.js', type: 'module' }] })
    expect(out).toContain('<script src="/z.js" type="module"></script>')
  })

  it('script com nonce + defer + async + type juntos', () => {
    const out = head({
      nonce: 'abc',
      scripts: [{ src: '/all.js', defer: true, async: true, type: 'module' }],
    })
    expect(out).toContain('<script src="/all.js" defer async type="module" nonce="abc"></script>')
  })

  it('script de outro domínio com integrity sai com crossorigin anonymous', () => {
    const out = head({ scripts: [{ src: 'https://cdn.x.dev/a.js', integrity: 'sha384-abc' }] })
    expect(out).toContain('<script src="https://cdn.x.dev/a.js" integrity="sha384-abc" crossorigin="anonymous"></script>')
  })

  it('crossorigin explícito vale, com ou sem integrity', () => {
    expect(head({ scripts: [{ src: '/b.js', integrity: 'sha256-x', crossorigin: 'use-credentials' }] }))
      .toContain('<script src="/b.js" integrity="sha256-x" crossorigin="use-credentials"></script>')
    expect(head({ scripts: [{ src: '/c.js', crossorigin: 'anonymous' }] }))
      .toContain('<script src="/c.js" crossorigin="anonymous"></script>')
  })

  it('integrity com aspas é escapado', () => {
    const out = head({ scripts: [{ src: '/d.js', integrity: 'sha256-"><script>' }] })
    expect(out).not.toContain('"><script>')
    expect(out).toContain('integrity="sha256-&quot;&gt;&lt;script&gt;"')
  })

  it('styles aceita string e objeto com integrity', () => {
    const out = head({ styles: ['/a.css', { href: 'https://cdn.x.dev/b.css', integrity: 'sha384-def' }] })
    expect(out).toContain('<link rel="stylesheet" href="/a.css">')
    expect(out).toContain('<link rel="stylesheet" href="https://cdn.x.dev/b.css" integrity="sha384-def" crossorigin="anonymous">')
  })

  it('múltiplos scripts mixados (string + object)', () => {
    const out = head({
      scripts: ['/simple.js', { src: '/complex.js', defer: true }],
    })
    expect(out).toContain('<script src="/simple.js"></script>')
    expect(out).toContain('<script src="/complex.js" defer></script>')
  })
})

describe('coverage: flash setCookie/clearCookie domain', () => {
  it('setCookie com domain aparece', () => {
    const c = flash.setCookie('v', { domain: 'example.com' })
    expect(c).toContain('Domain=example.com')
  })

  it('clearCookie com domain aparece', () => {
    const c = flash.clearCookie({ domain: 'example.com' })
    expect(c).toContain('Domain=example.com')
  })

  it('clearCookie sem domain', () => {
    const c = flash.clearCookie()
    expect(c).not.toContain('Domain=')
  })

  it('clearCookie com path customizado', () => {
    const c = flash.clearCookie({ path: '/app' })
    expect(c).toContain('Path=/app')
  })

  it('clearCookie com name customizado', () => {
    const c = flash.clearCookie({ name: 'custom_flash' })
    expect(c).toContain('custom_flash=')
  })
})

describe('coverage: flash.readCookie edge cases', () => {
  it('readCookie aceita Request', () => {
    const r = new Request('http://x', {
      headers: { cookie: '_flash=token123' },
    })
    expect(flash.readCookie(r)).toBe('token123')
  })

  it('readCookie retorna null se source sem headers válidos', () => {
    expect(flash.readCookie({ headers: null } as never)).toBeNull()
  })

  it('readCookie retorna null se cookie só tem outros', () => {
    const h = new Headers({ cookie: 'session=abc; other=xyz' })
    expect(flash.readCookie(h)).toBeNull()
  })

  it('readCookie decodifica URL-encoded value', () => {
    const h = new Headers({ cookie: '_flash=' + encodeURIComponent('a b/c=d') })
    expect(flash.readCookie(h)).toBe('a b/c=d')
  })
})

