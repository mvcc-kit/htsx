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

