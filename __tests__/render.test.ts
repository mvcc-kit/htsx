import { describe, expect, it } from 'bun:test'
import { renderPage, renderToString, raw } from '../index'
import { jsx, createElement, jsxs, Fragment } from '../src/jsx-runtime'

// Helpers to write JSX without compiler (call jsx directly)
const h = createElement

describe('renderPage', () => {
  it('adiciona <!DOCTYPE html>', async () => {
    const html = await renderPage(() => h('html', {}, h('body', {}, 'ok')))
    expect(html).toStartWith('<!DOCTYPE html>')
  })

  it('renderiza elemento simples', async () => {
    const html = await renderPage(() => h('div', { class: 'test' }, 'hello'))
    expect(html).toBe('<!DOCTYPE html><div class="test">hello</div>')
  })

  it('renderiza children aninhados', async () => {
    const html = await renderToString(() =>
      h('ul', {}, h('li', {}, 'a'), h('li', {}, 'b'))
    )
    expect(html).toBe('<ul><li>a</li><li>b</li></ul>')
  })
})

describe('renderToString', () => {
  it('NÃO adiciona DOCTYPE', async () => {
    const html = await renderToString(() => h('div', {}, 'ok'))
    expect(html).not.toContain('DOCTYPE')
    expect(html).toBe('<div>ok</div>')
  })

  it('renderiza componente como função', async () => {
    function Badge({ label }: { label: string }) {
      return h('span', { class: 'badge' }, label)
    }
    const html = await renderToString(() => h(Badge, { label: 'Ativo' }))
    expect(html).toBe('<span class="badge">Ativo</span>')
  })
})

describe('void elements', () => {
  it('input não tem closing tag', async () => {
    const html = await renderToString(() => h('input', { type: 'text' }))
    expect(html).toBe('<input type="text">')
    expect(html).not.toContain('</input>')
  })
  it('br não tem closing tag', async () => {
    const html = await renderToString(() => h('br', {}))
    expect(html).toBe('<br>')
  })
  it('img não tem closing tag', async () => {
    const html = await renderToString(() => h('img', { src: '/logo.png', alt: 'logo' }))
    expect(html).toBe('<img src="/logo.png" alt="logo">')
    expect(html).not.toContain('</img>')
  })
  it('hr não tem closing tag', async () => {
    const html = await renderToString(() => h('hr', {}))
    expect(html).toBe('<hr>')
  })
})

describe('Fragment', () => {
  it('não emite wrapper HTML', async () => {
    const html = await renderToString(() =>
      jsx(Fragment, { children: [h('span', {}, 'a'), h('span', {}, 'b')] })
    )
    expect(html).toBe('<span>a</span><span>b</span>')
    expect(html).not.toContain('<Fragment')
  })
})

describe('children edge cases', () => {
  it('false como child → vazio', async () => {
    const html = await renderToString(() => h('div', {}, false))
    expect(html).toBe('<div></div>')
  })
  it('null como child → vazio', async () => {
    const html = await renderToString(() => h('div', {}, null))
    expect(html).toBe('<div></div>')
  })
  it('undefined como child → vazio', async () => {
    const html = await renderToString(() => h('div', {}, undefined))
    expect(html).toBe('<div></div>')
  })
  it('true como child → vazio', async () => {
    const html = await renderToString(() => h('div', {}, true))
    expect(html).toBe('<div></div>')
  })
  it('0 como child → renderiza "0"', async () => {
    const html = await renderToString(() => h('div', {}, 0))
    expect(html).toBe('<div>0</div>')
  })
  it('42 como child → renderiza "42"', async () => {
    const html = await renderToString(() => h('div', {}, 42))
    expect(html).toBe('<div>42</div>')
  })
  it('array de children renderiza em sequência', async () => {
    const html = await renderToString(() =>
      h('ul', {}, ['a', 'b', 'c'].map(x => h('li', { key: x }, x)))
    )
    expect(html).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>')
  })
  it('texto literal é escapado', async () => {
    const user = '<script>alert(1)</script>'
    const html = await renderToString(() => h('div', {}, user))
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('raw() injeta HTML sem escape', async () => {
    const html = await renderToString(() => h('div', {}, raw('<b>bold</b>')))
    expect(html).toBe('<div><b>bold</b></div>')
  })
})

describe('script e style — raw text elements', () => {
  it('<script> não escapa && e >', async () => {
    const html = await renderToString(() => h('script', {}, raw('const x = a && b > 0')))
    expect(html).toBe('<script>const x = a && b > 0</script>')
    expect(html).not.toContain('&amp;&amp;')
    expect(html).not.toContain('&gt;')
  })
  it('<style> não escapa conteúdo CSS', async () => {
    const html = await renderToString(() => h('style', {}, raw('.a > .b { color: red }')))
    expect(html).toBe('<style>.a > .b { color: red }</style>')
  })
  it('elementos normais ainda escapam', async () => {
    const html = await renderToString(() => h('p', {}, '<script>alert(1)</script>'))
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })
})

describe('async components', () => {
  it('componente async resolve corretamente', async () => {
    async function AsyncComp() {
      await Promise.resolve()
      return h('span', {}, 'loaded')
    }
    const html = await renderToString(async () => h(AsyncComp, {}))
    expect(html).toBe('<span>loaded</span>')
  })

  it('múltiplos async components em paralelo', async () => {
    async function A() { await Promise.resolve(); return h('div', {}, 'A') }
    async function B() { await Promise.resolve(); return h('div', {}, 'B') }
    const html = await renderToString(async () =>
      jsx(Fragment, { children: [h(A, {}), h(B, {})] })
    )
    expect(html).toBe('<div>A</div><div>B</div>')
  })

  it('renderPage async retorna Promise<string> com doctype', async () => {
    const html = await renderPage(async () => h('html', {}, h('body', {}, 'ok')))
    expect(html).toStartWith('<!DOCTYPE html>')
  })

  it('componente sync continua funcionando (sem breaking change)', async () => {
    function Sync() { return h('p', {}, 'sync') }
    const html = await renderToString(() => h(Sync, {}))
    expect(html).toBe('<p>sync</p>')
  })

  it('children async em paralelo', async () => {
    const delay = (ms: number) => new Promise<void>(r => Bun.sleep(ms).then(() => r()))
    async function Slow() { await delay(10); return h('span', {}, 'slow') }
    async function Fast() { await delay(1); return h('span', {}, 'fast') }
    const start = Date.now()
    const html = await renderToString(() =>
      h('div', { children: [h(Slow, {}), h(Fast, {})] })
    )
    const elapsed = Date.now() - start
    expect(html).toContain('<span>slow</span>')
    expect(html).toContain('<span>fast</span>')
    // paralelo: deve terminar em menos de 100ms total
    expect(elapsed).toBeLessThan(100)
  })
})

describe('HtmlSafeString — sem double-escape', () => {
  it('jsx() output passa sem escape', async () => {
    const html = await renderToString(() => h('div', {}, h('span', {}, 'x')))
    expect(html).toBe('<div><span>x</span></div>')
    expect(html).not.toContain('&lt;span&gt;')
  })
})
