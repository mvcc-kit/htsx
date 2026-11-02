import { describe, expect, it } from 'bun:test'
import { OOB } from '../src/oob'
import { renderToString } from '../index'
import { jsx, createElement } from '../src/jsx-runtime'

const h = createElement

describe('OOB: HTML output', () => {
  it('target sem # gera HTML correto com outerHTML default', async () => {
    const html = await renderToString(() => OOB({ target: 'counter', children: '42' }))
    expect(html).toBe('<div id="counter" hx-swap-oob="true">42</div>')
  })

  it('target com # é normalizado', async () => {
    const html = await renderToString(() => OOB({ target: '#counter', children: '42' }))
    expect(html).toBe('<div id="counter" hx-swap-oob="true">42</div>')
  })

  it('swap innerHTML gera formato com selector', async () => {
    const html = await renderToString(() => OOB({ target: 'list', swap: 'innerHTML', children: 'x' }))
    expect(html).toBe('<div id="list" hx-swap-oob="innerHTML:#list">x</div>')
  })

  it('swap afterbegin / beforeend', async () => {
    const a = await renderToString(() => OOB({ target: 'l', swap: 'afterbegin', children: 'x' }))
    expect(a).toContain('hx-swap-oob="afterbegin:#l"')
    const b = await renderToString(() => OOB({ target: 'l', swap: 'beforeend', children: 'y' }))
    expect(b).toContain('hx-swap-oob="beforeend:#l"')
  })

  it('tag custom (tr, li, option)', async () => {
    const tr = await renderToString(() => OOB({ target: 'row-1', tag: 'tr', children: h('td', {}, 'cell') }))
    expect(tr).toBe('<tr id="row-1" hx-swap-oob="true"><td>cell</td></tr>')
  })

  it('children null/undefined renderiza vazio', async () => {
    const html = await renderToString(() => OOB({ target: 'x' }))
    expect(html).toBe('<div id="x" hx-swap-oob="true"></div>')
  })

  it('children JSX renderiza aninhado', async () => {
    const html = await renderToString(() =>
      OOB({ target: 'box', children: h('span', { class: 'badge' }, 'NEW') }),
    )
    expect(html).toBe('<div id="box" hx-swap-oob="true"><span class="badge">NEW</span></div>')
  })

  it('swap delete', async () => {
    const html = await renderToString(() => OOB({ target: 'gone', swap: 'delete' }))
    expect(html).toContain('hx-swap-oob="delete:#gone"')
  })
})

describe('OOB: validação de target (segurança)', () => {
  it('throw se target vazio', () => {
    expect(() => OOB({ target: '', children: '' })).toThrow(/inválido/)
  })
  it('throw se target só com #', () => {
    expect(() => OOB({ target: '#', children: '' })).toThrow(/inválido/)
  })
  it('throw se target começa com número', () => {
    expect(() => OOB({ target: '1bad', children: '' })).toThrow(/inválido/)
  })
  it('throw se target tem espaço', () => {
    expect(() => OOB({ target: 'bad name', children: '' })).toThrow(/inválido/)
  })
  it('throw se target tem aspas (injection)', () => {
    expect(() => OOB({ target: 'a"><script>x', children: '' })).toThrow(/inválido/)
  })
  it('throw se target tem >', () => {
    expect(() => OOB({ target: 'a>', children: '' })).toThrow(/inválido/)
  })
  it('throw se target tem path traversal', () => {
    expect(() => OOB({ target: '../etc/passwd', children: '' })).toThrow(/inválido/)
  })
  it('aceita ID válido com -_:.', () => {
    expect(() => OOB({ target: 'a-b_c:1.2', children: 'ok' })).not.toThrow()
  })
})

describe('OOB: integração JSX', () => {
  it('composição com Fragment', async () => {
    const html = await renderToString(() =>
      h('main', {}, [
        h('p', {}, 'principal'),
        OOB({ target: 'badge', children: '5' }),
      ]),
    )
    expect(html).toBe('<main><p>principal</p><div id="badge" hx-swap-oob="true">5</div></main>')
  })
})
