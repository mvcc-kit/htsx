/**
 * Navegador real (CDP) com Alpine e htmx de vendor/. Pulado se não houver Chrome na máquina.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { head, inspector, raw, renderPage, renderToString, storeInit } from '../index'
import { findChrome, open, type App } from '../testing'

const VENDOR = path.join(import.meta.dir, '..', 'vendor')

const Page = () => (
  <html>
    <head>
      {raw(inspector())}
      {raw(head({ title: 'Suporte', alpine: true, htmx: true, vendor: '/vendor/' }))}
    </head>
    <body>
      {raw(storeInit('form', { sent: false }))}
      <form id="suporte" x-data="{ email: '', get valido() { return this.email.includes('@') } }" $submit_prevent="$store.form.sent = true">
        <input id="email" name="email" x-model="email" />
        <button type="submit" data-testid="enviar" x-bind-disabled="!valido">Enviar</button>
      </form>
      <p x-show="$store.form.sent">Recebemos sua mensagem</p>
      <div id="menu" x-data="{ open: false }"><span x-show="open">Menu aberto</span></div>
      <button hx-get="/frag" hx-target="#alvo" hx-swap="innerHTML">Carregar</button>
      <div id="alvo"></div>
    </body>
  </html>
)

async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url)
  if (pathname.startsWith('/vendor/')) {
    return new Response(Bun.file(path.join(VENDOR, path.basename(pathname))), { headers: { 'content-type': 'text/javascript' } })
  }
  if (pathname === '/frag') return new Response(await renderToString(() => <b data-testid="frag">Fragmento htmx</b>))
  return new Response(await renderPage(() => <Page />), { headers: { 'content-type': 'text/html' } })
}

describe.skipIf(!findChrome())('testing: navegador real por CDP', () => {
  let app: App
  beforeAll(async () => { app = await open(handler, '/') })
  afterAll(async () => { await app?.close() })

  it('type, press e waitFor por texto, id: e testid:', async () => {
    await app.type('id:email', 'a@b.com')
    expect((await app.inspect()).data['#suporte']).toEqual({ email: 'a@b.com', valido: true })
    await app.press('testid:enviar')
    await app.waitFor('text:Recebemos sua mensagem')
    expect(await app.inspect()).toMatchObject({ url: '/', stores: { form: { sent: true } } })
  })

  it('set() altera estado do Alpine e a tela acompanha', async () => {
    expect(await app.text('text:Menu aberto')).toBeNull()
    await app.set('data.#menu.open', true)
    await app.waitFor('text:Menu aberto')
    await app.set('stores.form.sent', false)
    expect((await app.inspect()).stores).toEqual({ form: { sent: false } })
  })

  it('set() com caminho inexistente dá erro com a correção', async () => {
    await expect(app.set('data.#nada.x', 1)).rejects.toThrow(/htsx: caminho "data.#nada.x" não existe; use stores/)
  })

  it('htmx troca o fragmento ao clicar', async () => {
    await app.press('text:Carregar')
    await app.waitFor('testid:frag')
    expect(await app.text('id:alvo')).toBe('Fragmento htmx')
  })

  it('waitFor sem o elemento falha no prazo, com o seletor na mensagem', async () => {
    await expect(app.waitFor('text:Nunca aparece', { timeout: 50 })).rejects.toThrow('htsx: "text:Nunca aparece" não apareceu em 50ms')
  })

  it('screenshot grava PNG', async () => {
    const file = path.join(import.meta.dir, '..', 'node_modules', '.cache', 'htsx-shot.png')
    await app.screenshot(file)
    const bytes = new Uint8Array(await Bun.file(file).arrayBuffer())
    expect([...bytes.slice(1, 4)].map(c => String.fromCharCode(c)).join('')).toBe('PNG')
  })
})
