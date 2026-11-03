// Parciais: regras puras, roteador, segurança, arquivos e Chrome real.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineApp, error, fail, fileRoutes, partial, route, type StandardSchema } from '../kit'
import { Head, Outlet, Title } from '../meta'
import { buildStatic } from '../adapter-static'
import { fileServer } from '../src/build/files'
import { partialAttrs, partialNameFromQuery, partialUrl, queryToInput } from '../src/app/partial-logic'
import { triggerHeader } from '../src/htmx-headers'
import { createHtmxContext } from '../src/app/htmx'
import { scanRoutes } from '../src/build/routes'
import { findChrome, open, type App } from '../testing'

const pageInput: StandardSchema<{ page: number }> = {
  '~standard': {
    version: 1,
    vendor: 'teste',
    validate: value => {
      const n = Number((value as { page?: string }).page)
      return Number.isInteger(n) && n > 0 ? { value: { page: n } } : { issues: [{ message: 'detalhe interno' }] }
    },
  },
}

describe('regras', () => {
  it('lê o nome e a entrada da URL, com chave repetida como list', () => {
    const q = new URLSearchParams('/list&a=1&b=2&b=3')
    expect(partialNameFromQuery(q)).toBe('list')
    expect(partialNameFromQuery(new URLSearchParams('a=1'))).toBeNull()
    expect({ ...queryToInput(q) }).toEqual({ a: '1', b: ['2', '3'] })
  })

  it('entrada não herda de Object: __proto__ na URL é só uma chave', () => {
    const input = queryToInput(new URLSearchParams('__proto__=x&constructor=y'))
    expect(Object.getPrototypeOf(input)).toBeNull()
    expect(({} as { x?: string }).x).toBeUndefined()
  })

  it('gera URL relativa, com escape e sem o que não existe', () => {
    expect(partialUrl('list', { a: 1, b: 'x y&z', c: undefined, d: [1, 2], e: true })).toBe('?/list&a=1&b=x%20y%26z&d=1&d=2&e=true')
  })

  it('objeto na URL é erro com o nome do campo', () => {
    expect(() => partialUrl('l', { a: { b: 1 } })).toThrow(/"a" não cabe na URL/)
    expect(() => partialUrl('l', { a: null })).toThrow(/"a" não cabe na URL/)
  })

  it('atributos só com o que foi pedido', () => {
    expect(partialAttrs('?/l')).toEqual({ 'hx-get': '?/l' })
    expect(partialAttrs('?/l', { target: '#x', swap: 'outerHTML', trigger: 'load', indicator: '#i', pushUrl: false })).toEqual({
      'hx-get': '?/l', 'hx-target': '#x', 'hx-swap': 'outerHTML', 'hx-trigger': 'load', 'hx-indicator': '#i', 'hx-push-url': 'false',
    })
  })

  it('HX-Trigger aceita acento e passa pelo Headers', () => {
    const value = triggerHeader({ saved: { text: 'ação 😀' } })
    expect(() => new Headers({ 'hx-trigger': value })).not.toThrow()
    expect(JSON.parse(value)).toEqual({ saved: { text: 'ação 😀' } })
  })
})

describe('event.htmx', () => {
  it('lê o pedido e escreve a resposta, somando eventos', () => {
    const response = new Headers()
    const hx = createHtmxContext(new Headers({ 'hx-request': 'true', 'hx-boosted': 'true', 'hx-target': 't', 'hx-trigger': 'b', 'hx-current-url': 'http://x/a' }), response)
    expect([hx.request, hx.boosted, hx.historyRestore, hx.target, hx.triggeredBy, hx.currentUrl]).toEqual([true, true, false, 't', 'b', 'http://x/a'])
    hx.trigger('a'); hx.trigger('b', { n: 1 }); hx.retarget('#x'); hx.reswap('none'); hx.pushUrl(false); hx.refresh()
    expect(JSON.parse(response.get('hx-trigger')!)).toEqual({ a: null, b: { n: 1 } })
    expect(response.get('hx-retarget')).toBe('#x')
    expect(response.get('hx-reswap')).toBe('none')
    expect(response.get('hx-push-url')).toBe('false')
    expect(response.get('hx-refresh')).toBe('true')
  })
})

describe('no roteador', () => {
  let pageLoads = 0
  const List = partial({
    input: pageInput,
    load: ({ input, event }) => {
      event.htmx.trigger('loaded', { page: input.page })
      return { double: input.page * 2 }
    },
    render: ({ input, data }) => <ul id="list"><Title>List</Title>{`p${input.page} d${data.double}`}</ul>,
  })
  const Open = partial({ render: () => <b>open</b> })
  const Protected = partial({ render: () => <b>secret</b> })
  const app = defineApp({
    layout: ({ children }) => <html><head></head><body><nav>menu</nav>{children}</body></html>,
    handle: ({ event, resolve }) => {
      if (event.url.pathname === '/blocked') error(403, 'Bloqueada')
      return resolve(event)
    },
    routes: [
      route('/', {
        partials: { list: List, open: Open },
        load: () => { pageLoads++; return {} },
        page: () => <main><List page={3} /><button {...List.get({ page: 4 }, { target: '#list' })}>x</button></main>,
        actions: { add: () => List.respond({ page: 9 }) },
      }),
      route('/private', {
        partials: { protected: Protected },
        guard: ({ cookies }) => { if (!cookies.get('session')) error(401, 'Entre') },
        page: () => <p>page</p>,
      }),
      route('/blocked', { partials: { open: Open }, page: () => <p>x</p> }),
    ],
  })
  const get = (p: string, headers: Record<string, string> = {}) => app.respond(new Request(`http://x${p}`, { headers }))

  it('como componente, sai no HTML da página, com os atributos tipados', async () => {
    const html = await (await get('/')).text()
    expect(html).toContain('<nav>menu</nav>')
    expect(html).toContain('p3 d6')
    expect(html).toContain('hx-get="?/list&amp;page=4"')
    expect(html).toContain('hx-target="#list"')
    expect(html).toContain('<title>List</title>')
  })

  it('pela URL, sai só o trecho: sem layout e sem o load da página', async () => {
    const before = pageLoads
    const res = await get('/?/list&page=2', { 'hx-request': 'true' })
    expect(await res.text()).toBe('<title>List</title><ul id="list">p2 d4</ul>')
    expect(pageLoads).toBe(before)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(JSON.parse(res.headers.get('hx-trigger')!)).toEqual({ loaded: { page: 2 } })
  })

  it('HEAD não traz corpo', async () => {
    const res = await app.respond(new Request('http://x/?/open', { method: 'HEAD' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
  })

  it('entrada inválida dá 400, sem vazar detalhe do schema', async () => {
    const res = await get('/?/list&page=abc')
    expect(res.status).toBe(400)
    expect(await res.text()).not.toContain('detalhe interno')
  })

  it('nome desconhecido dá 404, inclusive nomes de Object', async () => {
    for (const name of ['missing', 'constructor', '__proto__', 'toString']) expect((await get(`/?/${name}`)).status).toBe(404)
  })

  it('handle e guard protegem o parcial', async () => {
    expect((await get('/blocked?/open')).status).toBe(403)
    expect((await get('/private?/protected')).status).toBe(401)
    expect(await (await get('/private?/protected', { cookie: 'session=1' })).text()).toBe('<b>secret</b>')
  })

  it('rota sem o parcial ignora ?/nome como antes', async () => {
    const other = defineApp({ routes: [route('/', { page: () => <p>page</p> })] })
    expect(await (await other.respond(new Request('http://x/?/any'))).text()).toBe('<p>page</p>')
  })

  it('POST no mesmo ?/nome é a ação, que pode devolver só o parcial', async () => {
    const res = await app.respond(new Request('http://x/?/add', { method: 'POST', headers: { origin: 'http://x', 'content-type': 'application/x-www-form-urlencoded' }, body: '' }))
    expect(await res.text()).toBe('<title>List</title><ul id="list">p9 d18</ul>')
  })

  it('erros de uso dizem o que fazer', () => {
    expect(() => partial({ render: () => null }).get({})).toThrow(/parcial sem rota/)
    expect(() => route('/', { partials: { 'a b': partial({ render: () => null }) } })).toThrow(/nome de parcial inválido/)
    const dup = partial({ render: () => null })
    route('/a', { partials: { first: dup } })
    expect(() => route('/b', { partials: { second: dup } })).toThrow(/registrado como "first" e "second"/)
    expect(() => route('/', { prerender: true, partials: { x: partial({ render: () => null }) } })).toThrow(/parciais precisam de servidor/)
  })
})

describe('o load dos layouts protege o parcial em arquivos', () => {
  let pageLoads = 0
  const Secret = partial({ render: () => <b>secret</b> })
  const { routes } = fileRoutes({
    routes: [{
      id: '/account',
      levels: [{
        dir: 'src/routes',
        layoutServer: { load: ({ cookies }) => { if (!cookies.get('session')) error(401, 'Entre') } },
      }],
      page: { default: () => <p>page</p> },
      pageServer: { load: () => { pageLoads++; return {} } },
      partials: { secret: { default: Secret } },
    }],
  })
  const app = defineApp({ routes })
  const get = (headers: Record<string, string> = {}) => app.respond(new Request('http://x/account?/secret', { headers }))

  it('sem sessão, o parcial não roda; com sessão, roda sem o load da página', async () => {
    expect((await get()).status).toBe(401)
    expect(await (await get({ cookie: 'session=1' })).text()).toBe('<b>secret</b>')
    expect(pageLoads).toBe(0)
  })

  it('arquivo sem o export default dá erro claro', () => {
    expect(() => fileRoutes({ routes: [{ id: '/a', levels: [{ dir: 'r' }], page: { default: () => null }, partials: { x: {} as never } }] })).toThrow(/precisa de export default partial/)
  })
})

describe('em site estático', () => {
  const tmp = path.join(import.meta.dir, '..', '.cache', 'partial-static')
  afterAll(() => rm(tmp, { recursive: true, force: true }))

  it('o build falha, porque parcial precisa de servidor', async () => {
    await mkdir(tmp, { recursive: true })
    const app = defineApp({ prerender: true, routes: [route('/', { partials: { x: partial({ render: () => null }) }, page: () => <p>x</p> })] })
    await expect(buildStatic(app, { root: tmp, outDir: 'build', vendor: false, fallback: false })).rejects.toThrow(/tem partials, que precisam de servidor/)
  })
})

describe('em arquivos', () => {
  const tmp = path.join(import.meta.dir, '..', '.cache', 'partial-scan')
  afterAll(() => rm(tmp, { recursive: true, force: true }))
  const scan = async (files: string[]) => {
    await rm(tmp, { recursive: true, force: true })
    await mkdir(path.join(tmp, 'src/routes'), { recursive: true })
    for (const f of files) await writeFile(path.join(tmp, 'src/routes', f), '')
    return scanRoutes(tmp, 'src/routes')
  }

  it('acha +nome.partial.tsx', async () => {
    const [dir] = await scan(['+page.tsx', '+list.partial.tsx', '+other-thing.partial.ts'])
    expect(Object.keys(dir!.partials).sort()).toEqual(['list', 'other-thing'])
  })

  it('sem página é erro, e nome parecido sugere o certo', async () => {
    await expect(scan(['+list.partial.tsx'])).rejects.toThrow(/sem \+page\.tsx/)
    await expect(scan(['+page.tsx', '+list.partials.tsx'])).rejects.toThrow(/use \+name\.partial\.tsx/)
    await expect(scan(['+page.tsx', '+partial.tsx'])).rejects.toThrow(/use \+name\.partial\.tsx/)
  })
})

const assets = fileServer(path.join(import.meta.dir, 'nao-existe'), { vendor: true })

describe.skipIf(!findChrome())('no Chrome real', () => {
  let chrome: App
  const List = partial({
    input: pageInput,
    render: ({ input }) => (
      <div id="list">
        <p>{`Página ${input.page}`}</p>
        <button {...List.get({ page: input.page + 1 }, { target: '#list', swap: 'outerHTML' })}>Próxima</button>
      </div>
    ),
  })
  const app = defineApp({
    layout: ({ children }) => <html><Head alpine={false} /><body hx-boost="true"><Outlet>{children}</Outlet></body></html>,
    routes: [
      route('/', { partials: { list: List }, page: () => <main><List page={1} /></main> }),
      route('/form', {
        actions: { default: () => fail(422, { message: 'Nome obrigatório' }) },
        page: ({ form }) => <main><form method="post"><button>Enviar</button></form><p>{form?.message ?? 'sem erro'}</p></main>,
      }),
    ],
  })
  beforeAll(async () => {
    chrome = await open(async req => assets(req) ?? app.respond(req), '/')
  })
  afterAll(async () => { await chrome?.close() })

  it('o trecho se troca a si mesmo várias vezes, sem mudar a URL', async () => {
    await chrome.press('text:Próxima')
    await chrome.waitFor('text:Página 2')
    await chrome.press('text:Próxima')
    await chrome.waitFor('text:Página 3')
    expect(await chrome.evaluate<string>('location.pathname + location.search')).toBe('/')
    expect(await chrome.evaluate<number>(`document.querySelectorAll('#list').length`)).toBe(1)
  })

  it('fail() com 422 aparece na tela, em formulário com hx-boost', async () => {
    await chrome.goto('/form')
    await chrome.waitFor('text:sem erro')
    await chrome.press('text:Enviar')
    await chrome.waitFor('text:Nome obrigatório')
  })
})
