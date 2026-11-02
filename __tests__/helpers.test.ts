import { describe, expect, it } from 'bun:test'
import { clx, storeInit, alpinePlugin, safeUrl, htmxResponse, head } from '../index'
import { jsx } from '../src/jsx-runtime'

const h = jsx

describe('clx()', () => {
  it('junta múltiplas classes', () =>
    expect(clx('a', 'b', 'c')).toBe('a b c'))
  it('filtra false', () =>
    expect(clx('a', false, 'b')).toBe('a b'))
  it('filtra null', () =>
    expect(clx('a', null, 'b')).toBe('a b'))
  it('filtra undefined', () =>
    expect(clx('a', undefined, 'b')).toBe('a b'))
  it('filtra string vazia', () =>
    expect(clx('a', '', 'b')).toBe('a b'))
  it('expressão condicional inline (true)', () => {
    const isActive = true
    expect(clx('btn', isActive && 'btn-active')).toBe('btn btn-active')
  })
  it('expressão condicional inline (false)', () => {
    const isActive = false
    expect(clx('btn', isActive && 'btn-active')).toBe('btn')
  })
  it('sem argumentos → string vazia', () =>
    expect(clx()).toBe(''))
  it('todos falsy → string vazia', () =>
    expect(clx(false, null, undefined, '')).toBe(''))
})

describe('storeInit()', () => {
  it('emite script com Alpine.store', () => {
    const out = storeInit('user', { id: 1, name: 'João' })
    expect(out).toContain('<script>')
    expect(out).toContain("Alpine.store('user'")
    expect(out).toContain('"id":1')
    expect(out).toContain('"name":"João"')
    expect(out).toContain("alpine:init")
  })
  it('serializa arrays corretamente', () => {
    const out = storeInit('items', [{ id: 1 }, { id: 2 }])
    expect(out).toContain('[{')
    expect(out).toContain('"id":1')
  })
  it('serializa null corretamente', () => {
    const out = storeInit('data', null)
    expect(out).toContain('null')
  })
  it('adiciona nonce quando fornecido', () => {
    const out = storeInit('user', {}, { nonce: 'abc123' })
    expect(out).toContain('nonce="abc123"')
  })
  it('sem nonce → sem atributo nonce', () => {
    const out = storeInit('user', {})
    expect(out).not.toContain('nonce=')
  })
  it('rejeita nome inválido com hífen', () => {
    expect(() => storeInit('bad-name', {})).toThrow()
  })
  it('rejeita nome com ponto-e-vírgula (injection)', () => {
    expect(() => storeInit("name'); alert(1); //", {})).toThrow()
  })
  it('aceita nome com $', () => {
    expect(() => storeInit('$store', {})).not.toThrow()
  })
  it('aceita nome com underscore', () => {
    expect(() => storeInit('my_store', {})).not.toThrow()
  })
})

describe('alpinePlugin()', () => {
  it('emite script com alpine:init listener', () => {
    const out = alpinePlugin("Alpine.directive('tooltip', ...)")
    expect(out).toContain('<script>')
    expect(out).toContain("alpine:init")
    expect(out).toContain("Alpine.directive('tooltip', ...)")
  })
  it('adiciona nonce quando fornecido', () => {
    const out = alpinePlugin('code', { nonce: 'abc123' })
    expect(out).toContain('nonce="abc123"')
  })
  it('sem nonce → sem atributo nonce', () => {
    const out = alpinePlugin('code')
    expect(out).not.toContain('nonce=')
  })
})

describe('safeUrl()', () => {
  it('passa URL normal', () =>
    expect(safeUrl('https://example.com')).toBe('https://example.com'))
  it('passa URL relativa', () =>
    expect(safeUrl('/about')).toBe('/about'))
  it('bloqueia javascript:', () =>
    expect(safeUrl('javascript:alert(1)')).toBe('#'))
  it('bloqueia javascript: com espaços', () =>
    expect(safeUrl('  javascript:alert(1)')).toBe('#'))
  it('bloqueia javascript: case-insensitive', () =>
    expect(safeUrl('JAVASCRIPT:alert(1)')).toBe('#'))
  it('bloqueia data:', () =>
    expect(safeUrl('data:text/html,<h1>hi</h1>')).toBe('#'))
  it('bloqueia vbscript:', () =>
    expect(safeUrl('vbscript:msgbox(1)')).toBe('#'))
})

describe('htmxResponse()', () => {
  it('retorna Response com Content-Type text/html', async () => {
    const res = await htmxResponse(() => h('div', {}, 'ok'))
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(await res.text()).toBe('<div>ok</div>')
  })

  it('status default é 200', async () => {
    const res = await htmxResponse(() => h('div', {}))
    expect(res.status).toBe(200)
  })

  it('adiciona HX-Trigger quando trigger é string', async () => {
    const res = await htmxResponse(() => h('div', {}), { trigger: 'itemAdded' })
    expect(res.headers.get('HX-Trigger')).toBe('itemAdded')
  })

  it('adiciona HX-Trigger como JSON quando trigger é objeto', async () => {
    const res = await htmxResponse(() => h('div', {}), { trigger: { evt: { id: 1 } } })
    expect(res.headers.get('HX-Trigger')).toBe('{"evt":{"id":1}}')
  })

  it('adiciona HX-Retarget', async () => {
    const res = await htmxResponse(() => h('div', {}), { retarget: '#list' })
    expect(res.headers.get('HX-Retarget')).toBe('#list')
  })

  it('adiciona HX-Reswap', async () => {
    const res = await htmxResponse(() => h('div', {}), { reswap: 'beforeend' })
    expect(res.headers.get('HX-Reswap')).toBe('beforeend')
  })

  it('adiciona HX-Reselect', async () => {
    const res = await htmxResponse(() => h('div', {}), { reselect: '#items' })
    expect(res.headers.get('HX-Reselect')).toBe('#items')
  })

  it('adiciona HX-Push-Url', async () => {
    const res = await htmxResponse(() => h('div', {}), { pushUrl: '/new-url' })
    expect(res.headers.get('HX-Push-Url')).toBe('/new-url')
  })

  it('adiciona HX-Redirect', async () => {
    const res = await htmxResponse(() => h('div', {}), { redirect: '/dashboard' })
    expect(res.headers.get('HX-Redirect')).toBe('/dashboard')
  })

  it('HX-Refresh quando refresh: true', async () => {
    const res = await htmxResponse(() => h('div', {}), { refresh: true })
    expect(res.headers.get('HX-Refresh')).toBe('true')
  })

  it('status customizado', async () => {
    const res = await htmxResponse(() => h('div', {}), { status: 201 })
    expect(res.status).toBe(201)
  })

  it('funciona com async factory', async () => {
    async function Data() { return h('span', {}, 'data') }
    const res = await htmxResponse(async () => h(Data, {}))
    expect(await res.text()).toBe('<span>data</span>')
  })

  it('não adiciona headers não especificados', async () => {
    const res = await htmxResponse(() => h('div', {}))
    expect(res.headers.get('HX-Trigger')).toBeNull()
    expect(res.headers.get('HX-Retarget')).toBeNull()
  })
})

describe('head()', () => {
  it('gera charset UTF-8 por padrão', () => {
    const h = head({})
    expect(h).toContain('<meta charset="UTF-8">')
  })

  it('gera viewport por padrão', () => {
    const h = head({})
    expect(h).toContain('width=device-width')
  })

  it('charset deve ser o PRIMEIRO elemento', () => {
    const h = head({ title: 'App', charset: 'UTF-8' })
    expect(h.indexOf('<meta charset')).toBeLessThan(h.indexOf('<title'))
  })

  it('gera title quando fornecido', () => {
    const h = head({ title: 'Meu App' })
    expect(h).toContain('<title>Meu App</title>')
  })

  it('escapa title para prevenir XSS', () => {
    const h = head({ title: '<script>alert(1)</script>' })
    expect(h).toContain('&lt;script&gt;')
    expect(h).not.toContain('<script>alert')
  })

  it('gera description quando fornecida', () => {
    const h = head({ description: 'Minha App' })
    expect(h).toContain('name="description"')
    expect(h).toContain('Minha App')
  })

  it('alpine: true → só o core sem plugins', () => {
    const h = head({ alpine: true })
    expect(h).toContain('alpinejs')
    expect(h).not.toContain('@alpinejs/mask')
    expect(h).not.toContain('@alpinejs/persist')
  })

  it('alpine com plugins seletivos → importa só os listados', () => {
    const h = head({ alpine: { plugins: ['mask', 'collapse'] } })
    expect(h).toContain('@alpinejs/mask')
    expect(h).toContain('@alpinejs/collapse')
    expect(h).not.toContain('@alpinejs/persist')
    expect(h).not.toContain('@alpinejs/intersect')
  })

  it('plugins Alpine carregados ANTES do core', () => {
    const h = head({ alpine: { plugins: ['mask'] } })
    expect(h.indexOf('@alpinejs/mask')).toBeLessThan(h.indexOf('alpinejs@'))
  })

  it('htmx: true → inclui htmx CDN', () => {
    const h = head({ htmx: true })
    expect(h).toContain('htmx.org')
  })

  it('nonce aplicado em Alpine e HTMX', () => {
    const h = head({ alpine: true, htmx: true, nonce: 'abc123' })
    const matches = h.match(/nonce="abc123"/g)
    expect(matches?.length).toBeGreaterThanOrEqual(2)
  })

  it('styles gera links rel=stylesheet', () => {
    const h = head({ styles: ['/app.css', '/vendor.css'] })
    expect(h).toContain('<link rel="stylesheet" href="/app.css">')
    expect(h).toContain('<link rel="stylesheet" href="/vendor.css">')
  })

  it('charset customizado', () => {
    const h = head({ charset: 'ISO-8859-1' })
    expect(h).toContain('charset="ISO-8859-1"')
  })

  it('sem opções → gera apenas charset e viewport', () => {
    const h = head({})
    expect(h).toContain('<meta charset=')
    expect(h).toContain('<meta name="viewport"')
    expect(h).not.toContain('<title')
    expect(h).not.toContain('alpine')
    expect(h).not.toContain('htmx')
  })
})
