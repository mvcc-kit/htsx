import { describe, expect, it } from 'bun:test'
import { renderToString, raw, storeInit, alpinePlugin, head } from '../index'
import { jsx } from '../src/jsx-runtime'
import { flash } from '../src/flash'

const h = jsx

describe('XSS: texto interpolado', () => {
  it('escapa <script> em conteúdo de texto', async () => {
    const html = await renderToString(() => h('div', {}, '<script>alert(1)</script>'))
    expect(html).toBe('<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>')
  })

  it('escapa & em conteúdo de texto', async () => {
    const html = await renderToString(() => h('div', {}, 'a & b'))
    expect(html).toBe('<div>a &amp; b</div>')
  })

  it('escapa " em valor de atributo', async () => {
    const html = await renderToString(() => h('a', { title: '"click me"' }, 'x'))
    expect(html).toContain('&quot;click me&quot;')
  })

  it('atributo com onclick injetado via valor não escapa mas attr é bloqueado', async () => {
    const html = await renderToString(() => h('div', { onclick: 'alert(1)' }))
    expect(html).not.toContain('onclick')
    expect(html).toBe('<div></div>')
  })
})

describe('XSS: script breakout via JSON (storeInit)', () => {
  it('escapa </script> no dado', () => {
    const out = storeInit('user', { bio: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('</script><script>')
    expect(out).toContain('\\u003c/script')
  })

  it('escapa U+2028 no dado', () => {
    const ls = '\u2028'
    const out = storeInit('msg', { text: `line1${ls}line2` })
    expect(out).not.toContain(ls)
    expect(out).toContain('\\u2028')
  })

  it('escapa U+2029 no dado', () => {
    const ps = '\u2029'
    const out = storeInit('msg', { text: `p1${ps}p2` })
    expect(out).not.toContain(ps)
    expect(out).toContain('\\u2029')
  })

  it('rejeita store name com hífen (injeção JS)', () => {
    expect(() => storeInit('bad-name; alert(1);//', {})).toThrow()
  })

  it('rejeita store name com apóstrofo', () => {
    expect(() => storeInit("name'); alert(1); //", {})).toThrow()
  })
})

describe('XSS: aspas em JSON dentro de atributo (hx-headers)', () => {
  it('apóstrofo no valor → &#39; para não quebrar atributo', async () => {
    const html = await renderToString(() =>
      h('div', { 'hx-headers': { 'X-Token': "ab'cd" } })
    )
    expect(html).toContain('&#39;')
    expect(html).not.toContain("'cd")
  })

  it('hx-vals com </script> no valor → safeJson', async () => {
    const html = await renderToString(() =>
      h('div', { 'hx-vals': { note: '</script>' } })
    )
    expect(html).not.toContain('</script>')
    expect(html).toContain('\\u003c')
  })
})

describe('XSS: injeção via spread de atributos', () => {
  it('onclick bloqueado', async () => {
    const evil = { onclick: 'alert(1)' }
    const html = await renderToString(() => h('div', { ...evil }))
    expect(html).not.toContain('onclick')
    expect(html).toBe('<div></div>')
  })

  it('onload bloqueado', async () => {
    const html = await renderToString(() => h('div', { onload: 'alert(1)' }))
    expect(html).not.toContain('onload')
  })

  it('onerror bloqueado', async () => {
    const html = await renderToString(() => h('img', { src: 'x', onerror: 'alert(1)' }))
    expect(html).not.toContain('onerror')
  })

  it('x-on:click permitido (não confundir com on*)', async () => {
    const html = await renderToString(() => h('div', { $click: 'ok()' }))
    expect(html).toContain('x-on:click="ok()"')
  })

  it('nome de atributo com espaço descartado', async () => {
    const evil = { 'bad attr': '1' }
    const html = await renderToString(() => h('div', { ...evil }))
    expect(html).not.toContain('bad attr')
  })

  it('nome com > descartado', async () => {
    const evil = { '"><img src=x onerror=alert(1)>': '1' }
    const html = await renderToString(() => h('div', { ...evil }))
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
  })
})

describe('XSS: HtmlSafeString vs string literal', () => {
  it('jsx() output não sofre double-escape', async () => {
    const html = await renderToString(() => h('div', {}, h('span', {}, 'x')))
    expect(html).toBe('<div><span>x</span></div>')
    expect(html).not.toContain('&lt;span&gt;')
  })

  it('string literal de variável é escapada', async () => {
    const user = '<script>alert(1)</script>'
    const html = await renderToString(() => h('div', {}, user))
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('raw() preserva HTML sem escape', async () => {
    const html = await renderToString(() => h('div', {}, raw('<b>ok</b>')))
    expect(html).toBe('<div><b>ok</b></div>')
  })
})

describe('CSS injection via style object', () => {
  it('< e > no valor CSS são removidos', async () => {
    const html = await renderToString(() =>
      h('div', { style: { color: 'red</style><script>alert(1)' } })
    )
    expect(html).not.toContain('</style>')
    expect(html).not.toContain('<script')
  })

  it('aspas duplas no valor CSS não quebram o atributo HTML', async () => {
    // XSS: color: red" onmouseover="alert(1) → deve virar &quot;
    const html = await renderToString(() =>
      h('div', { style: { color: 'red" onmouseover="alert(1)' } })
    )
    // The " is escaped so it cannot break out of the style attribute
    expect(html).not.toContain('" onmouseover=')
    expect(html).toContain('&quot;')
  })

  it('chave CSS inválida com aspas é descartada', async () => {
    // CSS key injection: { 'color" bad': 'red' } → chave inválida, descartada
    const html = await renderToString(() =>
      h('div', { style: { 'color" bad': 'red' } as Record<string, string> })
    )
    expect(html).not.toContain('" bad')
    expect(html).not.toContain('onmouseover')
  })

  it('chave CSS válida camelCase renderiza corretamente', async () => {
    const html = await renderToString(() =>
      h('div', { style: { backgroundColor: '#fff', fontSize: '14px' } })
    )
    expect(html).toContain('background-color: #fff')
    expect(html).toContain('font-size: 14px')
  })
})

describe('safeUrl: bloqueio de esquemas perigosos', () => {
  it('javascript: bloqueado', async () => {
    const html = await renderToString(() => h('a', { href: 'javascript:alert(1)' }, 'x'))
    expect(html).toContain('href="#"')
    expect(html).not.toContain('javascript:')
  })

  it('data: bloqueado', async () => {
    const html = await renderToString(() =>
      h('a', { href: 'data:text/html,<script>alert(1)</script>' }, 'x')
    )
    expect(html).toContain('href="#"')
    expect(html).not.toContain('data:')
  })

  it('blob: bloqueado', async () => {
    const html = await renderToString(() =>
      h('a', { href: 'blob:https://example.com/uuid' }, 'x')
    )
    expect(html).toContain('href="#"')
  })

  it('javascript: com zero-width space bloqueado', async () => {
    const zwsp = '​'
    const html = await renderToString(() =>
      h('a', { href: `java${zwsp}script:alert(1)` }, 'x')
    )
    expect(html).toContain('href="#"')
    expect(html).not.toContain('alert')
  })

  it('https:// permitido', async () => {
    const html = await renderToString(() =>
      h('a', { href: 'https://example.com' }, 'x')
    )
    expect(html).toContain('href="https://example.com"')
  })

  it('src também é sanitizado', async () => {
    const html = await renderToString(() =>
      h('img', { src: 'javascript:alert(1)' })
    )
    expect(html).not.toContain('javascript:')
    expect(html).toContain('src="#"')
  })
})

describe('alpinePlugin: </script> injection', () => {
  it('</script> no code não termina a tag prematuramente', () => {
    const out = alpinePlugin('var x = "</script><script>alert(1)//"')
    expect(out).not.toContain('</script><script>')
    expect(out).toContain('<\\/script')
  })

  it('maiúsculas no </SCRIPT> também são sanitizadas', () => {
    const out = alpinePlugin('x = "</SCRIPT><script>evil()"')
    expect(out).not.toContain('</SCRIPT>')
    expect(out).toContain('<\\/SCRIPT')
  })
})

describe('flash.readCookie: sem RegExp injection', () => {
  it('name com metacaracteres regex não quebra a leitura', () => {
    const headers = new Headers({ cookie: '_flash=ok' })
    // Nome com metacaracteres que quebrariam um RegExp
    const result = flash.readCookie(headers, '(a+)+')
    expect(result).toBeNull() // Não encontra o cookie _flash com esse nome
  })

  it('lê cookie correto por igualdade exata', () => {
    const headers = new Headers({ cookie: 'other=x; _flash=token123' })
    expect(flash.readCookie(headers, '_flash')).toBe('token123')
  })
})

describe('flash.setCookie: validação de nome de cookie', () => {
  it('throw em nome com \\r\\n (header injection)', () => {
    expect(() =>
      flash.setCookie('val', { name: '_flash\r\nX-Evil: injected' })
    ).toThrow(/invalid cookie name/)
  })

  it('throw em nome com espaço', () => {
    expect(() => flash.setCookie('val', { name: 'bad name' })).toThrow(/invalid cookie name/)
  })

  it('nome válido não lança', () => {
    expect(() => flash.setCookie('val', { name: '_flash' })).not.toThrow()
    expect(() => flash.setCookie('val', { name: 'my-cookie' })).not.toThrow()
  })
})

describe('nonce em helpers — escape correto', () => {
  it('storeInit escapa nonce malicioso', () => {
    const out = storeInit('x', {}, { nonce: 'a"><script>alert(1)</script>' })
    expect(out).not.toContain('"><script>')
    expect(out).toContain('&quot;')
  })

  it('alpinePlugin escapa nonce malicioso', () => {
    const out = alpinePlugin('Alpine.directive(...)', { nonce: '"><x' })
    // nonce deve ser escapado — não pode conter aspas ou > literais
    expect(out).not.toContain('""><x')
    expect(out).not.toContain('"><x')
    expect(out).toContain('&quot;')
  })

  it('head() escapa nonce em todos os scripts', () => {
    const out = head({ alpine: true, htmx: true, nonce: 'a"x' })
    expect(out).not.toContain('a"x')
    expect(out).toContain('a&quot;x')
  })
})

describe('hx-vals — formato correto no HTML', () => {
  it('hx-vals com objeto usa aspas simples no atributo e aspas duplas no JSON', async () => {
    const html = await renderToString(() =>
      h('form', { 'hx-vals': { user: 'ana' } })
    )
    expect(html).toContain(`hx-vals='{"user":"ana"}'`)
  })
})
