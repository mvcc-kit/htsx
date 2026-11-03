import { describe, expect, it } from 'bun:test'
import { defineApp, error, fail, getRequestEvent, redirect, route, sequence, type Handle } from '../app'
import { page } from '../testing'

const posts: Record<string, string> = { ola: 'Olá <mundo>' }

const app = defineApp({
  layout: ({ children }) => <html><body>{children}</body></html>,
  matchers: { int: v => /^\d+$/.test(v) },
  routes: [
    route('/', { page: () => <h1>Início</h1> }),
    route('/blog/[slug]', {
      load: ({ params }) => posts[params.slug] ?? error(404, `Post "${params.slug}" não existe`),
      page: ({ data, params }) => <article data-slug={params.slug}>{data}</article>,
    }),
    route('/item/[id=int]', { page: ({ params }) => <p>item {params.id}</p> }),
    route('/contato', {
      actions: {
        default: async ({ request }) => {
          const nome = String((await request.formData()).get('nome') ?? '')
          if (!nome) return fail(400, { erro: 'Nome obrigatório', nome })
          return { nome, erro: undefined }
        },
      },
      page: ({ form }) => <form method="post">{form ? <p role="alert">{form.erro ?? `ok ${form.nome}`}</p> : null}</form>,
    }),
    route('/sair', { actions: { tchau: () => redirect(303, '/') } }),
    route('/api/eco', {
      GET: ({ url }) => Response.json({ q: url.searchParams.get('q') }),
      POST: async ({ request }) => Response.json(await request.json()),
    }),
    route('/quem', { page: () => <p>{getRequestEvent().locals.user as string}</p> }),
    route('/boom', { page: () => { throw new Error('segredo interno') } }),
    route('/cookie', { GET: ({ cookies, setHeaders }) => { cookies.set('s', 'a b'); setHeaders({ 'cache-control': 'no-store' }); return new Response(cookies.get('x') ?? '') } }),
  ],
  handle: sequence(
    async ({ event, resolve }) => { event.locals.user = 'Ana'; return resolve(event) },
    async ({ event, resolve }) => { const r = await resolve(event); r.headers.set('x-ok', '1'); return r },
  ),
  handleError: () => ({ message: 'Algo deu errado' }),
})

const req = (path: string, init: RequestInit = {}) => app.respond(new Request('https://ex.com' + path, init))
const form = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  req(path, { method: 'POST', body: new URLSearchParams(body), headers: { origin: 'https://ex.com', ...headers } })

describe('app: páginas, load e layout', () => {
  it('página com layout e DOCTYPE', async () => {
    const res = await req('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('vary')).toContain('HX-Request')
    expect(await res.text()).toBe('<!DOCTYPE html><html><body><h1>Início</h1></body></html>')
  })

  it('htmx parcial sai sem layout; hx-boost sai com layout', async () => {
    expect(await (await req('/', { headers: { 'hx-request': 'true' } })).text()).toBe('<h1>Início</h1>')
    expect(await (await req('/', { headers: { 'hx-request': 'true', 'hx-boosted': 'true' } })).text()).toContain('<html>')
  })

  it('load com params tipados e dados escapados', async () => {
    const p = await page(await req('/blog/ola'))
    expect(await p.text('article')).toBe('Olá <mundo>')
    expect(await p.attr('article', 'data-slug')).toBe('ola')
  })

  it('error(404) do load vira página de erro com a mensagem escapada', async () => {
    const res = await req('/blog/%3Cx%3E')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('<!DOCTYPE html><h1>404</h1><p>Post &quot;&lt;x&gt;&quot; não existe</p>')
  })

  it('rota inexistente → 404; matcher recusa → 404', async () => {
    expect((await req('/nada')).status).toBe(404)
    expect((await req('/item/abc')).status).toBe(404)
    expect(await (await req('/item/7')).text()).toContain('item 7')
  })

  it('barra no fim redireciona (308) mantendo a query', async () => {
    const res = await req('/blog/ola/?a=1')
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('/blog/ola?a=1')
  })

  it('erro inesperado → 500 com mensagem segura do handleError', async () => {
    const res = await req('/boom')
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toContain('Algo deu errado')
    expect(body).not.toContain('segredo interno')
  })

  it('erro em JSON quando o cliente pede JSON', async () => {
    const res = await req('/nada', { headers: { accept: 'application/json' } })
    expect(await res.json()).toEqual({ message: 'Não encontrado' })
  })
})

describe('app: ações de formulário', () => {
  it('fail() responde 400 e repõe o formulário', async () => {
    const res = await form('/contato', { nome: '' })
    expect(res.status).toBe(400)
    expect(await (await page(res)).text('[role=alert]')).toBe('Nome obrigatório')
  })

  it('sucesso renderiza a página com o resultado em form', async () => {
    expect(await (await page(await form('/contato', { nome: 'Ana' }))).text('[role=alert]')).toBe('ok Ana')
  })

  it('ação nomeada com ?/nome e redirect: 303 sem htmx, HX-Redirect com htmx', async () => {
    const plain = await form('/sair?/tchau', {})
    expect(plain.status).toBe(303)
    expect(plain.headers.get('location')).toBe('/')
    const res = await form('/sair?/tchau', {}, { 'hx-request': 'true' })
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('hx-redirect')).toBe('/')
  })

  it('ação inexistente → 404 com as ações válidas', async () => {
    const res = await form('/sair?/outra', {})
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('action=&quot;?/tchau&quot;')
  })

  it('CSRF: formulário de outra origem → 403; JSON passa', async () => {
    expect((await form('/contato', { nome: 'x' }, { origin: 'https://mal.com' })).status).toBe(403)
    expect((await req('/contato', { method: 'POST', body: 'nome=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(403)
    const res = await req('/api/eco', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json', origin: 'https://mal.com' } })
    expect(await res.json()).toEqual({ a: 1 })
  })

  it('rota com ações e prerender → erro na declaração', () => {
    expect(() => route('/x', { prerender: true, actions: { default: () => ({}) } })).toThrow(/ações precisam de servidor/)
  })
})

describe('app: endpoints, hooks, cookies', () => {
  it('GET/POST de endpoint, HEAD sem corpo, 405 com Allow', async () => {
    expect(await (await req('/api/eco?q=1')).json()).toEqual({ q: '1' })
    const head = await req('/api/eco', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    const res = await req('/api/eco', { method: 'DELETE', headers: { origin: 'https://ex.com' } })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, POST, HEAD')
  })

  it('handle em sequência: locals e cabeçalho na resposta; getRequestEvent nos componentes', async () => {
    const res = await req('/quem')
    expect(res.headers.get('x-ok')).toBe('1')
    expect(await (await page(res)).text('p')).toBe('Ana')
  })

  it('cookies com padrões seguros e setHeaders', async () => {
    const res = await req('/cookie', { headers: { cookie: 'x=1; y=2' } })
    expect(await res.text()).toBe('1')
    expect(res.headers.get('set-cookie')).toBe('s=a%20b; Path=/; HttpOnly; Secure; SameSite=Lax')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('declaração inválida dá erro com a correção', () => {
    expect(() => defineApp({ routes: [route('/[id=uuid]', {})] })).toThrow(/matcher "uuid".*registre em defineApp/)
    expect(() => defineApp({ routes: [route('/a', {}), route('/a', {})] })).toThrow(/declarada duas vezes/)
  })

  it('tipos: params, data e form conferidos', () => {
    const NEVER = false as boolean
    if (NEVER) {
      route('/blog/[slug]', {
        load: ({ params }) => ({ titulo: params.slug }),
        // @ts-expect-error — "id" não existe nos params
        page: ({ data, params }) => <h1>{data.titulo}{params.id}</h1>,
      })
      route('/x', {
        actions: { default: () => fail(400, { erro: 'x' }) },
        page: ({ form }) => <p>{form?.erro}</p>,
      })
      // @ts-expect-error — handle precisa devolver Response
      const h: Handle = () => 1
      void h
    }
    expect(true).toBe(true)
  })
})
