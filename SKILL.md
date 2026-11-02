---
name: htsx
description: Use ao construir frontends SSR com JSX + HTMX + Alpine usando o pacote `{{PKG}}`. Acione quando o usuário pedir página/rota HTML, formulário, componente htmx/alpine, SSE, CSRF, flash messages, suspense, testes de página, ou ao trabalhar em qualquer arquivo `.tsx` que renderize HTML (não React).
---

# {{PKG}} — Guia de uso

Biblioteca de SSR com JSX para HTMX e Alpine, sem dependências. Roda em Bun, Workers e Node. **Não é React**: JSX vira string HTML, sem DOM virtual nem hidratação.

Este arquivo é a fonte da documentação: o `llms.txt` é gerado dele (`bun run docs`) e cada bloco `ts`/`tsx` abaixo é compilado e executado nos testes (`__tests__/docs.test.ts`).

## Setup (1x por app)

```json
// tsconfig.json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "{{PKG}}" } }
```

```json
// package.json (pacote privado do workspace, não está no npm)
{ "dependencies": { "{{PKG}}": "workspace:*" } }
```

Arquivos com JSX usam a extensão `.tsx`.

---

## Conceito central

- Todo JSX vira string HTML. `children` dentro de um componente já é HTML renderizado, não um node React.
- `key` (de listas) é aceita e ignorada. Sem JSX, use `h(tag, props, ...filhos)` (alias de `createElement`).
- `HtmlSafeString` é HTML já escapado e seguro para emitir. `raw(str)` marca uma string como HTML confiável; use só com HTML gerado no servidor.
- Divisão de responsabilidades:

```
O servidor decide:              O Alpine decide:
dados do banco                  dropdown aberto/fechado
HTML inicial completo           modal visível ou oculto
estado que precisa persistir    aba selecionada
validação de negócio, ACL       foco, transições, contador local

Regra de ouro: se o estado precisa sobreviver a um hx-swap, é do servidor.
Se morre quando o elemento sai do DOM, é do Alpine.
```

---

## Segurança e modo estrito

- Texto interpolado em JSX é **escapado sempre**, inclusive a string que um componente devolve.
- Texto comum dentro de `<script>` ou `<style>` **lança erro** (e é erro de compilação): use `raw()` para código confiável e `raw(safeJson(dados))` para dados.
- `on*` (`onclick`, `onload`...) é bloqueado: use `$click` (Alpine) ou `hx-on:click`.
- URLs em `href`, `src`, `action` e `formaction` com `javascript:`, `data:`, `blob:` ou `vbscript:` viram `#`. Caracteres invisíveis são removidos antes da checagem.
- CSS em `style={{...}}`: nome inválido é descartado; `<` e `>` são removidos do valor.
- Booleano em `aria-*` e `data-*` vira `"true"` ou `"false"`.
- Nome de cookie validado pela RFC 6265; tokens CSRF e flash com HMAC-SHA256 e comparação em tempo constante.

**Modo estrito** (`HTSX_STRICT=1`; ligue nos testes): tudo o que sumiria em silêncio lança `htsx: ...` com o nome do problema e a correção. Isso vale para objeto, `Date`, `bigint` ou função como filho, nome de atributo inválido, `on*`, URL trocada por `#`, CSS inválido em `style` e CDN sem `integrity`. Sem o modo estrito, esses casos seguem o caminho seguro em silêncio.

```ts
// bunfig.toml → [test] preload = ["./test-setup.ts"]
// test-setup.ts:
process.env.HTSX_STRICT = '1'
export {}
```

---

## Renderizar

### Página completa — `renderPage`

Use na navegação direta. Acrescenta `<!DOCTYPE html>`.

```tsx
import { head, raw, renderPage } from '{{PKG}}'

// Pré-calcule o head fora do handler. `vendor` aponta para onde o app serve
// os arquivos de `{{PKG}}/vendor/*` (versão e sha256 em vendor/pins.json).
const HEAD = head({ title: 'Meu App', htmx: true, alpine: { plugins: ['collapse'] }, vendor: '/static/vendor/' })

export async function getIndex(req: Request): Promise<Response> {
  const html = await renderPage(() => (
    <html lang="pt-br">
      <head>
        {raw(HEAD)}
        <style>{raw('[x-cloak]{display:none!important}')}</style>
      </head>
      <body>
        <h1>Olá</h1>
      </body>
    </html>
  ))
  return new Response(html, { headers: { 'content-type': 'text/html' } })
}
```

### Fragmento — `renderToString` e `isHtmx`

Para respostas HTMX (sem DOCTYPE nem layout). Detecte `isHtmx(req)` cedo.

```tsx
import { isHtmx, renderPage, renderToString, type Children } from '{{PKG}}'

interface Row { id: string; subject: string }

const RowList = ({ rows }: { rows: Row[] }) => (
  <ul id="rows">{rows.map(r => <li><a href={`/rows/${r.id}`}>{r.subject}</a></li>)}</ul>
)
const Layout = ({ children }: { children?: Children }) => <html><body>{children}</body></html>

export async function getRows(req: Request, rows: Row[]): Promise<Response> {
  const headers = { 'content-type': 'text/html' }
  if (isHtmx(req)) return new Response(await renderToString(() => <RowList rows={rows} />), { headers })
  return new Response(await renderPage(() => <Layout><RowList rows={rows} /></Layout>), { headers })
}
```

---

## Aplicação e modos de entrega

A lógica do app (rotas, dados, páginas, ações) fica separada da implementação (onde roda). O mesmo `defineApp` sai em dois modos:

| Modo | Para quê | Entrada |
|---|---|---|
| **Estático** | site todo pré-renderizado em HTML; qualquer hospedagem estática | `@repo/htsx/adapter-static` (build) |
| **Cloudflare Workers** | rotas dinâmicas no Worker + páginas pré-renderizadas no Static Assets | `@repo/htsx/adapter-cloudflare` (Worker) e `/build` |

Estrutura sugerida: `src/app.tsx` (lógica, sem plataforma), `build.ts` (estático) e `src/worker.tsx` (Cloudflare). Só os dois últimos sabem da plataforma. As rotas podem ser declaradas com `route()` ou por arquivos (`src/routes/**/+page.tsx`), à escolha.

### Rotas — `defineApp` e `route`

Rotas no formato do SvelteKit: `/blog/[slug]`, `/[[lang]]/sobre` (opcional), `/docs/[...path]` (rest), `/item/[id=int]` (matcher). Os `params` são tipados a partir do id. Escreva `load` e `actions` antes de `page`, para o TypeScript inferir `data` e `form`.

```tsx
import { defineApp, error, fail, redirect, route, sequence } from '{{PKG}}/app'
import { head, raw, VENDOR_PATH, type Children } from '{{PKG}}'

const posts: Record<string, string> = { ola: 'Primeiro post' }

const Layout = ({ children }: { children?: Children }) => (
  <html lang="pt-br">
    <head>{raw(head({ title: 'Site', htmx: true, alpine: true, vendor: VENDOR_PATH }))}</head>
    <body>{children}</body>
  </html>
)

export const app = defineApp({
  layout: Layout,                  // requisição htmx parcial (sem hx-boost) sai sem layout; resposta leva Vary: HX-Request
  prerender: true,                 // padrão das rotas; a rota pode mudar
  matchers: { int: v => /^\d+$/.test(v) },
  routes: [
    route('/', { page: () => <a href="/blog/ola">Ler</a> }),
    route('/blog/[slug]', {
      load: ({ params }) => posts[params.slug] ?? error(404, 'Post não existe'),
      entries: () => Object.keys(posts).map(slug => ({ slug })),   // páginas para o prerender
      page: ({ data }) => <article>{data}</article>,
    }),
    route('/feed.xml', { GET: () => new Response('<rss/>', { headers: { 'content-type': 'application/rss+xml' } }) }),
    route('/contato', {
      prerender: false,
      actions: {
        // <form method="post"> sem action → default; com action="?/nome" → ação nomeada
        default: async ({ request }) => {
          const email = String((await request.formData()).get('email') ?? '')
          if (!email.includes('@')) return fail(400, { erro: 'E-mail inválido', email })
          redirect(303, '/obrigado')
        },
      },
      page: ({ form }) => (
        <form method="post">
          <input name="email" value={form?.email ?? ''} />
          {form?.erro ? <p role="alert">{form.erro}</p> : null}
          <button>Enviar</button>
        </form>
      ),
    }),
  ],
  handle: sequence(async ({ event, resolve }) => {
    event.locals.inicio = Date.now()
    return resolve(event)
  }),
  handleError: ({ error }) => { console.error(error); return { message: 'Erro interno' } },  // nunca mostre a mensagem real
})

// Teste da lógica, sem plataforma: Request → Response
const res = await app.respond(new Request('http://localhost/blog/ola'))
if (!(await res.text()).includes('Primeiro post')) throw new Error('rota quebrada')
```

Comportamento padrão, como no SvelteKit:
- `error(status, msg)`, `redirect(status, url)` e `fail(status, dados)` interrompem ou respondem. Um erro inesperado vira 500 com a mensagem de `handleError`.
- POST/PUT/PATCH/DELETE de formulário com `Origin` de outro site recebe 403 (CSRF). Ajuste com `csrf: { trustedOrigins }`.
- `/sobre/` redireciona para `/sobre` (`trailingSlash: 'never'`).
- `event.cookies` usa `HttpOnly`, `Secure` e `SameSite=Lax` por padrão. `event.setHeaders()` acrescenta cabeçalhos e `event.locals` guarda dados dos hooks.
- `getRequestEvent()` devolve o evento atual dentro de qualquer componente. `HEAD` e `405` com `Allow` saem sozinhos.
- Um `redirect()` numa requisição htmx também manda `HX-Redirect`.

### Rotas por arquivos (opcional) — `+page.tsx`, `+layout.tsx`...

Em vez de listar `route()` à mão, use pastas como no SvelteKit. Tudo roda no servidor. Os dados descem: cada layout recebe os dados dele e os de cima, e a página recebe todos (`locals` dos hooks inclusive).

```txt
src/
  params/int.ts                     export function match(v) → usado como [id=int]
  routes/
    +layout.tsx                     layout raiz (o <html>); recebe { children, data, params, event }
    +layout.server.ts               load do layout → data do layout e de tudo abaixo
    +error.tsx                      página de erro (a mais próxima vale)
    +page.tsx                       página "/"
    (marketing)/sobre/+page.tsx     grupo: não entra na URL → "/sobre"
    blog/+layout.tsx                layout aninhado
    blog/+layout.server.ts          load com parent() → dados dos layouts acima
    blog/[slug]/+page.server.ts     load, actions, prerender, entries
    blog/[slug]/+page.tsx           export default da página
    api/posts.json/+server.ts       GET/POST/... (endpoint)
```

| Arquivo | Exporta |
|---|---|
| `+page.tsx` | `default` (componente: `{ data, form, params, event }`) |
| `+page.server.ts` | `load`, `actions`, `prerender`, `entries` |
| `+layout.tsx` | `default` (componente: `{ children, data, params, event }`) |
| `+layout.server.ts` | `load`, `prerender` (vale para as rotas abaixo) |
| `+server.ts` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `prerender`, `entries` |
| `+error.tsx` | `default` (`{ status, message, event }`), mostrado dentro dos layouts acima dele |

`htsx sync` (o `bin` do pacote) gera `.htsx/routes.ts`, com imports estáticos que o Worker empacota, e os tipos de cada pasta em `./$types`. Rode antes do build e do `tsc`, ou deixe `htsx sync --watch` aberto no desenvolvimento. No `tsconfig.json`: `"extends": ["./.htsx/tsconfig.json"]` (põe `.htsx/types` em `rootDirs`). Ponha `.htsx/` no `.gitignore`.

```ts arquivo=src/app.ts
import { defineApp } from '@repo/htsx/app'
import { files } from '../.htsx/routes'   // { routes, errorPage, matchers }

export const app = defineApp({
  ...files,
  handle: async ({ event, resolve }) => {
    event.locals.user = event.cookies.get('user')   // chega em todo load como event.locals
    return resolve(event)
  },
})
```

```ts arquivo=src/routes/blog/+layout.server.ts
import type { LayoutServerLoad } from './$types'

export const load = (async ({ parent, locals }) => {
  const { site } = await parent()                   // dados de src/routes/+layout.server.ts
  return { secao: `${site} / Blog`, user: locals.user }
}) satisfies LayoutServerLoad                       // `satisfies` mantém o tipo do retorno para o $types
```

```ts arquivo=src/routes/blog/[slug]/+page.server.ts
import { error, fail } from '@repo/htsx/app'
import type { Actions, PageServerLoad } from './$types'

export const load = (async ({ params }) => {
  const post = posts[params.slug] ?? error(404, 'Post não existe')   // vai para o +error.tsx mais próximo
  return { post }
}) satisfies PageServerLoad

export const actions = {
  comentar: async ({ request }) => {                // <form method="post" action="?/comentar">
    const texto = String((await request.formData()).get('texto') ?? '')
    return texto ? { ok: texto } : fail(400, { erro: 'Escreva algo' })
  },
} satisfies Actions
```

```tsx arquivo=src/routes/blog/[slug]/+page.tsx
import type { PageProps } from './$types'

// data = { site, secao, user, post }: tudo dos layouts + o load da página, tipado
export default function Post({ data, form, params }: PageProps) {
  return (
    <article data-slug={params.slug}>
      <h1>{data.post}</h1>
      {form ? <p role="alert">{'erro' in form ? form.erro : form.ok}</p> : null}
    </article>
  )
}
```

Regras:
- Os `load` dos layouts rodam em paralelo, e cada `parent()` espera os de cima. Mesma chave: o nível de baixo vence.
- O `load` devolve objeto. O id da rota vem das pastas: `[slug]`, `[[opcional]]`, `[...rest]`, `[id=matcher]`, e os grupos `(nome)` não entram na URL.
- Uma requisição htmx parcial recebe só a página, sem layouts.
- Vale o `+error.tsx` mais próximo, mas sempre acima de um layout cujo `load` falhou. Ele aparece dentro dos layouts que carregaram. Se a própria página de erro falhar, sai uma versão simples, sem derrubar a resposta.
- `prerender` de um `+layout.server.ts` vale para as páginas abaixo, não para um `+server.ts` sozinho. Página com `actions` abaixo de um layout com `prerender` precisa de `export const prerender = false`.
- Nome de arquivo desconhecido, id de pasta inválido, a mesma URL em dois grupos e `+page.server.ts` sem `+page.tsx` dão erro já no `htsx sync`. `+page.tsx` sem `export default` dá erro ao montar as rotas.
- `route()` e as rotas por arquivos se misturam: `defineApp({ ...files, routes: [...files.routes, route('/x', {...})] })`.

### Modo estático — `buildStatic`

O build apaga e recria `outDir`, por isso recusa a raiz do projeto, uma pasta que contenha `src/` e a própria pasta `static`. Todas as rotas precisam de `prerender`. Se alguma precisar de servidor (ação, POST, `prerender: false`), o build falha e lista as rotas e as opções. O crawler segue os `<a href>` e falha se achar link quebrado. Também falha num endpoint sem extensão e numa rota com `prerender` que nenhuma página alcança.

```ts
// build.ts → bun build.ts
import { buildStatic } from '{{PKG}}/adapter-static'
import { defineApp, route } from '{{PKG}}/app'

const app = defineApp({ prerender: true, routes: [route('/', { page: () => 'Olá' })] })

export async function build() {
  // grava build/: páginas, 404.html, arquivos de static/ e Alpine/htmx em VENDOR_PATH
  return buildStatic(app, { outDir: 'build', assets: 'static' })
}
```

No modo estático, um `hx-get` para uma página recebe a página inteira. Para fragmentos, use rotas com `layout: false` ou `hx-select`.

### Modo Cloudflare Workers — `cloudflare` e `buildCloudflare`

Segue o `adapter-cloudflare` do SvelteKit. As rotas com `prerender` viram arquivos no Static Assets, servidos sem acordar o Worker. O resto roda no Worker, com `event.platform = { env, ctx, caches, cf }`.

```jsonc
// wrangler.jsonc (o build confere estas chaves e explica o que faltar)
{
  "name": "meu-site",
  "main": "src/worker.tsx",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_als"],
  "assets": { "binding": "ASSETS", "directory": ".htsx/cloudflare" }
}
```

```tsx
// src/worker.tsx — só liga o app ao Worker
import { cloudflare, cloudflarePlatform } from '{{PKG}}/adapter-cloudflare'
import { defineApp, route } from '{{PKG}}/app'

interface Env { SAUDACAO: string }

const app = defineApp({
  routes: [
    route('/ola', {
      load: event => {
        const { env, ctx } = cloudflarePlatform<Env>(event)   // erro claro fora do Worker ou no prerender
        ctx.waitUntil(Promise.resolve())                      // trabalho depois da resposta
        return env.SAUDACAO
      },
      page: ({ data }) => <p>{data}</p>,
    }),
  ],
})

// O manifesto vem do build: import manifest from '../.htsx/cloudflare-manifest.json'
export default cloudflare<Env>(app, { manifest: { prerendered: [] } })
```

```ts
// build.ts → bun build.ts && wrangler deploy
import { buildCloudflare } from '{{PKG}}/adapter-cloudflare/build'
import type { App } from '{{PKG}}/app'

export async function build(app: App) {
  // confere wrangler.jsonc; grava .htsx/cloudflare/ (pré-renderizadas, static/, vendor com cache immutable,
  // _headers e _redirects da raiz + os gerados, .assetsignore) e .htsx/cloudflare-manifest.json
  return buildCloudflare(app)
}
```

Em desenvolvimento e testes, `assetsFromDir('.htsx/cloudflare')` faz o papel do `env.ASSETS`: `worker.fetch(req, { ASSETS: await assetsFromDir(dir), ...vars }, ctx)`.

---

## Componentes

Componente é uma função de props para JSX. Pode ser `async`. Tipe `children` como `Children`.

```tsx
import { defineComponent, defineLayout, renderToString, type Children } from '{{PKG}}'

type Tone = 'neutral' | 'success' | 'danger'

export const Badge = defineComponent<{ tone?: Tone; children?: Children }>(({ tone = 'neutral', children }) => (
  <span class={`badge badge-${tone}`}>{children}</span>
))

// Repasse hx-*, x-*, $* e aria-* com uma assinatura por padrão de nome
export interface ButtonProps {
  children?: Children
  type?: 'button' | 'submit'
  [attr: `hx-${string}` | `x-${string}` | `$${string}` | `aria-${string}`]: unknown
}
export const Button = ({ children, type = 'button', ...attrs }: ButtonProps) => (
  <button type={type} class="btn" {...attrs}>{children}</button>
)

// defineLayout já inclui `children` nas props
export const Shell = defineLayout<{ title: string }>(({ title, children }) => (
  <main><h1>{title}</h1>{children}</main>
))

// Componente async busca os próprios dados
const UserName = async ({ id }: { id: string }) => {
  const user = await Promise.resolve({ id, name: 'Ana' })
  return <b>{user.name}</b>
}

const ok = true
const items = ['a', 'b']
export const html = await renderToString(() => (
  <Shell title="Painel">
    {ok ? <Badge tone="success">ok</Badge> : <Badge tone="danger">erro</Badge>}
    {ok && <UserName id="1" />}
    <ul>{items.map(i => <li>{i}</li>)}</ul>
    <Button hx-get="/refresh" hx-target="#rows">Atualizar</Button>
  </Shell>
))
```

Componentes prontos (Button, Field, Panel, Badge e tokens em variáveis CSS) ficam no pacote à parte `@repo/htsx-ui`: `import { Button, Field, Panel, Badge, uiCss } from '@repo/htsx-ui'` e `<style>{raw(uiCss)}</style>`. O núcleo nunca importa dele.

### Atributos

Os atributos são tipados por elemento, mais as famílias `hx-*`, `x-*`, `$*`, `aria-*` e `data-*`. Atributo inexistente (`clas=`) e `on*` são erros de compilação.

```
JSX                              HTML
class="a" / className="a"     →  class="a"
htmlFor, tabIndex, readOnly…  →  for, tabindex, readonly…
$click="n++"                  →  x-on:click="n++"
$submit_prevent="go()"        →  x-on:submit.prevent="go()"     (_ vira .)
x-bind-class="{ on: ok }"     →  x-bind:class="{ on: ok }"
x-model_lazy="q"              →  x-model.lazy="q"
hx-on-htmx-after-swap="…"     →  hx-on::after-swap="…"
disabled={true} / {false}     →  disabled / (omitido)
hx-boost={true}               →  hx-boost="true"
aria-expanded={false}         →  aria-expanded="false"
hx-vals={{ a: 1 }}            →  hx-vals='{"a":1}'              (objeto vira JSON)
style={{ fontSize: 12 }}      →  style="font-size: 12;"
null / undefined / key        →  (omitido)
```

---

## HTMX

```tsx
import { OOB, htmxResponse, hxTarget, isBoosted, isHtmx, renderToString } from '{{PKG}}'

// Botão que troca uma região sem recarregar
export const Refresh = () => (
  <button hx-get="/rows" hx-target="#rows" hx-swap="outerHTML">
    Atualizar <span class="htmx-indicator">...</span>
  </button>
)

// Carrega um painel quando a página abre
export const Stats = () => <div hx-get="/stats" hx-trigger="load"><p>Carregando...</p></div>

// Resposta principal + atualização fora do alvo (out-of-band)
export const saved = await renderToString(() => (
  <>
    <p>Salvo</p>
    <OOB target="unread-badge">3</OOB>
  </>
))

// Resposta com cabeçalhos HX-*: recebe a fábrica do conteúdo
export async function postItem(req: Request): Promise<Response> {
  void [isHtmx(req), isBoosted(req), hxTarget(req)]   // leitura dos cabeçalhos da requisição
  return htmxResponse(() => <p>Item salvo</p>, { trigger: 'itemSaved', pushUrl: '/itens' })
}
```

---

## Alpine.js

```tsx
import { raw, storeInit } from '{{PKG}}'

export const Toggle = () => (
  <div x-data="{ open: false }">
    <button $click="open = !open">Abrir</button>
    <div x-show="open" x-cloak>Conteúdo</div>
    <div x-bind-class="{ 'erro': !open }">...</div>
  </div>
)

// Store global simples: emita antes dos componentes que usam o store
export const Cart = () => (
  <div x-data>
    {raw(storeInit('cart', { items: [], total: 0 }))}
    <span x-text="$store.cart.total"></span>
  </div>
)
```

### `defineStore` — store tipado (state, derived, actions, effects)

O mesmo módulo serve o servidor e o cliente, com os mesmos tipos. Importe de `{{PKG}}/store` para o pacote do cliente não puxar código do servidor. `derived` vira getter, `effects` roda com `Alpine.effect`.

```ts
// stores/cart.ts
import { defineStore } from '{{PKG}}/store'

export interface Item { name: string; price: number }

export const cart = defineStore('cart', {
  state: { items: [] as Item[], coupon: '' },
  derived: { total: s => s.items.reduce((n, i) => n + i.price, 0) },
  actions: { add: (s, item: Item) => { s.items.push(item) } },
  effects: { title: s => { document.title = `Carrinho (${s.items.length})` } },
})

// Teste sem navegador
const c = cart.create({ items: [{ name: 'a', price: 10 }] })
c.add({ name: 'b', price: 5 })
if (c.total !== 15) throw new Error('total errado')
```

```tsx
// No servidor: só o estado inicial (safeJson). No cliente (client.ts, empacotado com
// Bun.build({ entrypoints: ['client.ts'], target: 'browser' })): cart.register(),
// carregado antes do Alpine.
import { defineStore } from '{{PKG}}/store'
import { raw } from '{{PKG}}'

const cart = defineStore('cart', { state: { items: [] as string[] }, derived: { count: s => s.items.length } })

export const Page = () => (
  <body x-data>
    {raw(cart.html({ items: ['a'] }))}
    <p x-text="$store.cart.count"></p>
  </body>
)
```

---

## `head()` e vendor

- `vendor: '/static/vendor/'` carrega as cópias do pacote (`{{PKG}}/vendor/*.min.js`), que o app serve. Use em produção.
- Sem `vendor`, usa CDN na versão fixada em `vendor/pins.json`, com `integrity` (SRI) e `crossorigin`.
- `version` diferente da fixada sai sem `integrity` (erro no modo estrito).
- Para atualizar os pinos: `bun run vendor` ou `bun scripts/vendor.ts alpinejs 3.18.0`. O script confere a integridade do pacote npm e regrava o sha256.

```ts
import { head } from '{{PKG}}'

export const HEAD = head({ title: 'App', description: 'Painel', htmx: true, alpine: true, nonce: 'abc', vendor: '/static/vendor/' })
```

---

## CSRF

O token é sempre ligado a um `sessionId`. O segredo precisa ter 32 caracteres ou mais.

```tsx
import { CsrfField, csrf, renderToString } from '{{PKG}}'

const SECRET = 'troque-por-um-segredo-com-32-caracteres-ou-mais'

// GET: assine antes de renderizar o formulário
export async function form(sessionId: string) {
  const token = await csrf.sign({ secret: SECRET, sessionId })
  return renderToString(() => (
    <form method="post" action="/salvar">
      <CsrfField token={token} />
      <button type="submit">Salvar</button>
    </form>
  ))
}

// POST: verifique antes de processar
export async function save(req: Request, sessionId: string): Promise<Response> {
  const data = await req.formData()
  const ok = await csrf.verify(String(data.get('_csrf') ?? ''), { secret: SECRET, sessionId })
  return ok ? new Response('ok') : new Response('Sessão inválida', { status: 403 })
}
```

---

## Flash messages

Mensagens assinadas num cookie, lidas na próxima requisição.

```ts
import { flash } from '{{PKG}}'

const SECRET = 'troque-por-um-segredo-com-32-caracteres-ou-mais'

// No redirect: grave
export async function afterSave(): Promise<Response> {
  const token = await flash.serialize([{ type: 'success', text: 'Salvo!' }], { secret: SECRET })
  return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': flash.setCookie(token) } })
}

// Na próxima requisição: leia e apague
export async function readFlash(cookieValue: string) {
  const messages = await flash.parse(cookieValue, { secret: SECRET })   // [] se inválido
  return { messages, clear: flash.clearCookie() }
}
```

---

## Formulários — `Form` e `Field`

`Field` mostra label, erro acessível (`aria-invalid`, `role="alert"`) e repõe o valor. Erros e valores vêm de `formContext`.

```tsx
import { Field, Form, formContext, renderPage } from '{{PKG}}'

export const html = await renderPage(
  () => (
    <Form action="/cadastro" method="post" csrf="token-assinado">
      <Field name="email" label="E-mail" type="email" required />
      <Field name="senha" label="Senha" type="password" />
      <button type="submit">Cadastrar</button>
    </Form>
  ),
  { context: formContext({ errors: { email: 'E-mail inválido' }, values: { email: 'x' } }) },
)
```

---

## Contexto por requisição

Passa dados a qualquer componente sem repassar props (usa `AsyncLocalStorage`).

```tsx
import { maybeContext, renderPage, useContext } from '{{PKG}}'

interface Ctx { user: { name: string } }

const Hello = () => {
  const { user } = useContext<Ctx>()   // lança erro fora de contexto
  return <h1>Olá, {user.name}</h1>
}
const Optional = () => <p>{maybeContext<Ctx>()?.user.name ?? 'visitante'}</p>

export const html = await renderPage(() => <><Hello /><Optional /></>, { context: { user: { name: 'Ana' } } })
```

### Cache por requisição — `cache`

Memoriza uma função dentro de uma renderização. Precisa de `cacheContext()` no contexto.

```tsx
import { cache, cacheContext, renderToString } from '{{PKG}}'

const getUser = cache(async (id: string) => ({ id, name: 'Ana' }))

const A = async () => <b>{(await getUser('1')).name}</b>
const B = async () => <i>{(await getUser('1')).name}</i>   // não busca de novo

export const html = await renderToString(() => <><A /><B /></>, { context: cacheContext() })
```

### `Suspense` e `ErrorBoundary`

`Suspense` emite o `fallback` na hora; o cliente busca o conteúdo pronto em `/_htsx/suspense/<id>` via htmx. `ErrorBoundary` troca a subárvore que falhou pelo `fallback`. Ele pega erros de componentes `async` (Promise rejeitada); um erro síncrono acontece antes, quando o JSX do filho é avaliado.

```tsx
import { ErrorBoundary, Suspense, renderPage, resolveSuspense, suspenseRegistry } from '{{PKG}}'

const Slow = async () => <p>{await Promise.resolve('pronto')}</p>
const Broken = async (): Promise<never> => { throw new Error('falhou') }

export const html = await renderPage(
  () => (
    <main>
      <Suspense id="lento" fallback={<p>Carregando...</p>}><Slow /></Suspense>
      <ErrorBoundary fallback={() => <p>Algo deu errado</p>} onError={err => console.error(err)}>
        <Broken />
      </ErrorBoundary>
    </main>
  ),
  { context: suspenseRegistry() },
)

// Rota que entrega o conteúdo: GET /_htsx/suspense/:id (mesmo contexto da renderização)
export const lento = (id: string) => resolveSuspense(id)
```

Não exiba `err.message` no `fallback` em produção: pode vazar caminhos ou segredos. Registre com `onError`.

### Server-Sent Events

```ts
import { sseEvent, sseResponse } from '{{PKG}}'

export function progress(req: Request): Response {
  return sseResponse(async function* () {
    for (let i = 1; i <= 3; i++) yield sseEvent({ step: i }, { name: 'progress' })
    yield sseEvent('fim', { name: 'done' })
  }, { signal: req.signal })
}
// Cliente: <div hx-ext="sse" sse-connect="/progress" sse-swap="done"></div>
```

---

## Testes — `{{PKG}}/testing`

Consultas ao HTML do servidor, sem navegador (usa `HTMLRewriter`, nativo no Bun e nos Workers):

```tsx
import { renderPage } from '{{PKG}}'
import { page } from '{{PKG}}/testing'

const p = await page(await renderPage(() => <html><body><h1>Oi</h1><form hx-post="/s"><button data-testid="enviar">Enviar</button></form></body></html>))
await p.text('h1')                 // 'Oi' — texto do 1º elemento (entidades decodificadas) ou null
await p.attr('form', 'hx-post')    // '/s' — atributo do 1º elemento ou null
await p.byTestId('enviar')         // { tag, attrs, text } do 1º [data-testid="enviar"] ou null
await p.find('button')             // todos os elementos, em ordem
```

Navegador real pelo Chrome DevTools Protocol (Chrome/Chromium da máquina ou `CHROME_PATH`; sem Playwright). `inspect()` e `set()` usam o inspetor de desenvolvimento: `{raw(inspector())}` no `<head>`, antes de qualquer `storeInit()`. Ele expõe `window.__htsx.inspect()` → `{ url, stores, data }` (chave de cada `x-data`: `#id`, `testid:<data-testid>` ou `x-data:<índice>`) e `__htsx.set(caminho, valor)`. **Só em desenvolvimento.**

```ts
import { findChrome, open } from '{{PKG}}/testing'

export async function e2e(handler: (req: Request) => Promise<Response>) {
  if (!findChrome()) return                           // pula onde não houver navegador
  const app = await open(handler, '/suporte')         // sobe o handler num servidor local e abre o Chrome
  await app.type('id:email', 'a@b.com')               // seletores: text:, id:, testid: ou CSS
  await app.press('text:Enviar')                      // clique real do mouse
  await app.waitFor('text:Recebemos sua mensagem')    // espera por condição (MutationObserver), sem sleep
  const state = await app.inspect()                   // { url, stores, data }
  await app.set('data.#menu.open', true)              // mesmo formato do inspect()
  await app.screenshot('suporte-enviado.png')
  await app.close()
  return state
}
```

---

## Boas práticas

### ✅ FAÇA

- Um arquivo por rota, devolvendo `renderPage` ou `renderToString`
- Detectar `isHtmx(req)` cedo e devolver só o **fragmento** quando a requisição for parcial
- Tipar props com `defineComponent` / `defineLayout` e `children?: Children`
- CSRF em todo form que altera estado (`POST`, `PUT`, `PATCH`, `DELETE`)
- Pré-calcular `head()` e CSS fora do handler (constante no módulo)
- `head({ vendor })` em produção, sem CDN
- Modo estrito (`HTSX_STRICT=1`) nos testes

### ❌ NÃO FAÇA

- ❌ React hooks (useState, useRef, useEffect): não existem aqui
- ❌ Importar de `{{PKG}}/src/*`: use só `{{PKG}}`, `{{PKG}}/store` e `{{PKG}}/testing`
- ❌ Devolver JSX direto da rota: sempre `await renderPage()` ou `await renderToString()` antes do `new Response()`
- ❌ Concatenar HTML com strings (`'<div>' + variavel`): use JSX para o escape funcionar
- ❌ Tipar `children?: unknown` ou usar `children as JSX.Element`: use `children?: Children`
- ❌ Atributo inexistente (`clas=`) ou `on*`: o compilador recusa; use `$click` (Alpine) ou `hx-on`
- ❌ Compartilhar `cache()` ou `Suspense` entre requisições sem contexto: lança erro de propósito
- ❌ `raw()` em conteúdo de usuário: o escape é a proteção contra XSS
