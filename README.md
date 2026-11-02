# htsx

Zero-dependency JSX SSR renderer for [HTMX](https://htmx.org) + [Alpine.js](https://alpinejs.dev). Write server-rendered HTML with JSX syntax — no React, no virtual DOM, no client bundle.

Works on **Bun**, **Node 18+**, **Cloudflare Workers**, and any runtime with Web APIs.

```tsx
export default {
  fetch: async (req: Request) => {
    const html = await renderPage(() => (
      <html lang="en">
        <head>
          <title>My App</title>
          {raw(head({ htmx: true, alpine: true }))}
        </head>
        <body>
          <h1 hx-get="/greeting" hx-trigger="load">...</h1>
        </body>
      </html>
    ))
    return new Response(html, { headers: { 'Content-Type': 'text/html' } })
  }
}
```

---

## Install

```bash
bun add htsx
# or
npm install htsx
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "htsx"
  }
}
```

---

## Security

htsx is **secure by default** — no configuration needed:

- All text content and attribute values are **HTML-escaped automatically**, including strings returned by components
- Plain text inside `<script>` / `<style>` **throws** — wrap trusted code in `raw()` (data: `raw(safeJson(x))`)
- Booleans in `aria-*` / `data-*` render as `"true"` / `"false"`
- `on*` event attributes (`onclick`, `onload`, etc.) are **blocked entirely**
- URLs in `href`, `src`, `action`, `formaction` — `javascript:`, `data:`, `blob:`, `vbscript:` → replaced with `#`
- Invisible Unicode characters stripped from URLs before protocol check
- CSS property values sanitized; invalid property names rejected
- Cookie names validated against RFC 6265 (blocks HTTP header injection)
- CSRF tokens use HMAC-SHA256 with timing-safe comparison

To insert trusted HTML, use [`raw()`](#rawhtml-string).

---

## Core Rendering

### `renderPage(factory, opts?)`

Renders a full page. Prepends `<!DOCTYPE html>`. Accepts an optional per-request `context`.

```tsx
const html = await renderPage(() => (
  <html>
    <body><h1>Hello</h1></body>
  </html>
))
// → '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>'
```

### `renderToString(factory, opts?)`

Renders a JSX fragment to string — no DOCTYPE. Same options as `renderPage`.

```tsx
const fragment = await renderToString(() => <p>Hello</p>)
// → '<p>Hello</p>'
```

### `raw(html: string)`

Marks a string as trusted HTML, bypassing escaping. Only use for server-generated content.

```tsx
<div>{raw('<b>trusted</b>')}</div>
// → <div><b>trusted</b></div>
```

### `head(opts)`

Emits `<script>` / `<link>` tags for HTMX and Alpine from CDN. Supports `nonce` for CSP.

```tsx
{raw(head({ htmx: true, alpine: true, nonce: 'abc123' }))}
```

---

## HTMX

All HTMX attributes (`hx-get`, `hx-post`, `hx-target`, `hx-swap`, `hx-trigger`, etc.) are available as typed JSX props on every element.

```tsx
<button
  hx-post="/like"
  hx-target="#count"
  hx-swap="outerHTML"
>
  Like
</button>
```

### `isHtmx(req)` / `isBoosted(req)`

```ts
if (isHtmx(req)) {
  // return partial HTML instead of full page
}
```

### `hxTarget(req)` / `hxTrigger(req)` / `hxCurrentUrl(req)`

Read HTMX request headers from a `Request` object.

### `htmxResponse(res, opts?)`

Adds HTMX response headers to a `Response`.

```ts
return htmxResponse(response, {
  trigger: 'itemAdded',      // HX-Trigger
  redirect: '/cart',         // HX-Redirect
  pushUrl: '/cart',          // HX-Push-Url
})
```

### `OOB({ target, swap?, tag?, children })`

Out-of-Band swap — updates a DOM element **outside** the main response target.

```tsx
// Updates #badge counter while also returning the main response
<OOB target="badge">3</OOB>
// → <div id="badge" hx-swap-oob="true">3</div>
```

---

## Alpine.js

Alpine directives are available as typed JSX props: `x-data`, `x-init`, `x-show`, `x-text`, `x-model`, `x-if`, `x-for`, `x-bind-*`, etc.

**Shorthand:** `$click`, `$submit`, `$input` → `x-on:click`, `x-on:submit`, `x-on:input`.

```tsx
<div x-data="{ open: false }">
  <button $click="open = !open">Toggle</button>
  <p x-show="open">Hello!</p>
</div>
```

### `storeInit(name, data, opts?)`

Emits a `<script>` that registers an `Alpine.store` on `alpine:init`. Data is serialized safely (XSS-safe — escapes `</script>`, `U+2028`, `U+2029`).

```tsx
{raw(storeInit('user', { name: 'Ana', count: 0 }))}
// → <script>document.addEventListener('alpine:init',()=>{Alpine.store('user',{"name":"Ana","count":0})})</script>
```

### `alpinePlugin(code, opts?)`

Emits a `<script>` running code inside `alpine:init`. Use for `Alpine.data()`, `Alpine.magic()`, `Alpine.directive()`. **Never pass user input** — static trusted JS only.

```ts
raw(alpinePlugin(`Alpine.data('dropdown', () => ({ open: false }))`))
```

---

## CSRF Protection

### `csrf.sign(secret)` / `csrf.verify(token, secret)`

```ts
const token = await csrf.sign(env.CSRF_SECRET)
const valid = await csrf.verify(req.headers.get('x-csrf-token') ?? '', env.CSRF_SECRET)
```

### `CsrfField({ secret })`

Renders `<input type="hidden" name="_csrf" value="...">` with a signed token.

```tsx
<form method="POST" action="/submit">
  <CsrfField secret={env.CSRF_SECRET} />
  <input name="email" type="email" />
  <button type="submit">Send</button>
</form>
```

---

## Flash Messages

```ts
// Set (on redirect response)
flash.set(response, { type: 'success', message: 'Saved!' }, env.SECRET)

// Get + clear (on next request)
const msg = await flash.get(request, env.SECRET)
// → { type: 'success', message: 'Saved!' } | null
```

---

## Forms

```tsx
// Wrap with formContext to pass errors from server-side validation
const ctx = formContext({ errors: { email: 'Invalid email' } })

const html = await renderPage(
  () => (
    <Form action="/register" method="post" csrf={env.SECRET}>
      <Field name="email" label="Email" type="email" />
      <Field name="password" label="Password" type="password" />
      <button type="submit">Register</button>
    </Form>
  ),
  { context: ctx }
)
```

---

## Request Context

Per-request `AsyncLocalStorage` context — pass data to any component without prop drilling.

```ts
const html = await renderPage(factory, {
  context: { user, db, env }
})

// Inside any component:
const { user } = useContext<{ user: User }>()
```

### `withContext(ctx, fn)` / `useContext<T>()` / `maybeContext<T>()`

```ts
// withContext: wraps your render function
await withContext({ user }, async () => renderToString(MyPage))

// useContext: throws if no context
const { user } = useContext<AppContext>()

// maybeContext: returns undefined if no context
const ctx = maybeContext<AppContext>()
```

---

## Per-Request Cache

Memoize expensive calls within a single render — avoids fetching the same data twice.

```ts
const user = await cache(
  () => db.users.findById(userId),
  { key: `user:${userId}` }
)
```

---

## Suspense

Emits a placeholder immediately; the client fetches resolved content via `hx-get`.

```tsx
// In your request handler:
const ctx = { ...suspenseRegistry() }

const html = await renderPage(
  () => (
    <Suspense fallback={<p>Loading...</p>}>
      {fetchExpensiveHtml()}
    </Suspense>
  ),
  { context: ctx }
)

// Endpoint that resolves the Suspense:
app.get('/_htsx/suspense/:id', async (c) => {
  return new Response(await resolveSuspense(c.req.param('id')))
})
```

---

## Server-Sent Events

```ts
return sseResponse(async function* () {
  for (let i = 0; i < 10; i++) {
    yield sseEvent({ count: i }, { event: 'tick' })
    await Bun.sleep(1000)
  }
})
```

---

## Error Handling

```tsx
<ErrorBoundary
  fallback={(err) => <p class="error">Something went wrong</p>}
  onError={(err) => logger.error(err)}
>
  {riskyComponent()}
</ErrorBoundary>
```

---

## Utility

### `clx(...classes)`

Conditional class names (like `clsx`).

```ts
clx('btn', isActive && 'btn-active', { 'btn-disabled': !canClick })
// → 'btn btn-active'
```

---

## TypeScript

```ts
import type { Component, ParentComponent, FC, RenderResult } from 'htsx'

const Card: Component<{ title: string }> = ({ title }) => (
  <div class="card"><h2>{title}</h2></div>
)

const Layout: ParentComponent = ({ children }) => (
  <main>{children}</main>
)
```

---

## License

MIT © htsx contributors
