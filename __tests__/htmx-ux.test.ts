import { describe, expect, it } from 'bun:test'
import { confirmAttrs, Indicator, transitionAttrs, transitionName } from '../src/htmx-ux'
import { renderToString } from '../index'
import { jsx } from '../src/jsx-runtime'

const h = jsx

describe('confirmAttrs', () => {
  it('retorna { hx-confirm }', () => {
    expect(confirmAttrs('certeza?')).toEqual({ 'hx-confirm': 'certeza?' })
  })

  it('spread no botão', async () => {
    const html = await renderToString(() =>
      h('button', { ...confirmAttrs('apagar?'), 'hx-delete': '/x' }, '×'),
    )
    expect(html).toContain('hx-confirm="apagar?"')
    expect(html).toContain('hx-delete="/x"')
  })

  it('escapa quotes em string', async () => {
    const html = await renderToString(() =>
      h('button', { ...confirmAttrs('"apagar?"') }, '×'),
    )
    expect(html).toContain('hx-confirm="&quot;apagar?&quot;"')
  })
})

describe('<Indicator>', () => {
  it('default class htmx-indicator', async () => {
    const html = await renderToString(() => Indicator({}))
    expect(html).toBe('<span class="htmx-indicator">…</span>')
  })

  it('children custom', async () => {
    const html = await renderToString(() =>
      Indicator({ children: h('svg', { class: 'spin' }, 'loading') }),
    )
    expect(html).toContain('<svg class="spin">loading</svg>')
  })

  it('class adicional preserva htmx-indicator', async () => {
    const html = await renderToString(() =>
      Indicator({ class: 'text-blue', children: 'x' }),
    )
    expect(html).toContain('class="htmx-indicator text-blue"')
  })
})

describe('transitionAttrs', () => {
  it('default outerHTML', () => {
    expect(transitionAttrs()).toEqual({ 'hx-swap': 'outerHTML transition:true' })
  })

  it('innerHTML', () => {
    expect(transitionAttrs('innerHTML')).toEqual({ 'hx-swap': 'innerHTML transition:true' })
  })
})

describe('transitionName', () => {
  it('gera style com view-transition-name', () => {
    expect(transitionName('product-1')).toEqual({ style: 'view-transition-name: product-1' })
  })

  it('throw em nome inválido', () => {
    expect(() => transitionName('a b')).toThrow(/inválido/)
    expect(() => transitionName('1bad')).toThrow(/inválido/)
    expect(() => transitionName('a"x')).toThrow(/inválido/)
  })

  it('aceita _ -', () => {
    expect(transitionName('a-b_c')).toBeTruthy()
  })

  it('spread em JSX', async () => {
    const html = await renderToString(() =>
      h('article', { ...transitionName('post-42') }, 'x'),
    )
    expect(html).toContain('style="view-transition-name: post-42"')
  })
})
