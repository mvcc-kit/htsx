import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { defineStore, head, inspector, raw, renderPage } from '../index'
import { findChrome, open, type App } from '../testing'
import { cart } from './fixtures/cart-store'

describe('defineStore: derivados e ações sem navegador', () => {
  it('create() aplica o estado inicial e calcula os derivados', () => {
    const c = cart.create({ items: [{ name: 'a', price: 10, qty: 2 }] })
    expect(c.count).toBe(2)
    expect(c.total).toBe(20)
    c.coupon = 'DEZ'
    expect(c.total).toBe(18)
  })

  it('ações alteram o estado e os derivados acompanham', () => {
    const c = cart.create()
    c.add({ name: 'b', price: 5, qty: 1 })
    expect(c.total).toBe(5)
    c.clear()
    expect(c.count).toBe(0)
  })

  it('cada create() tem estado próprio', () => {
    const a = cart.create(); const b = cart.create()
    a.add({ name: 'x', price: 1, qty: 1 })
    expect(b.count).toBe(0)
  })

  it('html() emite só o estado inicial, com safeJson', () => {
    expect(cart.html({ coupon: '</script><script>alert(1)</script>' }))
      .toBe('<script type="application/json" data-htsx-store="cart">{"coupon":"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"}</script>')
  })

  it('nome inválido → erro', () =>
    expect(() => defineStore('a-b', { state: {} })).toThrow(/htsx: nome de store inválido "a-b"/))

  it('tipos: estado, derivados e ações conferidos', () => {
    const NEVER = false as boolean
    if (NEVER) {
      const c = cart.create()
      const n: number = c.total
      void n
      // @ts-expect-error — derivado é só leitura
      c.total = 1
      // @ts-expect-error — argumento errado na ação
      c.add('x')
      // @ts-expect-error — campo inexistente no estado inicial
      cart.html({ nada: 1 })
    }
    expect(true).toBe(true)
  })
})

describe.skipIf(!findChrome())('defineStore: no navegador com Bun.build', () => {
  let app: App
  beforeAll(async () => {
    const built = await Bun.build({ entrypoints: [path.join(import.meta.dir, 'fixtures', 'cart-client.ts')], target: 'browser', minify: true })
    if (!built.success) throw new AggregateError(built.logs)
    const clientJs = await built.outputs[0]!.text()
    const vendor = path.join(import.meta.dir, '..', 'vendor')
    app = await open(async req => {
      const { pathname } = new URL(req.url)
      if (pathname === '/client.js') return new Response(clientJs, { headers: { 'content-type': 'text/javascript' } })
      if (pathname.startsWith('/vendor/')) return new Response(Bun.file(path.join(vendor, path.basename(pathname))), { headers: { 'content-type': 'text/javascript' } })
      const html = await renderPage(() => (
        <html>
          <head>
            {raw(inspector())}
            <script src="/client.js"></script>
            {raw(head({ alpine: true, vendor: '/vendor/' }))}
          </head>
          <body x-data>
            {raw(cart.html({ items: [{ name: 'a', price: 10, qty: 1 }] }))}
            <p data-testid="total" x-text="$store.cart.total"></p>
            <button $click="$store.cart.add({ name: 'b', price: 5, qty: 2 })">Adicionar</button>
          </body>
        </html>
      ))
      return new Response(html, { headers: { 'content-type': 'text/html' } })
    })
  })
  afterAll(async () => { await app?.close() })

  it('estado inicial do servidor, derivado na tela, ação e efeito', async () => {
    await app.waitFor('text:10')
    await app.press('text:Adicionar')
    await app.waitFor('text:20')
    expect(await app.inspect()).toMatchObject({ stores: { cart: { count: 3, total: 20, coupon: '' } } })
    expect(await app.evaluate<string>('document.title')).toBe('Carrinho (3)')
  })
})
