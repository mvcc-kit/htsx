---
name: htsx
description: Use ao construir frontends SSR com JSX + HTMX + Alpine usando o pacote `{{PKG}}`. Acione quando o usuário pedir página/rota HTML, formulário, componente htmx/alpine, SSE, CSRF, flash messages, suspense, ou ao trabalhar em qualquer arquivo `.tsx` que renderize HTML (não React).
---

# {{PKG}} — Guia de uso

Lib zero-dep de SSR JSX para HTMX + Alpine. Roda em Bun/Workers/Node. **Não é React** — JSX compila para strings HTML, não elementos virtuais.

## Setup (1x por app)

```json
// tsconfig.json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "{{PKG}}" } }
```

```json
// package.json
{ "dependencies": { "{{PKG}}": "workspace:*" } }
```

Arquivos com JSX → extensão `.tsx`.

---

## Conceito central

- Todo JSX vira string HTML. `children` dentro de um componente é uma `string` (HTML já renderizado), não um node React.
- `HtmlSafeString` = string já escapada e segura para emitir.
- Tudo interpolado em JSX é **escaped automaticamente**.
- `raw(str)` bypassa o escape — use só para HTML gerado no server.
- String devolvida por componente também é escapada.
- Texto comum dentro de `<script>` ou `<style>` lança erro: use `raw()` (dados: `raw(safeJson(x))`).
- Booleano em `aria-*` e `data-*` vira `"true"` ou `"false"`.

---

## Renderizar

### Página completa — `renderPage`

Use em navegação direta. Adiciona `<!DOCTYPE html>`.

```tsx
import { renderPage, head, raw } from '{{PKG}}'

// Pré-compute scripts do head fora do handler (evita re-criar por request)
const HEAD_INNER = head({
  title: 'Meu App',
  scripts: [
    'https://cdn.jsdelivr.net/npm/htmx.org@2.0.10/dist/htmx.min.js',
    'https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js',
    'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  ],
})

export const getIndex = async (req: Request, env: Env): Promise<Response> => {
  const html = await renderPage(() => (
    <html lang="pt-br">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {raw(HEAD_INNER)}
        <style>{raw(`:root{color-scheme:dark} [x-cloak]{display:none!important}`)}</style>
      </head>
      <body class="bg-zinc-950 text-zinc-100">
        <h1>Olá</h1>
      </body>
    </html>
  ))
  return new Response(html, { headers: { 'content-type': 'text/html' } })
}
```

### Fragmento parcial — `renderToString`

Use em responses HTMX (sem DOCTYPE, sem layout).

```tsx
import { renderToString, isHtmx } from '{{PKG}}'

export const getDashboard = async (req: Request, env: Env): Promise<Response> => {
  const rows = await queryEmails(env)

  // HTMX pede só o fragmento atualizado
  if (isHtmx(req)) {
    const html = await renderToString(() => <EmailList rows={rows} />)
    return new Response(html, { headers: { 'content-type': 'text/html' } })
  }

  // Navegação direta → página completa
  const html = await renderPage(() => (
    <Layout>
      <AppShell active="dashboard">
        <EmailList rows={rows} />
      </AppShell>
    </Layout>
  ))
  return new Response(html, { headers: { 'content-type': 'text/html' } })
}
```

---

## Componentes

### `defineComponent` — componente com props tipadas

```tsx
import { defineComponent, type Children } from '{{PKG}}'

// Botão reutilizável com variantes e pass-through de attrs HTMX
export const Button = defineComponent<{
  children?: Children
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'danger'
  class?: string
  'hx-get'?: string
  'hx-target'?: string
  'hx-swap'?: string
}>(({ children, type = 'button', variant = 'secondary', class: className = '', ...attrs }) => {
  const styles = {
    primary:   'border-emerald-400 bg-emerald-300 text-zinc-950 hover:bg-emerald-200',
    secondary: 'border-zinc-600 bg-zinc-900 text-zinc-100 hover:bg-zinc-800',
    danger:    'border-red-500 bg-red-950 text-red-200 hover:bg-red-900',
  }
  return (
    <button
      type={type}
      class={`inline-flex min-h-10 items-center border px-4 py-2 text-sm font-semibold uppercase ${styles[variant]} ${className}`}
      {...attrs}
    >
      {children}
    </button>
  )
})

// Badge com tone semântico
type Tone = 'neutral' | 'success' | 'warning' | 'danger'
const toneClasses: Record<Tone, string> = {
  neutral: 'border-zinc-700 bg-zinc-900 text-zinc-200',
  success: 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300',
  warning: 'border-amber-500/50 bg-amber-950/60 text-amber-300',
  danger:  'border-red-500/50 bg-red-950/60 text-red-300',
}
export const Badge = defineComponent<{ children?: Children; tone?: Tone }>(
  ({ children, tone = 'neutral' }) => (
    <span class={`inline-flex border px-2 py-1 text-xs font-semibold uppercase ${toneClasses[tone]}`}>
      {children}
    </span>
  )
)

// Panel com header opcional
export const Panel = defineComponent<{
  children?: Children; title?: string; eyebrow?: string; class?: string
}>(({ children, title, eyebrow, class: className = '' }) => (
  <section class={`border border-zinc-800 bg-zinc-950/80 ${className}`}>
    {(title || eyebrow) ? (
      <header class="border-b border-zinc-800 px-4 py-3">
        {eyebrow ? <p class="text-xs font-semibold uppercase text-emerald-300">{eyebrow}</p> : null}
        {title  ? <h2 class="text-sm font-semibold uppercase text-zinc-100">{title}</h2>  : null}
      </header>
    ) : null}
    <div class="p-4">{children}</div>
  </section>
))
```

### `defineLayout` — layout que envolve children

```tsx
import { defineLayout } from '{{PKG}}'

// Layout raiz (html + head + body)
export const Layout = defineLayout(({ children }) => (
  <html lang="pt-br">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {raw(HEAD_INNER)}
      <style>{raw(CSS)}</style>
    </head>
    <body>{children}</body>
  </html>
))

// AppShell com nav lateral + props extras tipadas
export const AppShell = defineLayout<{ active?: 'dashboard' | 'settings' }>(
  ({ children, active }) => (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <div class="border-b border-zinc-800">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <a href="/dashboard" class="text-sm font-semibold uppercase">App</a>
          <form method="post" action="/logout" class="m-0">
            <Button type="submit" variant="secondary">Sair</Button>
          </form>
        </div>
      </div>
      <main class="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  )
)

// Uso — composição de layouts
const html = await renderPage(() => (
  <Layout>
    <AppShell active="dashboard">
      <div class="grid gap-6">
        <h1 class="text-2xl font-semibold">Inbox</h1>
        <EmailList rows={rows} />
      </div>
    </AppShell>
  </Layout>
))
```

---

## HTMX

Todos os atributos HTMX são props JSX tipadas em qualquer elemento.

### Padrão completo: botão de refresh + fragmento parcial

```tsx
// Componente que pode ser renderizado isolado ou dentro do layout
function EmailList({ rows }: { rows: EmailRow[] }) {
  return (
    <div id="email-list" class="border border-zinc-800">
      {rows.map((row) => (
        <a
          href={`/emails/${row.id}`}
          hx-get={`/emails/${row.id}`}
          hx-target="#email-modal"
          hx-swap="innerHTML"
          class="grid grid-cols-4 gap-4 px-4 py-3 hover:bg-zinc-900"
        >
          <span class="font-mono text-xs text-zinc-500">{row.date}</span>
          <span class="truncate text-zinc-200">{row.from}</span>
          <span class="truncate font-medium">{row.subject}</span>
          <Badge tone={row.status === 'processed' ? 'success' : 'danger'}>{row.status}</Badge>
        </a>
      ))}
    </div>
  )
}

// Botão que faz refresh sem recarregar a página
<Button
  hx-get="/dashboard"
  hx-target="#email-list"
  hx-swap="outerHTML"
>
  Atualizar <span class="htmx-indicator ml-2">...</span>
</Button>

// Container que recebe o detalhe do email via OOB
<div id="email-modal"></div>
```

### OOB swap — atualiza fora do target principal

```tsx
import { OOB } from '{{PKG}}'

// Retorna o conteúdo principal + atualiza badge em outro lugar do DOM
<>
  <EmailDetail email={email} />
  <OOB target="unread-badge">3</OOB>
</>
```

### htmxResponse — headers de resposta

```tsx
import { htmxResponse } from '{{PKG}}'

return htmxResponse(response, {
  trigger: 'emailSaved',  // dispara evento no cliente
  redirect: '/dashboard', // redireciona após sucesso
})
```

---

## Alpine.js

Atributos Alpine são props JSX tipadas. `$click` é shorthand para `x-on:click`.

```tsx
// Toggle + cloak
<div x-data="{ open: false }">
  <button $click="open = !open" class="btn">Abrir</button>
  <div x-show="open" x-cloak class="panel">Conteúdo</div>
</div>

// Bind de classe condicional
<div x-bind-class="{ 'bg-red-950': hasError, 'bg-zinc-950': !hasError }">
  ...
</div>
```

### storeInit — store global

```tsx
import { storeInit, raw } from '{{PKG}}'

// Emitir no <head> ou antes dos componentes que usam o store
{raw(storeInit('cart', { items: [], total: 0 }))}

// Em qualquer componente depois
<span x-text="$store.cart.total" />
<button $click="$store.cart.items.push(item)">Adicionar</button>
```

---

## CSRF

Token sempre bound a um `sessionId` para escopar por usuário/sessão.

```tsx
import { csrf, CsrfField } from '{{PKG}}'

// No handler GET — assinar antes de renderizar
const token = await csrf.sign({ secret: env.SESSION_SECRET, sessionId: userId })

// No JSX — CsrfField injeta o hidden input automaticamente
<form method="post" action="/login">
  <CsrfField token={token} />
  <input type="password" name="password" required />
  <Button type="submit" variant="primary">Entrar</Button>
</form>

// No handler POST — verificar antes de processar
const token = String(form.get('_csrf') ?? '')
const valid = await csrf.verify(token, { secret: env.SESSION_SECRET, sessionId: userId })
if (!valid) return new Response('Sessão inválida', { status: 403 })
```

---

## Context per-request

Passa dados para componentes sem prop drilling via AsyncLocalStorage.

```tsx
import { useContext } from '{{PKG}}'

// Passar no renderPage
const html = await renderPage(
  () => <Dashboard />,
  { context: { user, env } }
)

// Consumir em qualquer componente aninhado
const Dashboard = defineComponent(() => {
  const { user } = useContext<{ user: User; env: Env }>()
  return <h1>Olá, {user.name}</h1>
})
```

---

## Boas práticas

### ✅ FAÇA

- Um arquivo por rota, retornando `renderPage` ou `renderToString`
- Detectar `isHtmx(req)` cedo e retornar **fragmento** sem layout quando for parcial
- Usar `defineComponent` / `defineLayout` para tipar props
- Usar `defineLayout` para layouts que recebem `children`
- CSRF em todo form que muta estado (`POST`, `PUT`, `PATCH`, `DELETE`)
- Pré-computar `head()` e CSS fora do handler (constante no módulo)
- Passar HTMX attrs explicitamente na interface do componente quando necessário (`'hx-get'?: string`)

### ❌ NÃO FAÇA

- ❌ React hooks, useState, useRef, useEffect — não existem aqui
- ❌ Importar de `{{PKG}}/src/*` — use só o barrel `{{PKG}}`
- ❌ Retornar JSX direto da rota — sempre `await renderPage()` ou `await renderToString()` antes do `new Response()`
- ❌ Concatenar HTML com strings (`'<div>' + variavel`) — use JSX para o escape funcionar
- ❌ Usar `children` como React node — dentro de componentes já é string HTML renderizada
- ❌ Tipar `children?: unknown` ou usar `children as JSX.Element` — use `children?: Children` (exportado pelo pacote)
- ❌ Atributo inexistente (`clas=`) ou `on*` — o compilador recusa; use `$click` (Alpine) ou `hx-on`
- ❌ Compartilhar `cache()` ou `Suspense` entre requests sem `withContext` — lança erro intencionalmente
- ❌ Chamar `raw()` em conteúdo de usuário — escape é proteção contra XSS, não remova sem sanitizar
