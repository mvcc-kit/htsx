import { describe, expect, it } from 'bun:test'
import { escapeHtml, escapeAttr, safeJson, attrJson, cssValue, isUnsafeEventHandler, VALID_ATTR_NAME } from '../src/escape'

describe('escapeHtml', () => {
  it('escapa &', () => expect(escapeHtml('a & b')).toBe('a &amp; b'))
  it('escapa <', () => expect(escapeHtml('<div>')).toBe('&lt;div&gt;'))
  it('escapa >', () => expect(escapeHtml('a > b')).toBe('a &gt; b'))
  it('escapa "', () => expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;'))
  it('escapa \'', () => expect(escapeHtml("it's")).toBe('it&#39;s'))
  it('escapa todos juntos', () =>
    expect(escapeHtml('<a href="x&y">it\'s</a>')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;it&#39;s&lt;/a&gt;'))
  it('string sem especiais retorna igual', () => expect(escapeHtml('hello world')).toBe('hello world'))
  it('string vazia retorna vazia', () => expect(escapeHtml('')).toBe(''))
})

describe('escapeAttr', () => {
  it('escapa &, <, >, "', () => {
    expect(escapeAttr('a & b')).toBe('a &amp; b')
    expect(escapeAttr('<val>')).toBe('&lt;val&gt;')
    expect(escapeAttr('"val"')).toBe('&quot;val&quot;')
  })
  it('NÃO escapa apóstrofo (aspas duplas envolvem o attr)', () =>
    expect(escapeAttr("it's")).toBe("it's"))
})

describe('safeJson', () => {
  it('serializa objeto simples', () => {
    const out = safeJson({ name: 'João' })
    expect(out).toContain('"name"')
    expect(out).toContain('"João"')
  })
  it('escapa < para prevenir script breakout', () => {
    const out = safeJson({ bio: '</script>' })
    expect(out).not.toContain('</script>')
    expect(out).toContain('\\u003c/script\\u003e')
  })
  it('escapa > simetricamente', () => {
    const out = safeJson({ v: '<>' })
    expect(out).toContain('\\u003c')
    expect(out).toContain('\\u003e')
  })
  it('escapa & para prevenir entity smuggling', () => {
    const out = safeJson({ v: 'a&b' })
    expect(out).toContain('\\u0026')
  })
  it('escapa U+2028 (line separator)', () => {
    const ls = ' '
    const out = safeJson({ v: `line1${ls}line2` })
    expect(out).toContain('\\u2028')
    expect(out).not.toContain(ls)
  })
  it('escapa U+2029 (paragraph separator)', () => {
    const ps = ' '
    const out = safeJson({ v: `p1${ps}p2` })
    expect(out).toContain('\\u2029')
    expect(out).not.toContain(ps)
  })
  it('serializa arrays', () => {
    expect(safeJson([1, 2, 3])).toBe('[1,2,3]')
  })
  it('serializa null', () => {
    expect(safeJson(null)).toBe('null')
  })
  it('serializa boolean', () => {
    expect(safeJson(true)).toBe('true')
    expect(safeJson(false)).toBe('false')
  })
})

describe('attrJson', () => {
  it('escapa apóstrofo para &#39;', () => {
    const out = attrJson({ token: "ab'cd" })
    expect(out).toContain('&#39;')
    expect(out).not.toContain("'cd")
  })
  it('mantém estrutura JSON', () => {
    const out = attrJson({ page: 1, filter: 'active' })
    expect(out).toContain('"page"')
    expect(out).toContain('"filter"')
  })
})

describe('cssValue', () => {
  it('retorna string de número', () => expect(cssValue(10)).toBe('10'))
  it('retorna string igual para valores normais', () => expect(cssValue('red')).toBe('red'))
  it('remove < do valor CSS', () => {
    expect(cssValue('red</style>')).not.toContain('<')
  })
  it('remove > do valor CSS', () => {
    expect(cssValue('red>blue')).not.toContain('>')
  })
})

describe('VALID_ATTR_NAME', () => {
  it('aceita nomes válidos', () => {
    expect(VALID_ATTR_NAME.test('class')).toBe(true)
    expect(VALID_ATTR_NAME.test('data-foo')).toBe(true)
    expect(VALID_ATTR_NAME.test('x-bind-class')).toBe(true)
    expect(VALID_ATTR_NAME.test('hx-get')).toBe(true)
    expect(VALID_ATTR_NAME.test('$click')).toBe(true)
    expect(VALID_ATTR_NAME.test('aria-label')).toBe(true)
  })
  it('rejeita espaços', () => {
    expect(VALID_ATTR_NAME.test('bad name')).toBe(false)
  })
  it('rejeita aspas', () => {
    expect(VALID_ATTR_NAME.test('a"b')).toBe(false)
    expect(VALID_ATTR_NAME.test("a'b")).toBe(false)
  })
})

describe('isUnsafeEventHandler', () => {
  it('bloqueia onclick', () => expect(isUnsafeEventHandler('onclick')).toBe(true))
  it('bloqueia onload', () => expect(isUnsafeEventHandler('onload')).toBe(true))
  it('bloqueia onerror', () => expect(isUnsafeEventHandler('onerror')).toBe(true))
  it('bloqueia onmouseover', () => expect(isUnsafeEventHandler('onmouseover')).toBe(true))
  it('bloqueia case-insensitive', () => expect(isUnsafeEventHandler('onClick')).toBe(true))
  it('NÃO bloqueia x-on:click', () => expect(isUnsafeEventHandler('x-on:click')).toBe(false))
  it('NÃO bloqueia hx-on::after-swap', () => expect(isUnsafeEventHandler('hx-on::after-swap')).toBe(false))
  it('NÃO bloqueia class, id, etc', () => {
    expect(isUnsafeEventHandler('class')).toBe(false)
    expect(isUnsafeEventHandler('id')).toBe(false)
    expect(isUnsafeEventHandler('data-foo')).toBe(false)
  })
})
