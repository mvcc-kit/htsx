/**
 * Integration tests — combinam múltiplos módulos em cenários realistas
 * (CRUD de items, HTMX partial flow, etc.)
 */

import { describe, expect, it } from 'bun:test'
import {
  renderPage, renderToString, withContext, useContext,
  htmxResponse, isHtmx, hxTarget,
  OOB,
  ErrorBoundary,
  defineEvents,
  Form, Field, formContext,
  csrf, CsrfField,
  cache, cacheContext,
  flash,
  raw,
} from '../index'
import { jsx, createElement } from '../src/jsx-runtime'

const h = createElement

describe('integration: full page render', () => {
  it('renderiza página completa com layout + componentes + dados do context', async () => {
    interface AppCtx { user: { name: string }; locale: string }

    function UserBadge() {
      const { user } = useContext<AppCtx>()
      return h('span', { class: 'badge' }, user.name)
    }

    function Layout({ children }: { children?: unknown }) {
      const { locale } = useContext<AppCtx>()
      return h('html', { lang: locale },
        h('body', {}, [h('header', {}, h(UserBadge, {})), children]),
      )
    }

    const html = await renderPage(
      () => h(Layout, { children: h('main', {}, 'Welcome') }),
      { context: { user: { name: 'Ana' }, locale: 'pt-BR' } },
    )
    expect(html).toBe(
      '<!DOCTYPE html><html lang="pt-BR"><body><header><span class="badge">Ana</span></header><main>Welcome</main></body></html>',
    )
  })
})

describe('integration: HTMX partial flow', () => {
  it('full page vs partial baseado em isHtmx(req)', async () => {
    function ItemCard({ id }: { id: number }) {
      return h('article', { id: `item-${id}` }, `Item ${id}`)
    }
    function Page() {
      return h('html', {}, h('body', {}, h(ItemCard, { id: 1 })))
    }

    async function render(req: Request) {
      return isHtmx(req)
        ? await renderToString(() => h(ItemCard, { id: 1 }))
        : await renderPage(() => h(Page, {}))
    }

    const fullReq = new Request('http://x')
    const htmxReq = new Request('http://x', { headers: { 'HX-Request': 'true' } })

    expect(await render(fullReq)).toContain('<!DOCTYPE html>')
    expect(await render(htmxReq)).toBe('<article id="item-1">Item 1</article>')
  })

  it('htmxResponse + OOB + HX-Trigger juntos', async () => {
    const events = defineEvents({
      'cart:updated': (count: number) => ({ count }),
    })

    const r = await htmxResponse(
      () => h('div', {}, [
        h('div', { id: 'main' }, 'updated'),
        OOB({ target: 'cart-count', swap: 'innerHTML', children: '5' }),
      ]),
      { trigger: events.emit('cart:updated', 5) },
    )

    const body = await r.text()
    expect(body).toContain('<div id="main">updated</div>')
    expect(body).toContain('id="cart-count"')
    expect(body).toContain('hx-swap-oob="innerHTML:#cart-count"')
    expect(r.headers.get('HX-Trigger')).toBe('{"cart:updated":{"count":5}}')
  })
})

describe('integration: cache + context', () => {
  it('cache compartilhado entre chamadas sequenciais no mesmo render', async () => {
    let dbCalls = 0
    const getUser = cache(async (id: string) => {
      dbCalls++
      return { id, name: `user-${id}` }
    })

    const html = await renderToString(
      async () => {
        // chamadas sequenciais — 2ª e 3ª hit no cache
        const u1 = await getUser('1')
        const u2 = await getUser('1')
        const u3 = await getUser('1')
        return h('div', {}, `${u1.name}/${u2.name}/${u3.name}`)
      },
      { context: cacheContext() },
    )
    expect(html).toBe('<div>user-1/user-1/user-1</div>')
    expect(dbCalls).toBe(1) // ✅ deduplicado
  })

  it('NOTA: chamadas concorrentes não dedupam in-flight (limitação documentada)', async () => {
    let dbCalls = 0
    const getUser = cache(async (id: string) => {
      dbCalls++
      await Promise.resolve()
      return { id }
    })
    await withContext(cacheContext(), async () => {
      // disparadas concorrentemente — ambas miss cache antes da 1ª resolver
      await Promise.all([getUser('a'), getUser('a')])
      expect(dbCalls).toBe(2)
      // depois que ambas resolveram, próxima call hit cache
      await getUser('a')
      expect(dbCalls).toBe(2)
    })
  })
})

describe('integration: Form completo com CSRF', () => {
  it('Form renderiza com CSRF + Field repopulado + erro', async () => {
    const token = await csrf.sign({
      secret: 'a'.repeat(40),
      sessionId: 'session-123',
    })

    const html = await renderToString(
      () => Form({
        action: '/users',
        method: 'post',
        csrf: token,
        children: [
          Field({ name: 'name', label: 'Nome' }),
          Field({ name: 'email', label: 'Email', type: 'email' }),
          h('button', { type: 'submit' }, 'Criar'),
        ],
      }),
      {
        context: formContext({
          errors: { email: 'já cadastrado' },
          values: { name: 'Ana' },
        }),
      },
    )

    expect(html).toContain('action="/users"')
    expect(html).toContain('name="_csrf"')
    expect(html).toContain('value="Ana"')         // repopulação
    expect(html).toContain('já cadastrado')        // erro
    expect(html).toContain('aria-invalid="true"')
  })
})

describe('integration: flash redirect cycle', () => {
  const SECRET = 'flash-test-secret-32-chars-min-yyz'

  it('serializa após POST → cookie → parse no GET', async () => {
    // simula "controller" pós-criação
    const messages = await flash.serialize(
      [{ type: 'success', text: 'Conta criada com sucesso' }],
      { secret: SECRET },
    )
    const setCookieValue = flash.setCookie(messages)

    // simula response com Set-Cookie e redirect
    const response = new Response('', {
      status: 302,
      headers: {
        'Location':   '/dashboard',
        'Set-Cookie': setCookieValue,
      },
    })
    expect(response.headers.get('Set-Cookie')).toContain('_flash=')

    // simula próxima GET request com o cookie
    const cookieRaw = setCookieValue.split(';')[0]!
    const nextReq = new Request('http://x/dashboard', {
      headers: { cookie: cookieRaw },
    })
    const token = flash.readCookie(nextReq)
    const parsed = await flash.parse(token, { secret: SECRET })

    expect(parsed).toEqual([
      { type: 'success', text: 'Conta criada com sucesso' },
    ])
  })
})

describe('integration: XSS hardening (regression suite)', () => {
  it('user input em todos os pontos é escapado', async () => {
    const evil = '<script>alert(1)</script>'
    const html = await renderToString(() =>
      h('div', { title: evil }, [
        h('p', {}, evil),
        Field({ name: 'q', value: evil, error: evil }),
      ]),
    )
    expect(html).not.toContain('<script>alert')
    expect(html.match(/&lt;script&gt;/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('OOB target inválido bloqueado', () => {
    expect(() => OOB({ target: '"><img onerror=alert(1)>', children: '' })).toThrow()
  })

  it('raw() ainda passa direto (uso responsável)', async () => {
    const html = await renderToString(() => h('div', {}, raw('<b>trusted</b>')))
    expect(html).toBe('<div><b>trusted</b></div>')
  })
})
