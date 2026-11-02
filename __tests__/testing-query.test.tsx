import { describe, expect, it } from 'bun:test'
import { renderPage } from '../index'
import { page } from '../testing'

const html = await renderPage(() => (
  <html>
    <body>
      <h1 class="t">Olá &amp; <b>mundo</b></h1>
      <ul><li>um</li><li>dois <i>2</i></li></ul>
      <a href="/a?x=1&y=2" data-testid="link">Ir</a>
      <div data-testid="caixa"><div data-testid="dentro">A</div> B</div>
      <input data-testid="email" name="email" value={'"x"'} />
    </body>
  </html>
))

describe('testing: page() com HTMLRewriter', () => {
  it('text() devolve o texto do primeiro elemento, com entidades decodificadas', async () => {
    const p = await page(html)
    expect(await p.text('h1')).toBe('Olá & mundo')
    expect(await p.text('li')).toBe('um')
    expect(await p.text('nada')).toBeNull()
  })

  it('find() devolve todos, em ordem', async () => {
    const lis = await (await page(html)).find('ul li')
    expect(lis.map(l => l.text)).toEqual(['um', 'dois 2'])
  })

  it('attr() decodifica o valor', async () => {
    const p = await page(html)
    expect(await p.attr('a', 'href')).toBe('/a?x=1&y=2')
    expect(await p.attr('input', 'value')).toBe('"x"')
    expect(await p.attr('a', 'title')).toBeNull()
  })

  it('byTestId() acha elemento aninhado e void', async () => {
    const p = await page(html)
    expect((await p.byTestId('caixa'))?.text).toBe('A B')
    expect((await p.byTestId('dentro'))?.text).toBe('A')
    expect(await p.byTestId('email')).toEqual({ tag: 'input', attrs: { 'data-testid': 'email', name: 'email', value: '"x"' }, text: '' })
    expect(await p.byTestId('não-existe')).toBeNull()
  })

  it('aceita Response', async () => {
    const p = await page(new Response('<p data-testid="r">ok</p>'))
    expect((await p.byTestId('r'))?.text).toBe('ok')
  })
})
