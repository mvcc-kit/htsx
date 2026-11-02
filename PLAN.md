# htsx — JSX SSR renderer para Alpine.js + HTMX

> **H**TML + **T**ypeScript + **S**SR + **X** (Alpine/HTMX)  
> Pacote: `@repo/htsx`  
> Zero dependências externas. Funciona em Bun e Cloudflare Workers sem config extra.

---

## Por que `htsx`?

O nome carrega os três pilares do pacote:
- **HT** → HTML renderizado server-side + HTMX (atributos `hx-*` passam direto)
- **S** → SSR-only: retorna `string`, sem reconciliação, sem virtual DOM
- **X** → TSX como linguagem de template + Alpine (`x-*`, `$events`)

---

## Filosofia de divisão de responsabilidades

```
O servidor decide:              O Alpine decide:
──────────────────────          ──────────────────────────────
dados reais do banco            dropdown aberto/fechado
HTML inicial completo           modal visível ou oculto
estado que precisa persistir    tab selecionada localmente
validações de negócio           loading spinner ativo
ACL / permissões                foco, hover, transições visuais
                                contador local, toggle UI

Regra de ouro:
  Se o estado precisa sobreviver a um hx-swap → é dado do servidor.
  Se morre quando o elemento sai da DOM → é Alpine.
```

---

## Decisões de design

### 1. `$evento` para eventos Alpine (`x-on:*`)

`$` é válido em identificadores JSX. Mapeia direto para `x-on:`.  
`_` entre partes vira `.` (modificadores Alpine).

```
TSX                          HTML gerado
────────────────────────────────────────────────────────
$click="count++"          →  x-on:click="count++"
$click_prevent="fn()"     →  x-on:click.prevent="fn()"
$click_stop="fn()"        →  x-on:click.stop="fn()"
$click_outside="open=false"→  x-on:click.outside="open=false"
$click_window="fn()"      →  x-on:click.window="fn()"
$keydown_enter="fn()"     →  x-on:keydown.enter="fn()"
$keydown_enter_prevent    →  x-on:keydown.enter.prevent
$keydown_escape="fn()"    →  x-on:keydown.escape="fn()"
$keydown_shift_enter="fn()"→  x-on:keydown.shift.enter="fn()"
$submit_prevent="fn()"    →  x-on:submit.prevent="fn()"
$input="fn()"             →  x-on:input="fn()"
$change="fn()"            →  x-on:change="fn()"
$mouseenter="fn()"        →  x-on:mouseenter="fn()"
$mouseleave="fn()"        →  x-on:mouseleave="fn()"
$scroll_window="fn()"     →  x-on:scroll.window="fn()"
$load_window="fn()"       →  x-on:load.window="fn()"
$focus="fn()"             →  x-on:focus="fn()"
$blur="fn()"              →  x-on:blur="fn()"
$custom_event="fn()"      →  x-on:custom-event="fn()"
```

**Regra:** `$<evento>` → `x-on:<evento>` | `_` → `.`

### 2. `x-bind-*` para bindings Alpine (`x-bind:*`)

```
x-bind-class="expr"        →  x-bind:class="expr"
x-bind-style="expr"        →  x-bind:style="expr"
x-bind-href="expr"         →  x-bind:href="expr"
x-bind-aria-label="expr"   →  x-bind:aria-label="expr"
x-bind-disabled="expr"     →  x-bind:disabled="expr"
```

Hifens no nome do atributo são preservados automaticamente.

### 3. `x-*_*` para diretivas com modificadores Alpine

```
x-model_lazy="val"         →  x-model.lazy="val"
x-model_number="val"       →  x-model.number="val"
x-model_debounce_300ms="v" →  x-model.debounce.300ms="v"
x-transition_enter="class" →  x-transition.enter="class"
x-transition_leave="class" →  x-transition.leave="class"
x-intersect_enter="fn()"   →  x-intersect.enter="fn()"
x-collapse (sem valor)     →  x-collapse
```

### 4. Atributos que passam direto (sem transformação)

```
x-data="..."               →  x-data="..."        ✓
x-show="..."               →  x-show="..."        ✓
x-text="..."               →  x-text="..."        ✓
x-html="..."               →  x-html="..."        ✓
x-if="..."                 →  x-if="..."          ✓
x-for="..."                →  x-for="..."         ✓
x-ref="..."                →  x-ref="..."         ✓
x-cloak                    →  x-cloak             ✓
x-ignore                   →  x-ignore            ✓
x-effect="..."             →  x-effect="..."      ✓
x-id="..."                 →  x-id="..."          ✓
x-teleport="..."           →  x-teleport="..."    ✓
x-init="..."               →  x-init="..."        ✓
hx-get="..."               →  hx-get="..."        ✓
hx-post="..."              →  hx-post="..."       ✓
hx-*="..."                 →  hx-*="..."          ✓ (todos)
```

### 5. Aliases JSX padrão

```
className="..."            →  class="..."
htmlFor="..."              →  for="..."
```

### Tabela resumo de serialização de valores

```
Tipo do value                   Formato no HTML
────────────────────────────────────────────────────────────────────
string                       →  key="valor"
number                       →  key="42"
true + key HTML/Alpine/x-*   →  key               (atributo booleano)
true + key hx-*              →  key="true"         (string "true" para HTMX)
false | null | undefined     →  (omitido)
key === "key" (JSX key prop) →  (omitido silenciosamente)
object + key="style"         →  style="css-prop: val; ..."
object + hx-headers          →  hx-headers='{"key":"val"}'
object + hx-vals             →  hx-vals='{"key":"val"}'
object + hx-request          →  hx-request='{"key":"val"}'
object (outros)              →  key='{"key":"val"}'
array                        →  key='["a","b"]'
```

### 6. Automatic JSX transform (sem import obrigatório)

TypeScript 4.1+ injeta automaticamente o import do `jsx-runtime`:

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@repo/htsx"
  }
}
```

Nenhum arquivo `.tsx` precisa importar nada para usar JSX.

### 7. Serialização automática de objetos em atributos

Objetos passados como valor de atributo são serializados automaticamente, dependendo do atributo:

#### `style` → CSS string (camelCase → kebab-case)

```tsx
<div style={{ backgroundColor: '#fff', fontSize: '14px', marginTop: '8px' }} />
// → <div style="background-color: #fff; font-size: 14px; margin-top: 8px;">
```

Igual ao comportamento do React — converte camelCase para kebab-case e junta com `;`.

#### `hx-headers`, `hx-vals`, `hx-request` → JSON com aspas simples

HTMX requer que esses atributos sejam JSON. Passar um objeto serializa automaticamente com `JSON.stringify` e usa aspas simples no HTML para evitar conflito com as aspas duplas internas do JSON:

```tsx
<body hx-headers={{ "X-CSRF-TOKEN": csrfToken }}>
// → <body hx-headers='{"X-CSRF-TOKEN":"abc123"}'>

<form hx-vals={{ page: 1, filter: "active" }}>
// → <form hx-vals='{"page":1,"filter":"active"}'>

<div hx-request={{ timeout: 5000, credentials: "include" }}>
// → <div hx-request='{"timeout":5000,"credentials":"include"}'>
```

Isso é análogo ao `style` object — você escreve TSX tipado e o renderer serializa pro formato certo.

#### Qualquer outro atributo com objeto → `JSON.stringify` com aspas simples

Para atributos customizados ou Alpine (`x-data`, `hx-*` desconhecido), objetos também viram JSON:

```tsx
<div x-data={{ open: false, count: 0 }}>
// → <div x-data='{"open":false,"count":0}'>
```

> **Nota:** Para Alpine, passar `x-data` como objeto via TSX é conveniente mas perde as aspas simples internas necessárias para strings JS — prefira passar como string quando x-data contém strings: `x-data="{ name: 'João' }"`

#### Regra no algoritmo de serialização

```
se value é objeto (e não null, não array):
  se key === "style"
    → CSS string (camelCase → kebab-case, join com "; ")
  se key === "hx-headers" | "hx-vals" | "hx-request"
    → emite key='JSON.stringify(value)'   ← aspas simples
  senão
    → emite key='JSON.stringify(value)'   ← aspas simples

se value é array:
  → JSON.stringify(value) com aspas simples
```

### 8. HTML escaping por padrão

Todo conteúdo textual é escapado (`&`, `<`, `>`, `"`, `'`).  
Use `raw(html)` para injetar HTML sem escape (ex: `dangerouslySetInnerHTML`).

### 9. Void elements auto self-closing

```tsx
<input type="text" />   →  <input type="text">
<br />                  →  <br>
<img src="..." />       →  <img src="...">
```

### 10. `<script>` e `<style>` são raw text elements — sem escape interno

O algoritmo geral escapa todo conteúdo textual. Mas `<script>` e `<style>` são *raw text elements* — o browser nunca interpreta o conteúdo como HTML. Escapar quebraria o JS/CSS:

```tsx
// ❌ COM escaping (errado):
<script>{`const x = a && b > 0`}</script>
// → <script>const x = a &amp;&amp; b &gt; 0</script>   JS quebrado!

// ✅ SEM escaping (correto):
<script>{`const x = a && b > 0`}</script>
// → <script>const x = a && b > 0</script>

// Mesmo para style:
<style>{`.btn { color: red; }`}</style>
// → <style>.btn { color: red; }</style>   ✓ nunca escapa
```

Elementos raw text: `script`, `style`.  
Elementos que aceitam entities mas não tags (quasi-raw): `textarea`, `title` — escapar `<` e `>` nesses é correto.

**Regra no renderer:** se `tag === 'script' || tag === 'style'` → injetar children diretamente sem `escapeHtml`.

### 11. `true` em atributos `hx-*` → `="true"` (string), não booleano

O algoritmo trata `value === true` como atributo booleano HTML (emite só o nome do atributo). Correto para HTML nativo e Alpine, **errado para HTMX** — HTMX lê a string `"true"`, não a presença do atributo:

```tsx
// HTML nativo — correto como booleano
<input disabled />          → <input disabled>           ✅
<script defer />            → <script defer>             ✅
<div x-cloak />             → <div x-cloak>              ✅ (Alpine lê presença)

// HTMX — precisa da string "true", não do atributo booleano
<a hx-boost={true} />      → <a hx-boost>               ❌ HTMX ignora
<a hx-boost={true} />      → <a hx-boost="true">        ✅ HTMX funciona

<div hx-push-url={true} /> → <div hx-push-url="true">   ✅
<div hx-history-elt={true}/>→ <div hx-history-elt="true">✅
```

**Regra:** se `value === true` E `key.startsWith('hx-')` → emite `key="true"`.  
Caso contrário → emite só `key` (booleano HTML).

### 12. Filhos com valores especiais — comportamento de `0` e falsy

O renderer deve seguir o mesmo contrato do React para evitar surpresas:

```tsx
// false, null, undefined → renderiza NADA (condicional comum)
<div>{false}</div>         → <div></div>
<div>{null}</div>          → <div></div>
<div>{undefined}</div>     → <div></div>

// 0 → renderiza "0" (é number, não falsy para render)
<div>{0}</div>             → <div>0</div>     ✅
<div>{count}</div>         → <div>0</div>     ✅ quando count=0

// Armadilha clássica — igual ao React:
<div>{count && <span>items</span>}</div>
// quando count=0: renderiza "0", não o <span>
// isso é comportamento esperado/documentado, não bug

// Arrays de children — renderizados em sequência (sem separador)
<ul>{['a', 'b', 'c'].map(x => <li>{x}</li>)}</ul>
// → <ul><li>a</li><li>b</li><li>c</li></ul>
```

### 13. `key` prop é ignorado silenciosamente

Convenção JSX: `key` é usado pelo runtime para reconciliação. Em SSR puro não existe reconciliação, então `key` nunca deve aparecer no HTML:

```tsx
{items.map(item => <li key={item.id}>{item.name}</li>)}
// → <li>Item A</li><li>Item B</li>   ✅ key omitido
// não: <li key="1">Item A</li>       ❌ polui HTML
```

### 14. Mapeamento de atributos camelCase JSX → HTML lowercase

JSX usa convenções camelCase para vários atributos que o HTML espera lowercase ou com hífen. Passá-los direto gera HTML tecnicamente inválido (browsers toleram, mas validators e screen readers não):

```tsx
// Sem mapeamento → HTML inválido silencioso
<input tabIndex={0} />        → <input tabindex="0">        // tabIndex → tabindex
<input readOnly />            → <input readonly>             // readOnly → readonly
<input maxLength={10} />      → <input maxlength="10">       // maxLength → maxlength
<input minLength={3} />       → <input minlength="3">        // minLength → minlength
<input autoFocus />           → <input autofocus>            // autoFocus → autofocus
<input autoComplete="off" />  → <input autocomplete="off">   // autoComplete → autocomplete
<input inputMode="numeric" /> → <input inputmode="numeric">  // inputMode → inputmode
<meta charSet="UTF-8" />      → <meta charset="UTF-8">       // charSet → charset
<meta httpEquiv="..." />      → <meta http-equiv="...">      // httpEquiv → http-equiv
<td colSpan={2} />            → <td colspan="2">             // colSpan → colspan
<td rowSpan={2} />            → <td rowspan="2">             // rowSpan → rowspan
<form encType="..." />        → <form enctype="...">         // encType → enctype
<form noValidate />           → <form novalidate>            // noValidate → novalidate
<iframe allowFullScreen />    → <iframe allowfullscreen>     // allowFullScreen → allowfullscreen
<video autoPlay />            → <video autoplay>             // autoPlay → autoplay
<video crossOrigin="..." />   → <video crossorigin="...">    // crossOrigin → crossorigin
<label htmlFor="..." />       → <label for="...">            // htmlFor → for (já existia)
```

**Implementação:** mapa estático de ~20 entradas em `src/attrs.ts`:

```typescript
const JSX_TO_HTML_ATTRS: Record<string, string> = {
  className:       'class',
  htmlFor:         'for',
  tabIndex:        'tabindex',
  readOnly:        'readonly',
  maxLength:       'maxlength',
  minLength:       'minlength',
  autoFocus:       'autofocus',
  autoPlay:        'autoplay',
  autoComplete:    'autocomplete',
  inputMode:       'inputmode',
  charSet:         'charset',
  httpEquiv:       'http-equiv',
  colSpan:         'colspan',
  rowSpan:         'rowspan',
  encType:         'enctype',
  noValidate:      'novalidate',
  allowFullScreen: 'allowfullscreen',
  crossOrigin:     'crossorigin',
  cellPadding:     'cellpadding',
  cellSpacing:     'cellspacing',
  useMap:          'usemap',
  accessKey:       'accesskey',
  contentEditable: 'contenteditable',
}
```

### 15. Async components — busca de dados no próprio componente

Componentes `async` são o maior ganho de DX num SSR renderer. Permitem que cada componente busque seus próprios dados sem precisar pré-buscar e passar como prop:

```tsx
// ❌ Sem async — força pré-busca fora do componente (prop drilling)
async function handler(c: Context) {
  const user = await db.select().from(tb.users).where(eq(tb.users.id, c.var.userId)).get()
  const items = await db.select().from(tb.items).where(eq(tb.items.userId, c.var.userId))
  return c.html(renderPage(() => <Page user={user} items={items} />))
}

// ✅ Com async — cada componente é responsável pelos próprios dados
async function UserCard({ userId }: { userId: string }) {
  const user = await db.select().from(tb.users).where(eq(tb.users.id, userId)).get()
  return (
    <div x-data={storeInit('user', user)}>
      <span x-text="$store.user.name" />
    </div>
  )
}

async function ItemList({ userId }: { userId: string }) {
  const items = await db.select().from(tb.items).where(eq(tb.items.userId, userId))
  return (
    <ul>
      {items.map(item => <li key={item.id}>{item.name}</li>)}
    </ul>
  )
}

// renderPage e renderToString retornam Promise<string> quando factory é async
async function handler(c: Context) {
  return c.html(await renderPage(async () => (
    <html>
      <body>
        <UserCard userId={c.var.userId} />
        <ItemList userId={c.var.userId} />
      </body>
    </html>
  )))
}
```

**Impacto na assinatura:** `renderPage` e `renderToString` aceitam `() => string | Promise<string>` e retornam `Promise<string>` quando necessário. O `jsx-runtime` precisa usar `await` ao chamar componentes que retornem Promise.

**Nota:** componentes sync continuam funcionando normalmente — sem breaking change.

### 16. CSP nonce nos scripts CDN (completando a história de CSP)

O plano cobre nonce em `alpinePlugin()` e `storeInit()`, mas os próprios scripts de CDN também precisam de nonce quando CSP está ativo. `nonce` é um atributo HTML normal — passa direto pelo renderer:

```tsx
// ❌ CSP com 'nonce-only' policy bloqueia mesmo sendo CDN legítimo
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" />

// ✅ nonce resolve — atributo passa direto como qualquer outro
<script
  defer
  src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"
  nonce={env.CSP_NONCE}
/>
```

Documentar no exemplo do `Layout` para que o padrão completo fique visível de uma vez.

### 17. Segurança — vetores conhecidos e mitigações obrigatórias

Um SSR renderer é a linha de frente contra XSS. Cada uma destas mitigações **DEVE** estar implementada e testada:

#### 17.1. `</script>` em JSON dentro de `<script>` (script breakout)

```ts
storeInit('user', { bio: '</script><script>alert(1)</script>' })
// JSON.stringify produz: {"bio":"</script><script>alert(1)</script>"}
// O browser termina o <script> ao ver "</script>" → XSS imediato ❌
```

**Mitigação:** todo `JSON.stringify` que entra dentro de `<script>` ou em atributo HTML deve passar por `safeJson()`:

```typescript
// src/escape.ts
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')   // previne </script>, <!--, <script
    .replace(/>/g, '\\u003e')   // simetria
    .replace(/&/g, '\\u0026')   // previne entity smuggling
    .replace(/ /g, '\\u2028')  // line separator (quebra JS)
    .replace(/ /g, '\\u2029')  // paragraph separator
}
```

#### 17.2. Aspas simples em JSON dentro de atributo

```tsx
<div hx-headers={{ "X-Token": "ab'cd" }} />
// JSON.stringify produz: {"X-Token":"ab'cd"}
// Emitido: hx-headers='{"X-Token":"ab'cd"}'   ❌ apóstrofo fecha o atributo
```

**Mitigação:** depois de `safeJson()`, escapar `'` para `&#39;` (atributos com aspas simples) ou usar aspas duplas escapando `"` para `&quot;`. Padrão htsx: **aspas simples no atributo + `&#39;` no valor**:

```typescript
function attrJson(value: unknown): string {
  return safeJson(value).replace(/'/g, '&#39;')
}
// hx-headers='{"X-Token":"ab&#39;cd"}'   ✅ browser decodifica antes do HTMX parse
```

#### 17.3. Nome de atributo injetado via spread

```tsx
const userProps = { 'onclick': 'alert(1)', ... }   // veio de input não-validado
<div {...userProps}>                                // ❌ injeta event handler
```

JSX spread é comum e perigoso. **Mitigação:** `serializeAttrs` valida o nome do atributo contra um regex restritivo antes de emitir:

```typescript
const VALID_ATTR_NAME = /^[a-zA-Z_$][a-zA-Z0-9_:\-.$]*$/

// + denylist de event handlers HTML nativos (Alpine usa $ e x-on:, HTMX usa hx-on::)
const FORBIDDEN_ATTR_PREFIXES = ['on']   // onclick, onload, onerror, etc.

// Regra:
// - nome não casa VALID_ATTR_NAME → throw em dev, silently drop em prod
// - nome começa com "on" (não com "x-on" ou "hx-on") → silently drop
```

O htsx **nunca** emite atributos `onclick`, `onload`, etc. — Alpine (`$click`, `x-on:`) e HTMX (`hx-on::`) cobrem todos os casos legítimos. Bloquear `on*` é seguro.

#### 17.4. `raw()` é um escape hatch — documentar como `dangerous`

```typescript
// ❌ NUNCA
raw(userInput)
raw(`<div>${maybeUntrusted}</div>`)

// ✅ Só com fontes confiáveis (constantes literais, output de outro template htsx)
raw(storeInit('cfg', { /* dados do servidor */ }))
raw(head({ /* config */ }))
```

A doc do `raw()` precisa de aviso explícito. Em prod, considerar `unsafeRaw` como nome para tornar visível no review.

#### 17.5. URLs em `href`, `src`, `action`, `formaction`

O renderer não filtra `javascript:` URLs — responsabilidade do componente. **Recomendação documentada**: criar helper opt-in:

```typescript
export function safeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase()
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return '#'   // ou throw em dev
  }
  return url
}

// Uso: <a href={safeUrl(user.website)}>...</a>
```

Não obrigatório, mas documentado nos exemplos.

#### 17.6. CSP nonce nunca vem de user input

Documentar: o `nonce` em `head({ nonce })`, `storeInit(..., { nonce })`, `alpinePlugin(..., { nonce })` **deve** ser gerado pelo servidor por request (ex: `crypto.randomUUID()`). Nunca aceitar nonce de query string, header de cliente ou body.

#### 17.7. Style object — CSS injection

Valor de CSS pode conter `}`, `;`, `<`. O renderer **deve** escapar `<` e `>` no valor CSS para impedir quebra de `<style>` ou injeção de tag:

```typescript
function cssValue(v: string | number): string {
  return String(v).replace(/[<>]/g, '')   // remove silenciosamente caracteres perigosos
}
```

E nunca aceitar `style` como string com conteúdo arbitrário sem aviso (raw é a saída para esse caso).

---

## Estrutura de arquivos

```
pkg/htsx/
├── src/
│   ├── attrs.ts            ← serializeAttrs + JSX_TO_HTML_ATTRS + validação nomes
│   ├── escape.ts           ← escapeHtml/Attr + safeJson + attrJson + cssValue
│   ├── elements.ts         ← VOID_ELEMENTS + RAW_TEXT_ELEMENTS
│   ├── htmx-headers.ts     ← HX_HEADERS constantes
│   ├── jsx-runtime.ts      ← jsx, jsxs, Fragment, HtmlSafeString, renderChildren
│   └── helpers.ts          ← clx, storeInit, alpinePlugin, htmxResponse, head, safeUrl
├── __tests__/
│   ├── attrs.test.ts       ← unit: transformação de atributos + camelCase + spread injection
│   ├── escape.test.ts      ← unit: escaping + raw text + safeJson + attrJson + cssValue
│   ├── render.test.ts      ← integração: jsx → html + async + HtmlSafeString
│   ├── alpine.test.ts      ← integração: todas as diretivas + modificadores
│   ├── htmx.test.ts        ← integração: todos os atributos + hx-* boolean + objetos
│   ├── helpers.test.ts     ← unit: clx, storeInit, alpinePlugin, htmxResponse, head, safeUrl
│   ├── security.test.ts    ← vetores XSS: script breakout, JSON, spread, CSS, nonce
│   └── compat.test.ts      ← compat: Bun.serve + CF Workers (sem Node.js APIs)
├── index.ts                ← exports públicos + Component + FC + PropsWithChildren
├── jsx.d.ts                ← namespace JSX + GlobalAttrs + per-element types
├── package.json            ← sem build script, exports → .ts direto
└── tsconfig.json           ← noEmit: true, só para type checking
```

---

## Algoritmo de transformação de atributos (`src/attrs.ts`)

```
para cada [key, value] nos props:

  0. VALIDAÇÃO DE SEGURANÇA (executa antes de qualquer transformação):
     - key === "children" → ignora (tratado separadamente)
     - key === "key"      → ignora (JSX key prop nunca vai pro HTML)
     - key NÃO casa /^[a-zA-Z_$][a-zA-Z0-9_:\-.$]*$/ → ignora silenciosamente
     - key.toLowerCase().startsWith("on") E NÃO começa com "x-on" nem "hx-on"
       → ignora (bloqueia onclick, onload, onerror, etc.)

  1. value === null | undefined | false → omite o atributo

  2. value === true:
     se key.startsWith("hx-") → emite key="true"   (HTMX precisa da string)
     senão                    → emite key            (booleano HTML/Alpine)

  3. value é objeto (não null, não array):
     se key === "style"
       → para cada [prop, val]: escapa val com cssValue() (remove < e >)
       → emite style="prop-kebab: val; ..."   (aspas duplas; valores já seguros)
     senão
       → emite key='attrJson(value)'   ← safeJson + aspas simples escapadas

  4. value é array:
     → emite key='attrJson(value)'   ← mesmo helper safeJson + escape de '

  5. value é string ou number:
     → escapa value com escapeAttr() (escapa &, ", <, >)

  6. key está em JSX_TO_HTML_ATTRS:
     → emite JSX_TO_HTML_ATTRS[key]="<valor escapado>"
     // tabIndex → tabindex, charSet → charset, httpEquiv → http-equiv, etc.
     // (inclui className→class e htmlFor→for)

  7. key começa com "$":
     evento = key.slice(1).replace(/_/g, ".")
     → emite x-on:<evento>="<valor escapado>"

  8. key começa com "x-bind-":
     attr = key.slice(7)       // preserva hifens
     → emite x-bind:<attr>="<valor escapado>"

  9. key começa com "x-" E contém "_":
     → emite key.replace(/_/g, ".")="<valor escapado>"
     // x-model_lazy → x-model.lazy
     // x-transition_enter_active → x-transition.enter.active

 10. key começa com "hx-on-htmx-":
     → emite hx-on::<rest>="<valor escapado>"
     // hx-on-htmx-after-swap → hx-on::after-swap

 11. → emite key="<valor escapado>"  (passa direto: x-data, hx-get, etc.)
```

**Helpers de escape obrigatórios em `src/escape.ts`:**

```typescript
// para conteúdo entre tags HTML (texto)
export function escapeHtml(s: string): string
  // escapa: & < > " '

// para valor de atributo HTML (aspas duplas)
export function escapeAttr(s: string): string
  // escapa: & < > " (não precisa de ' porque attr é com aspas duplas)
  // < e > escapados aqui evitam quebra do parser em valores estranhos

// para JSON dentro de <script> ou atributo
export function safeJson(v: unknown): string
  // JSON.stringify + escapa <, >, &, U+2028, U+2029 como \uXXXX

// para JSON em atributo com aspas simples
export function attrJson(v: unknown): string
  // safeJson(v) com ' substituído por &#39;

// para valor CSS (string/number)
export function cssValue(v: string | number): string
  // remove < e > do valor
```

## Algoritmo de renderização de children (`src/jsx-runtime.ts`)

```
função renderChildren(children, ctx):
  // ctx.escape: boolean → se está dentro de <script>/<style>, escape=false
  // retorna: string | Promise<string>

  se children === null | undefined | false | true → ""
  se children é number          → String(children)            ← 0 renderiza!
  se children é string          → ctx.escape ? escapeHtml(children) : children
                                  // children pode ser HTML já renderizado por jsx()
                                  // — mas o sistema de tipos garante que strings
                                  // de jsx() chegam aqui via __html (raw) ou direto
                                  // como JSX.Element.
                                  // CONTRATO htsx: jsx() retorna string já-é-HTML;
                                  // texto literal precisa de escape.
                                  // (ver "Distinção HTML pronto vs texto" abaixo)
  se children tem __html        → children.__html             ← raw() sem escape
  se children é Promise         → return children.then(c => renderChildren(c, ctx))
  se children é array:
    resultados = children.map(c => renderChildren(c, ctx))
    se algum resultado é Promise:
      → return Promise.all(resultados).then(arr => arr.join(""))
            // PARALELO: todos os async children resolvem simultaneamente.
            // Importante para performance — sequencial seria O(n) latência.
    senão:
      → return resultados.join("")                            ← fast path sync
```

### Distinção HTML pronto vs texto literal — `HtmlSafeString`

O problema fundamental do SSR: o renderer precisa saber se uma `string` é HTML pronto (de `jsx()` ou `raw()`) ou texto literal (de interpolação) **em tempo de execução**:

```tsx
<div>
  <span>x</span>        {/* jsx() → HTML pronto, NÃO escapar */}
  {userName}            {/* texto literal, PRECISA escapar */}
</div>
```

Ambos chegam ao runtime como `string`. Sem distinção, escapar tudo causaria double-escape (`<span>` viraria `&lt;span&gt;`).

**Solução (mesma estratégia do Hono JSX, Pug, Marko):** `jsx()` retorna uma **subclasse de `String`** marcada como safe:

```typescript
// src/jsx-runtime.ts
export class HtmlSafeString extends String {
  // marcador estrutural — instanceof funciona em runtime
  readonly __htmlSafe = true
}

// raw() também retorna HtmlSafeString
export function raw(html: string): HtmlSafeString {
  return new HtmlSafeString(html)
}

// jsx() retorna HtmlSafeString (não string cru)
export function jsx(tag, props): HtmlSafeString | Promise<HtmlSafeString> { ... }

// renderChildren distingue:
function renderChildren(c, ctx): string | Promise<string> {
  if (c == null || c === false || c === true) return ''
  if (typeof c === 'number')                    return String(c)
  if (c instanceof HtmlSafeString)              return c.toString()     // ← sem escape
  if (typeof c === 'string')                    return ctx.escape ? escapeHtml(c) : c
  if (Array.isArray(c)) {
    const parts = c.map(x => renderChildren(x, ctx))
    return parts.some(p => p instanceof Promise)
      ? Promise.all(parts).then(a => a.join(''))
      : parts.join('')
  }
  if (c instanceof Promise) return c.then(v => renderChildren(v, ctx))
  return ''   // qualquer outra coisa (objeto, função solta) → ignora silenciosamente
}
```

**Por que `HtmlSafeString extends String`:**
- `instanceof HtmlSafeString` funciona em runtime sem hack
- `.toString()` automático em interpolação dá string crua quando necessário
- Tipo é compatível com `JSX.Element = string` em chamadas (subclasse de String)
- Componentes podem declarar retorno como `string` e funciona (TS aceita subtipo)

**Tipagem pública:**

```typescript
namespace JSX {
  type Element = string         // ergonomia para o dev
  // (jsx() retorna HtmlSafeString, que é uma string em todos os sentidos práticos)
}
```

**Por que isso é seguro:**
- Texto literal interpolado (`{userName}`) chega como `string` crua → escapado
- Resultado de `jsx()` chega como `HtmlSafeString` → preservado
- Único bypass: `raw(html)` — explicitamente marcado, code review pega
- `<script>` e `<style>` desligam o escape via `ctx.escape = false` (raw text elements)

---

## Suporte completo Alpine.js

### Diretivas (todas as 17 do core + plugins oficiais)

| TSX                          | HTML gerado                   | Notas              |
|------------------------------|-------------------------------|---------------------|
| `x-data="{ open: false }"`   | `x-data="{ open: false }"`    | estado do componente|
| `x-init="fn()"`              | `x-init="fn()"`               | init callback       |
| `x-show="open"`              | `x-show="open"`               | visibilidade        |
| `x-text="msg"`               | `x-text="msg"`                | conteúdo text       |
| `x-html="htmlStr"`           | `x-html="htmlStr"`            | conteúdo html raw   |
| `x-model="name"`             | `x-model="name"`              | two-way bind        |
| `x-model_lazy="val"`         | `x-model.lazy="val"`          | modifier            |
| `x-model_number="val"`       | `x-model.number="val"`        | modifier            |
| `x-model_debounce_500ms="v"` | `x-model.debounce.500ms="v"`  | modifier com valor  |
| `x-bind-class="expr"`        | `x-bind:class="expr"`         | binding dinâmico    |
| `x-bind-style="expr"`        | `x-bind:style="expr"`         | style dinâmico      |
| `x-bind-disabled="expr"`     | `x-bind:disabled="expr"`      | attr dinâmico       |
| `x-if="condition"`           | `x-if="condition"`            | condicional         |
| `x-for="item in list"`       | `x-for="item in list"`        | lista               |
| `x-ref="myEl"`               | `x-ref="myEl"`                | referência DOM      |
| `x-cloak`                    | `x-cloak`                     | anti-FOUC           |
| `x-ignore`                   | `x-ignore`                    | ignora componente   |
| `x-effect="expr"`            | `x-effect="expr"`             | side effect reativo |
| `x-id="['uid']"`             | `x-id="['uid']"`              | IDs acessíveis      |
| `x-teleport="#dest"`         | `x-teleport="#dest"`          | portals             |
| `x-transition`               | `x-transition`                | transição padrão    |
| `x-transition_enter="cls"`   | `x-transition.enter="cls"`    | enter class         |
| `x-transition_leave="cls"`   | `x-transition.leave="cls"`    | leave class         |
| `x-collapse`                 | `x-collapse`                  | plugin Collapse     |
| `x-intersect="fn()"`         | `x-intersect="fn()"`          | plugin Intersect    |
| `x-intersect_enter="fn()"`   | `x-intersect.enter="fn()"`    | modifier            |
| `x-mask="99/99/9999"`        | `x-mask="99/99/9999"`         | plugin Mask         |
| `x-sort`                     | `x-sort`                      | plugin Sort         |
| `x-anchor_bottom_start`      | `x-anchor.bottom-start`       | plugin Anchor       |
| `x-tooltip="expr"`           | `x-tooltip="expr"`            | diretiva custom     |

### Eventos (x-on:* via $)

Qualquer evento DOM ou custom. Modificadores separados por `_`:

```
Modificadores Alpine suportados:
  .prevent   .stop    .outside   .window   .document
  .once      .passive .capture   .self     .away
  .camel     .dot     .debounce  .throttle
  
Teclas de atalho:
  .enter  .tab  .delete  .escape  .space  .up  .down  .left  .right
  .shift  .ctrl .alt     .meta    .cmd    .key-name

Exemplos:
  $keydown_ctrl_enter="fn()"  →  x-on:keydown.ctrl.enter="fn()"
  $click_shift="fn()"         →  x-on:click.shift="fn()"
  $click_debounce_300ms="fn()"→  x-on:click.debounce.300ms="fn()"
```

### Magic properties (usados em expressões Alpine, não em atributos)

Não precisam de suporte especial no renderer — são expressões JavaScript passadas como strings nos atributos Alpine. Documentados nos tipos apenas:

```
$el       → elemento DOM atual
$refs     → { [refName]: HTMLElement }
$store    → acesso ao Alpine.store global
$watch    → watch('prop', callback)
$dispatch → dispara evento customizado no DOM
$nextTick → aguarda próximo tick do Alpine
$root     → raiz do componente Alpine
$data     → dados do componente atual
$id       → gera ID único acessível
```

---

## Suporte completo HTMX

### Atributos de request (passam direto)

| Atributo            | Descrição                              |
|---------------------|----------------------------------------|
| `hx-get`            | GET request                            |
| `hx-post`           | POST request                           |
| `hx-put`            | PUT request                            |
| `hx-patch`          | PATCH request                          |
| `hx-delete`         | DELETE request                         |

### Atributos de swap/target

| Atributo            | Valores possíveis                                              |
|---------------------|----------------------------------------------------------------|
| `hx-target`         | seletor CSS, `this`, `closest .class`, `next .class`          |
| `hx-swap`           | `innerHTML` `outerHTML` `beforebegin` `afterbegin` `beforeend` `afterend` `delete` `none` + modificadores `swap:Xms settle:Xms scroll:top show:top transition:true` |
| `hx-swap-oob`       | `true` ou seletor (out-of-band swap)                          |
| `hx-select`         | seletor CSS (seleciona parte da resposta)                      |
| `hx-select-oob`     | seletor out-of-band                                            |

### Atributos de trigger

| Atributo            | Exemplos                                                       |
|---------------------|----------------------------------------------------------------|
| `hx-trigger`        | `click` `change` `submit` `load` `revealed` `intersect` `every 5s` `keyup changed delay:500ms` `mouseenter once` `click[ctrlKey]` `click from:#btn` |

### Parâmetros

| Atributo            | Descrição                                              |
|---------------------|--------------------------------------------------------|
| `hx-vals`           | JSON inline: `'{"key": "val"}'`                        |
| `hx-headers`        | headers extra: `'{"X-Custom": "val"}'`                 |
| `hx-include`        | seletor de campos extras a incluir                     |
| `hx-params`         | `*` `none` `not field` `field1,field2`                 |
| `hx-encoding`       | `multipart/form-data`                                  |

### Histórico e URL

| Atributo            | Descrição                                              |
|---------------------|--------------------------------------------------------|
| `hx-push-url`       | `true` ou URL                                          |
| `hx-replace-url`    | `true` ou URL                                          |
| `hx-history`        | `false` (desativa cache)                               |
| `hx-history-elt`    | elemento a cachear (ao invés de `body`)                |

### UX e comportamento

| Atributo            | Descrição                                              |
|---------------------|--------------------------------------------------------|
| `hx-boost`          | `true` (progressive enhancement em links/forms)       |
| `hx-indicator`      | seletor do spinner (classe `htmx-request`)             |
| `hx-confirm`        | texto do `confirm()` antes do request                  |
| `hx-prompt`         | texto do `prompt()` enviado como header                |
| `hx-disable`        | desativa htmx no elemento                              |
| `hx-disinherit`     | `*` ou lista de atributos a não herdar                 |
| `hx-preserve`       | preserva elemento durante swap                         |
| `hx-sync`           | `closest form:abort` e outros                          |
| `hx-request`        | JSON com `credentials`, `noHeaders`, `timeout`         |
| `hx-validate`       | `true` (valida form antes)                             |
| `hx-ext`            | extensão: `json-enc,preload`                           |

### Eventos inline (`hx-on:*`)

```tsx
// HTMX v2+: hx-on com dois pontos → usa hifens no atributo JSX
// Regra: hx-on-htmx-after-swap → hx-on::after-swap no HTML

<div hx-on-htmx-after-swap="loading = false" />
// → hx-on::after-swap="loading = false"

// No renderer: "hx-on-htmx-" prefix → "hx-on::"
```

### Response headers que o servidor pode retornar

Documentados como constantes exportadas `HX_HEADERS`:

```typescript
export const HX_HEADERS = {
  Location:           'HX-Location',           // redirect SPA
  PushUrl:            'HX-Push-Url',            // atualiza URL
  Redirect:           'HX-Redirect',            // redirect HTTP
  Refresh:            'HX-Refresh',             // full refresh
  ReplaceUrl:         'HX-Replace-Url',         // replace URL
  Reswap:             'HX-Reswap',              // override hx-swap
  Retarget:           'HX-Retarget',            // override hx-target
  Reselect:           'HX-Reselect',            // override hx-select
  Trigger:            'HX-Trigger',             // dispara evento no cliente
  TriggerAfterSettle: 'HX-Trigger-After-Settle',
  TriggerAfterSwap:   'HX-Trigger-After-Swap',
} as const
```

---

## Estrutura dos arquivos de implementação

### `src/escape.ts`

```typescript
const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

// escape para conteúdo entre tags
export function escapeHtml(s: string): string
  // substitui & < > " ' por entidades

// escape para valor de atributo (assumindo aspas duplas no atributo)
export function escapeAttr(s: string): string
  // substitui & < > " por entidades (' OK porque aspas duplas envolvem)

// JSON dentro de <script> ou de atributo — previne script breakout
export function safeJson(value: unknown): string
  // JSON.stringify(value), depois:
  //   < → <    (impede </script> e <!--)
  //   > → >    (simetria)
  //   & → &    (impede entity smuggling)
  //   U+2028 →    (line separator quebra JS)
  //   U+2029 →    (paragraph separator)

// JSON para atributo com aspas simples (hx-vals, hx-headers, etc.)
export function attrJson(value: unknown): string
  // safeJson(value), depois ' → &#39;

// Valor CSS — remove caracteres que quebrariam <style> ou injetariam HTML
export function cssValue(v: string | number): string
  // String(v) com < e > removidos silenciosamente

// Validação de nome de atributo (defesa contra spread injection)
export const VALID_ATTR_NAME: RegExp
  // /^[a-zA-Z_$][a-zA-Z0-9_:\-.$]*$/

export function isUnsafeEventHandler(key: string): boolean
  // true se key começa com "on" (case-insensitive) E NÃO com "x-on" nem "hx-on"
  // bloqueia onclick, onload, onerror, onmouseover, etc.
```

### `src/elements.ts`

```typescript
// void elements — nunca têm tag de fechamento
export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

// raw text elements — children NÃO são HTML-escaped
export const RAW_TEXT_ELEMENTS = new Set([
  'script', 'style',
])
```

### `src/attrs.ts`

```typescript
// mapa de atributos JSX → HTML (camelCase e aliases)
export const JSX_TO_HTML_ATTRS: Record<string, string> = {
  className: 'class', htmlFor: 'for', tabIndex: 'tabindex',
  readOnly: 'readonly', maxLength: 'maxlength', minLength: 'minlength',
  autoFocus: 'autofocus', autoPlay: 'autoplay', autoComplete: 'autocomplete',
  inputMode: 'inputmode', charSet: 'charset', httpEquiv: 'http-equiv',
  colSpan: 'colspan', rowSpan: 'rowspan', encType: 'enctype',
  noValidate: 'novalidate', allowFullScreen: 'allowfullscreen',
  crossOrigin: 'crossorigin', cellPadding: 'cellpadding',
  cellSpacing: 'cellspacing', useMap: 'usemap', accessKey: 'accesskey',
  contentEditable: 'contenteditable',
}

// hx-on-htmx-* → hx-on::*
const HX_ON_RE = /^hx-on-htmx-(.+)$/

export function serializeAttrs(props: Record<string, unknown>): string
// retorna string de atributos HTML prontos para injetar no elemento
```

### `src/helpers.ts`

```typescript
// classes condicionais
export function clx(...args: Array<string | false | null | undefined>): string

// serializa dados do servidor → Alpine.store via alpine:init
export function storeInit(name: string, data: unknown, opts?: { nonce?: string }): string

// emite <script> com alpine:init listener
export function alpinePlugin(code: string, opts?: { nonce?: string }): string
```

### `src/jsx-runtime.ts`

```typescript
// HtmlSafeString — String subclass marcada como HTML pronto (não escapar)
export class HtmlSafeString extends String {
  readonly __htmlSafe = true as const
}

// jsx() — retorna HtmlSafeString (síncrono) ou Promise<HtmlSafeString> (async)
export function jsx(
  tag: string | ((props: Record<string, unknown>) => unknown),
  props: Record<string, unknown>
): HtmlSafeString | Promise<HtmlSafeString>

// jsxs — idêntico no SSR (sem reconciliação, sem distinção static/dynamic children)
export const jsxs = jsx

// Fragment — não emite wrapper, só concatena children
export function Fragment(props: { children?: unknown }): HtmlSafeString | Promise<HtmlSafeString>

// renderChildren — usado internamente por jsx() e pelos render functions
// retorna string (ou Promise<string>) — flat, pronto para concat
function renderChildren(c: unknown, ctx: { escape: boolean }): string | Promise<string>
//   null | undefined | false | true → ""
//   number (incluindo 0)            → String(n)
//   string (literal)                → escapeHtml(s)  exceto em script/style (ctx.escape=false)
//   HtmlSafeString                  → s.toString()   (já escapado/raw)
//   Promise                         → c.then(v => renderChildren(v, ctx))
//   array com Promise               → Promise.all(map).then(join)
//   array sem Promise               → map.join("")    (sync fast path)
//   outros (objeto, função)         → ""              (ignora silenciosamente)
```

### `index.ts` (exports públicos)

```typescript
// Suporta factory sync e async
export function renderPage(factory: () => string | Promise<string>): Promise<string>
// → "<!DOCTYPE html>" + await factory()

export function renderToString(factory: () => string | Promise<string>): Promise<string>
// → await factory() sem doctype (fragmentos HTMX / partial renders)

export function raw(html: string): HtmlSafeString
// → marca string como HTML pronto (não escapado em renderChildren)
// ⚠️ NUNCA passar dados de usuário aqui. Renomeie a importação como
//    `unsafeRaw` no projeto se quiser que o code review pegue casos suspeitos.

export function clx(...args: Array<string | false | null | undefined>): string
// → junta classes filtrando falsy

export function storeInit(name: string, data: unknown, opts?: { nonce?: string }): string
// → <script> com Alpine.store() via alpine:init

export function alpinePlugin(code: string, opts?: { nonce?: string }): string
// → <script> com alpine:init listener

export function htmxResponse(
  factory: () => string | Promise<string>,
  opts?: {
    trigger?:   string | Record<string, unknown>  // HX-Trigger (string ou JSON)
    retarget?:  string                            // HX-Retarget
    reswap?:    string                            // HX-Reswap
    reselect?:  string                            // HX-Reselect
    pushUrl?:   string                            // HX-Push-Url
    redirect?:  string                            // HX-Redirect
    refresh?:   boolean                           // HX-Refresh: true
    status?:    number                            // HTTP status (default 200)
  }
): Promise<Response>
// → new Response(await renderToString(factory), { headers: { Content-Type + HX-* } })

export function head(opts: {
  title?:       string
  description?: string
  charset?:     string                 // default "UTF-8"
  viewport?:    string                 // default "width=device-width, initial-scale=1"
  styles?:      string[]               // hrefs de CSS
  scripts?:     Array<string | { src: string; defer?: boolean; type?: string }>
  alpine?:      boolean | { version?: string; plugins?: AlpinePluginName[] }
  htmx?:        boolean | { version?: string }
  nonce?:       string                 // aplicado em todos os scripts inline
}): string
// → string com todo o conteúdo do <head> gerado

export const HX_HEADERS: typeof import('./src/htmx-headers').HX_HEADERS
// → constantes de response headers HTMX

// Type helpers para componentes

// Primário: sync + async unificados, sem children por default
export type Component<P = {}> = (props: P) => JSX.Element | Promise<JSX.Element>

// Componente que aceita children (opt-in explícito)
// children é string porque JSX.Element = string e o runtime renderiza antes de passar
export type ParentComponent<P = {}> = Component<P & { children?: string }>

// Alias para memória muscular do React
export type FC<P = {}> = Component<P>

// Helper quando precisar declarar props com children manualmente
export type PropsWithChildren<P = {}> = P & { children?: string }

// Factory functions — alternativa ergonômica às anotações de tipo explícitas

// Identity em runtime, mas força a tipagem correta sem importar o tipo separado
export function defineComponent<P = {}>(fn: Component<P>): Component<P>

// Injeta children?: string automaticamente nos props — ideal para layouts
export function defineLayout<P = {}>(fn: ParentComponent<P>): ParentComponent<P>

// Re-export para uso manual se necessário
export { jsx, jsxs, Fragment } from './src/jsx-runtime'
```

---

## Helpers de DX (`index.ts`)

### `clx()` — classes condicionais

Equivalente ao `cn()` / `clsx` — junta classes filtrando valores falsy. Essencial para qualquer template:

```tsx
import { clx } from '@repo/htsx'

// Básico
<div class={clx('btn', 'btn-primary')} />
// → <div class="btn btn-primary">

// Com condicionais
<div class={clx('btn', isActive && 'btn-active', isDisabled && 'btn-disabled')} />
// isActive=true, isDisabled=false → <div class="btn btn-active">

// Com variantes
<button class={clx(
  'px-4 py-2 rounded',
  variant === 'primary' && 'bg-blue-600 text-white',
  variant === 'ghost'   && 'bg-transparent border',
  size === 'sm'         && 'text-sm',
)}>

// Ignora: false, null, undefined, '' (string vazia)
clx('a', false, null, undefined, '', 'b')  →  "a b"
```

**Implementação:** ~5 linhas.

```typescript
export function clx(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(' ')
}
```

### `storeInit()` — serializar dados do servidor para Alpine.store

O padrão central da filosofia server/Alpine: transferir dados reais do servidor para estado Alpine de forma segura, sem expor lógica de fetch no cliente:

```tsx
import { storeInit } from '@repo/htsx'

// No servidor (rota Hono):
const user = await db.select().from(tb.users).where(eq(tb.users.id, userId)).get()
const items = await db.select().from(tb.items).where(eq(tb.items.userId, userId))

// No template:
{raw(storeInit('user', user))}
{raw(storeInit('items', items))}

// HTML emitido:
// <script>document.addEventListener('alpine:init',()=>{Alpine.store('user',{"id":"123","name":"João"})})</script>
// <script>document.addEventListener('alpine:init',()=>{Alpine.store('items',[{"id":1,"name":"Item A"}])})</script>

// No Alpine (client) — sem nenhum fetch:
<span x-text="$store.user.name" />
<template x-for="item in $store.items">
  <li x-text="item.name" />
</template>
```

Também aceita `nonce` para CSP:

```tsx
{raw(storeInit('user', user, { nonce: env.CSP_NONCE }))}
// → <script nonce="abc123">document.addEventListener(...)
```

**Implementação (com `safeJson` para impedir script breakout):**

```typescript
import { safeJson, escapeAttr } from './escape'

const STORE_NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

export function storeInit(
  name: string,
  data: unknown,
  opts?: { nonce?: string }
): string {
  // Nome do store entra como string JS — validar para evitar injeção
  if (!STORE_NAME_RE.test(name)) {
    throw new Error(`storeInit: invalid store name "${name}"`)
  }
  const json = safeJson(data)                                     // < → <, etc.
  const nonce = opts?.nonce ? ` nonce="${escapeAttr(opts.nonce)}"` : ''
  return `<script${nonce}>document.addEventListener('alpine:init',()=>{Alpine.store('${name}',${json})})</script>`
}
```

**Por que `safeJson`:** se `data.bio === "</script><script>alert(1)</script>"`, `JSON.stringify` cru emite a string literal e o browser termina o `<script>` ali — XSS direto. `safeJson` converte `<` para `<`, que o parser JSON aceita mas o parser HTML não reconhece como fim de tag.

### `htmxResponse()` — builder de resposta HTMX

Todo endpoint HTMX retorna HTML parcial com headers opcionais. `htmxResponse` elimina o boilerplate repetitivo e garante o `Content-Type` correto sempre:

```tsx
import { htmxResponse } from '@repo/htsx'

// Rota Hono que retorna fragmento HTML para HTMX
app.post('/api/counter/increment', auth(), async (c) => {
  const { db, tb, eq } = getD1(c.env.DB)
  await db.update(tb.counters).set({ value: sql`value + 1` }).where(...)
  const { value } = await db.select().from(tb.counters)...

  // ❌ Sem helper — verboso
  return new Response(
    await renderToString(() => <Counter value={value} />),
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'HX-Trigger': 'counterUpdated',
        'HX-Retarget': '#counter',
      }
    }
  )

  // ✅ Com helper
  return htmxResponse(() => <Counter value={value} />, {
    trigger: 'counterUpdated',
    retarget: '#counter',
  })
})

// trigger pode ser string (evento simples) ou objeto (múltiplos eventos com dados)
return htmxResponse(() => <List items={items} />, {
  trigger: { itemAdded: { id: newItem.id }, listUpdated: true },
  reswap: 'beforeend',
  status: 201,
})

// redirect após ação (ex: form POST bem-sucedido)
return htmxResponse(() => <></>, {
  redirect: '/dashboard',
})
```

### `head()` — geração de `<head>` sem boilerplate

Toda página repete a mesma estrutura. `head()` gera o conteúdo interno do `<head>` com defaults sensatos:

```tsx
import { head } from '@repo/htsx'

function Layout({ title, nonce, children }: PropsWithChildren<{ title: string; nonce?: string }>) {
  return (
    <html lang="pt-BR">
      <head>
        {raw(head({
          title,
          description: 'Aplicação app',
          alpine: { plugins: ['collapse', 'intersect'] },  // só os que precisa
          htmx: true,
          styles: ['/app.css'],
          nonce,
        }))}
      </head>
      <body hx-boost="true">{children}</body>
    </html>
  )
}

// HTML gerado:
// <meta charset="UTF-8">
// <meta name="viewport" content="width=device-width, initial-scale=1">
// <title>Minha Página</title>
// <meta name="description" content="Aplicação app">
// <link rel="stylesheet" href="/app.css">
// <script type="module" nonce="...">
//   import Alpine from 'https://esm.sh/alpinejs@3'
//   import Collapse from 'https://esm.sh/@alpinejs/collapse@3'
//   import Intersect from 'https://esm.sh/@alpinejs/intersect@3'
//   Alpine.plugin([Collapse, Intersect])
//   Alpine.start()
// </script>
// <script src="https://unpkg.com/htmx.org@2/dist/htmx.min.js" nonce="..."></script>
```

**Plugins Alpine são opcionais e seletivos** — `alpine: true` carrega só o core; `alpine: { plugins: ['mask', 'persist'] }` carrega só os especificados. Isso é o padrão recomendado: não carregar todos quando precisa de dois.

**Implementação (`src/helpers.ts`):**

```typescript
import { escapeHtml, escapeAttr } from './escape'

const ALPINE_CDN = (v: string) => `https://cdn.jsdelivr.net/npm/alpinejs@${v}/dist/cdn.min.js`
const ALPINE_PLUGIN_CDN = (v: string, name: string) => `https://cdn.jsdelivr.net/npm/@alpinejs/${name}@${v}/dist/cdn.min.js`
const HTMX_CDN = (v: string) => `https://unpkg.com/htmx.org@${v}/dist/htmx.min.js`

const ALPINE_DEFAULT_VERSION = '3.x.x'
const HTMX_DEFAULT_VERSION = '2.x.x'

export interface HeadOpts {
  title?:       string
  description?: string
  charset?:     string                                 // default "UTF-8"
  viewport?:    string                                 // default "width=device-width, initial-scale=1"
  styles?:      string[]                               // hrefs CSS
  scripts?:     Array<string | { src: string; defer?: boolean; type?: string; async?: boolean }>
  alpine?:      boolean | { version?: string; plugins?: AlpinePluginName[] }
  htmx?:        boolean | { version?: string }
  nonce?:       string                                 // aplicado em todos scripts
}

export function head(opts: HeadOpts = {}): string {
  const parts: string[] = []
  const nonceAttr = opts.nonce ? ` nonce="${escapeAttr(opts.nonce)}"` : ''

  // 1. charset PRIMEIRO (HTML5 spec — deve estar nos primeiros 1024 bytes)
  parts.push(`<meta charset="${escapeAttr(opts.charset ?? 'UTF-8')}">`)

  // 2. viewport
  parts.push(`<meta name="viewport" content="${escapeAttr(opts.viewport ?? 'width=device-width, initial-scale=1')}">`)

  // 3. title e description
  if (opts.title)       parts.push(`<title>${escapeHtml(opts.title)}</title>`)
  if (opts.description) parts.push(`<meta name="description" content="${escapeAttr(opts.description)}">`)

  // 4. styles
  for (const href of opts.styles ?? []) {
    parts.push(`<link rel="stylesheet" href="${escapeAttr(href)}">`)
  }

  // 5. alpine (com plugins seletivos via CDN, sem ESM dependency)
  if (opts.alpine) {
    const cfg     = typeof opts.alpine === 'object' ? opts.alpine : {}
    const version = cfg.version ?? ALPINE_DEFAULT_VERSION
    const plugins = cfg.plugins ?? []
    // plugins ANTES do core (Alpine.plugin precisa estar registrado antes do start)
    for (const p of plugins) {
      parts.push(`<script defer src="${escapeAttr(ALPINE_PLUGIN_CDN(version, p))}"${nonceAttr}></script>`)
    }
    parts.push(`<script defer src="${escapeAttr(ALPINE_CDN(version))}"${nonceAttr}></script>`)
  }

  // 6. htmx
  if (opts.htmx) {
    const cfg     = typeof opts.htmx === 'object' ? opts.htmx : {}
    const version = cfg.version ?? HTMX_DEFAULT_VERSION
    parts.push(`<script src="${escapeAttr(HTMX_CDN(version))}"${nonceAttr}></script>`)
  }

  // 7. scripts customizados (sempre por último — depois de Alpine/HTMX)
  for (const s of opts.scripts ?? []) {
    if (typeof s === 'string') {
      parts.push(`<script src="${escapeAttr(s)}"${nonceAttr}></script>`)
    } else {
      const attrs: string[] = [`src="${escapeAttr(s.src)}"`]
      if (s.defer) attrs.push('defer')
      if (s.async) attrs.push('async')
      if (s.type)  attrs.push(`type="${escapeAttr(s.type)}"`)
      if (opts.nonce) attrs.push(`nonce="${escapeAttr(opts.nonce)}"`)
      parts.push(`<script ${attrs.join(' ')}></script>`)
    }
  }

  return parts.join('\n')
}
```

**Decisões de design do `head()`:**

- **CDN-based, não ESM** — `<script defer>` é mais resiliente que `<script type="module">` (não bloqueia parse, funciona em todos browsers, mais simples para CSP).
- **Plugins antes do core** — Alpine registra plugins via `window.deferLoadingAlpine`; carregar plugin antes evita race condition.
- **Scripts custom por último** — permite que código do projeto use Alpine/HTMX já carregados.
- **Nenhum dado de usuário** entra no output sem `escapeAttr` ou `escapeHtml`.
- **Versões com major fixo (`3.x.x`, `2.x.x`)** — pega últimas atualizações de segurança; projetos sensíveis devem fixar versão exata via `head({ alpine: { version: '3.13.5' } })`.

### `alpinePlugin()` — agora com suporte a `nonce`

```tsx
// Antes (sem nonce):
alpinePlugin(`Alpine.directive('tooltip', ...)`)
// → <script>document.addEventListener('alpine:init',()=>{...})</script>

// Com nonce (CSP):
alpinePlugin(`Alpine.directive('tooltip', ...)`, { nonce: env.CSP_NONCE })
// → <script nonce="abc123">document.addEventListener('alpine:init',()=>{...})</script>
```

**Assinatura atualizada:**

```typescript
export function alpinePlugin(
  code: string,
  opts?: { nonce?: string }
): string {
  // `code` é confiável (fonte do desenvolvedor) — não passa por safeJson
  // Mas `nonce` pode vir de env: escapar como attr
  const nonce = opts?.nonce ? ` nonce="${escapeAttr(opts.nonce)}"` : ''
  return `<script${nonce}>document.addEventListener('alpine:init',()=>{${code}})</script>`
}
```

> **Importante:** `code` é fonte do desenvolvedor — equivalente a `raw()`. Nunca interpolar dados de usuário dentro de `code`. Se precisar passar dados, use `storeInit()` (que serializa com `safeJson`).

---

## Alpine plugins — modular e seletivo

O renderer não faz nada especial para plugins — os atributos passam direto. O que muda é **como carregar**: carregue só o que o projeto usa.

### Catálogo de plugins disponíveis

| Plugin | Nome | Atributo/magic | Quando usar |
|--------|------|----------------|-------------|
| Mask   | `mask` | `x-mask` | Formatação de inputs (CPF, telefone, data) |
| Persist | `persist` | `$persist` magic | Persistir estado no localStorage entre reloads |
| Focus  | `focus` | `x-trap` | Armadilha de foco (modals, dialogs) |
| Collapse | `collapse` | `x-collapse` | Expandir/colapsar com animação de altura |
| Intersect | `intersect` | `x-intersect` | Detectar quando elemento entra na viewport |
| Sort   | `sort` | `x-sort` | Drag-and-drop reordenável |
| Anchor | `anchor` | `x-anchor` | Posicionar tooltips/popovers relativos a um elemento |
| Morph  | `morph` | via HTMX `hx-ext="morph"` | Swap HTMX preservando estado Alpine |

### Uso seletivo via `head()` (recomendado)

```tsx
// Carrega só o que o projeto usa — não carrega tudo
{raw(head({
  alpine: { plugins: ['mask', 'persist'] },   // só esses dois
}))}

// alpine: true → só o core, zero plugins
// alpine: { plugins: [] } → core sem plugins (equivalente)
// alpine: { plugins: ['mask', 'collapse', 'intersect'] } → 3 plugins
```

### Uso manual via CDN quando precisar de mais controle

```tsx
{raw(`<script type="module" nonce="${nonce}">
  import Alpine from 'https://esm.sh/alpinejs@3'
  import Collapse from 'https://esm.sh/@alpinejs/collapse@3'
  import Intersect from 'https://esm.sh/@alpinejs/intersect@3'
  Alpine.plugin([Collapse, Intersect])
  Alpine.start()
</script>`)}
```

### Uso nos templates (tipagem via `jsx.d.ts`)

```tsx
// Mask — formata input CPF/telefone/data
<input x-mask="999.999.999-99" type="text" placeholder="CPF" />
<input x-mask="(99) 99999-9999" type="text" placeholder="Telefone" />

// Persist — estado que sobrevive ao reload
<div x-data="{ tab: $persist('home') }">
  <button $click="tab = 'home'">Home</button>
  <button $click="tab = 'profile'">Perfil</button>
</div>

// Focus (x-trap) — modal com foco preso internamente
<div x-trap="open" role="dialog">
  <button>Botão dentro do modal</button>
</div>

// Collapse — altura animada ao mostrar/ocultar
<div x-collapse x-show="open">
  Conteúdo que expande e colapsa suavemente
</div>

// Intersect — lazy load quando entra na viewport
<div x-intersect_enter="visible = true" x-data="{ visible: false }">
  <span x-show="visible">Carregado ao aparecer na tela</span>
</div>

// Sort — drag-and-drop
<ul x-sort="handleSort($item, $position)">
  <li x-sort-handle>⠿ Item A</li>
  <li x-sort-handle>⠿ Item B</li>
</ul>

// Anchor — tooltip posicionado em relação a um botão
<div x-data="{ open: false }">
  <button x-ref="btn" $click="open = !open">Hover</button>
  <div x-anchor_bottom_start="$refs.btn" x-show="open">Tooltip aqui</div>
</div>
```

### Alpine Morph + HTMX — swaps que preservam estado Alpine

O maior problema de HTMX + Alpine: um `hx-swap="innerHTML"` destrói o estado Alpine do elemento (dropdowns abertos voltam a fechar, inputs resetam, etc.). O plugin Morph resolve isso reconciliando o DOM inteligentemente:

```tsx
// ❌ Sem Morph — swap destrói estado Alpine
<div
  hx-get="/api/list"
  hx-trigger="click"
  hx-swap="innerHTML"              // reset total do estado Alpine
  x-data='{ expanded: true }'     // expanded vira false após swap
>
  <button $click="expanded = !expanded">Toggle</button>
  <ul x-show="expanded">...</ul>
</div>

// ✅ Com Morph — swap preserva estado Alpine
<div
  hx-get="/api/list"
  hx-trigger="click"
  hx-ext="morph"
  hx-swap="morph"                  // reconcilia DOM sem destruir estado Alpine
  x-data='{ expanded: true }'     // expanded permanece true após swap
>
  <button $click="expanded = !expanded">Toggle</button>
  <ul x-show="expanded">...</ul>
</div>
```

**Regra de uso:**
- Usar `hx-swap="morph"` em elementos que têm `x-data` com estado que precisa sobreviver ao swap
- Usar `hx-swap="innerHTML"` (default) em elementos puramente de dados sem estado Alpine local
- O Morph é mais lento que innerHTML — use só onde há estado Alpine a preservar

**No `head()`:**

```tsx
{raw(head({
  alpine: { plugins: ['morph'] },
  htmx: true,
}))}
```

### Magic properties (todas, incluindo plugins)

```
Core Alpine:
  $el       → elemento DOM atual do componente
  $refs     → { [refName]: HTMLElement } via x-ref
  $store    → acesso ao Alpine.store global
  $watch    → $watch('prop', (val, old) => {})
  $dispatch → dispara CustomEvent no DOM
  $nextTick → aguarda próximo tick do Alpine
  $root     → elemento raiz do componente Alpine
  $data     → dados do componente atual
  $id       → gera ID único acessível ($id('menu') → 'menu-1')

Plugin Persist:
  $persist  → persiste valor no localStorage automaticamente
              ex: x-data="{ count: $persist(0) }"
              → count sobrevive ao reload da página

Plugin Sort:
  $item     → referência ao elemento sendo ordenado (usado em x-sort callback)
  $position → posição atual do elemento (usado em x-sort callback)
```

---

## Testes (`__tests__/`)

### `attrs.test.ts` — transformação de atributos

```typescript
import { describe, expect, it } from 'bun:test'
import { serializeAttrs } from '../src/attrs'

describe('$event → x-on:', () => {
  it('$click → x-on:click', () => ...)
  it('$click_prevent → x-on:click.prevent', () => ...)
  it('$keydown_enter → x-on:keydown.enter', () => ...)
  it('$keydown_ctrl_enter → x-on:keydown.ctrl.enter', () => ...)
  it('$click_debounce_300ms → x-on:click.debounce.300ms', () => ...)
})

describe('x-bind-* → x-bind:*', () => {
  it('x-bind-class → x-bind:class', () => ...)
  it('x-bind-aria-label → x-bind:aria-label', () => ...)
})

describe('x-*_* → x-*.*', () => {
  it('x-model_lazy → x-model.lazy', () => ...)
  it('x-transition_enter → x-transition.enter', () => ...)
})

describe('aliases', () => {
  it('className → class', () => ...)
  it('htmlFor → for', () => ...)
})

describe('boolean attrs', () => {
  it('HTML/Alpine + true → emite só o nome (booleano)', () => ...)
  it('hx-* + true → emite ="true" (string, não booleano)', () => {
    // hx-boost={true} → hx-boost="true"
    // hx-push-url={true} → hx-push-url="true"
  })
  it('value=false → omite', () => ...)
  it('value=null → omite', () => ...)
  it('value=undefined → omite', () => ...)
})

describe('key prop → ignorado', () => {
  it('key nunca aparece no HTML', () => {
    // <li key="abc">text</li> → <li>text</li>
  })
})

describe('camelCase → HTML attrs', () => {
  it('tabIndex → tabindex', () => ...)
  it('readOnly → readonly', () => ...)
  it('maxLength → maxlength', () => ...)
  it('autoFocus → autofocus', () => ...)
  it('charSet → charset', () => ...)
  it('httpEquiv → http-equiv', () => ...)
  it('colSpan → colspan', () => ...)
  it('rowSpan → rowspan', () => ...)
  it('noValidate → novalidate', () => ...)
  it('encType → enctype', () => ...)
  it('autoComplete → autocomplete', () => ...)
  it('inputMode → inputmode', () => ...)
  it('crossOrigin → crossorigin', () => ...)
})

describe('hx-on- prefix', () => {
  it('hx-on-htmx-after-swap → hx-on::after-swap', () => ...)
})

describe('object values → serialização automática', () => {
  describe('style object → CSS string', () => {
    it('camelCase → kebab-case', () => {
      // style={{ backgroundColor: '#fff' }} → style="background-color: #fff;"
    })
    it('múltiplas propriedades joinadas com ;', () => {
      // style={{ fontSize: '14px', marginTop: '8px' }}
      // → style="font-size: 14px; margin-top: 8px;"
    })
    it('valor numérico sem unidade (ex: zIndex: 10)', () => {
      // style={{ zIndex: 10 }} → style="z-index: 10;"
    })
  })

  describe('hx-headers / hx-vals / hx-request → JSON com aspas simples', () => {
    it('hx-headers com objeto → JSON string', () => {
      // hx-headers={{ "X-CSRF-TOKEN": "abc" }}
      // → hx-headers='{"X-CSRF-TOKEN":"abc"}'
    })
    it('hx-vals com múltiplos campos → JSON string', () => {
      // hx-vals={{ page: 1, filter: "active" }}
      // → hx-vals='{"page":1,"filter":"active"}'
    })
    it('hx-request com opções → JSON string', () => {
      // hx-request={{ timeout: 5000 }}
      // → hx-request='{"timeout":5000}'
    })
    it('aspas simples no HTML não conflitam com aspas duplas do JSON', () => {
      // resultado deve ser: hx-headers='{"key":"value"}'
      // não: hx-headers="{&quot;key&quot;:&quot;value&quot;}"
    })
  })

  describe('outros atributos com objeto → JSON com aspas simples', () => {
    it('x-data com objeto → JSON string', () => {
      // x-data={{ open: false, count: 0 }}
      // → x-data='{"open":false,"count":0}'
    })
    it('array value → JSON string', () => {
      // x-id={['uid', 'modal']}
      // → x-id='["uid","modal"]'
    })
  })
})
```

### `escape.test.ts` — HTML escaping

```typescript
describe('escapeHtml', () => {
  it('escapa &', () => ...)
  it('escapa <', () => ...)
  it('escapa >', () => ...)
  it('escapa " e \'', () => ...)
  it('não double-escapa conteúdo já escaped', () => ...)
})

describe('raw()', () => {
  it('injeta HTML sem escape', () => ...)
  it('não escapa tags HTML no raw', () => ...)
})

describe('raw text elements — sem escape interno', () => {
  it('<script> não escapa && e > no conteúdo', () => {
    // <script>{'const x = a && b > 0'}</script>
    // → <script>const x = a && b > 0</script>   ✅
    // não: const x = a &amp;&amp; b &gt; 0       ❌
  })
  it('<style> não escapa conteúdo CSS', () => {
    // <style>{'.a > .b { color: red }'}</style>
    // → <style>.a > .b { color: red }</style>   ✅
  })
  it('elementos normais ainda escapam', () => {
    // <p>{'<script>alert(1)</script>'}</p>
    // → <p>&lt;script&gt;alert(1)&lt;/script&gt;</p>   ✅
  })
})
```

### `render.test.ts` — renderização JSX → HTML

```typescript
describe('renderPage', () => {
  it('adiciona <!DOCTYPE html>', () => ...)
  it('renderiza componente simples', () => ...)
  it('renderiza children aninhados', () => ...)
  it('renderiza array de children', () => ...)
  it('void elements não têm closing tag', () => ...)
  it('Fragment não emite wrapper', () => ...)
  it('componente como função', () => ...)
  it('renderToString não adiciona doctype', () => ...)
})

describe('children edge cases', () => {
  it('false como child → vazio', () => {
    // <div>{false}</div> → <div></div>
  })
  it('null como child → vazio', () => ...)
  it('undefined como child → vazio', () => ...)
  it('0 como child → "0" (renderiza!)', () => {
    // <div>{0}</div> → <div>0</div>
  })
  it('true como child → vazio', () => {
    // <div>{true}</div> → <div></div>
  })
  it('número como child → string', () => {
    // <div>{42}</div> → <div>42</div>
  })
  it('condicional com 0 → renderiza "0"', () => {
    // const count = 0
    // <div>{count && <span>items</span>}</div> → <div>0</div>
  })
})
```

### `alpine.test.ts` — integração Alpine

```typescript
describe('Alpine directives', () => {
  it('x-data passa direto', () => ...)
  it('x-show passa direto', () => ...)
  it('x-text passa direto', () => ...)
  it('x-if passes direto em template', () => ...)
  it('x-for passa direto em template', () => ...)
  it('x-model_lazy vira x-model.lazy', () => ...)
  it('x-transition_enter_active vira x-transition.enter.active', () => ...)
  it('x-cloak (sem valor) emite só atributo', () => ...)
  it('x-collapse (plugin) emite só atributo', () => ...)
  it('$click gera x-on:click', () => ...)
  it('$click_outside gera x-on:click.outside', () => ...)
  it('$submit_prevent gera x-on:submit.prevent', () => ...)
  it('$keydown_enter gera x-on:keydown.enter', () => ...)
  it('x-bind-class gera x-bind:class', () => ...)
  it('x-bind-aria-expanded gera x-bind:aria-expanded', () => ...)
  it('x-ref passa direto', () => ...)
})
```

### `htmx.test.ts` — integração HTMX

```typescript
describe('HTMX attributes passam direto', () => {
  it('hx-get', () => ...)
  it('hx-post', () => ...)
  it('hx-put', () => ...)
  it('hx-patch', () => ...)
  it('hx-delete', () => ...)
  it('hx-target', () => ...)
  it('hx-swap com modificadores', () => ...)
  it('hx-swap-oob', () => ...)
  it('hx-trigger com delay e changed', () => ...)
  it('hx-vals JSON', () => ...)
  it('hx-headers JSON', () => ...)
  it('hx-indicator', () => ...)
  it('hx-boost string "true"', () => ...)
  it('hx-push-url string "true"', () => ...)
  it('hx-confirm', () => ...)
  it('hx-ext', () => ...)
})

describe('hx-* com value=true → string "true" (não booleano)', () => {
  it('hx-boost={true} → hx-boost="true"', () => ...)
  it('hx-push-url={true} → hx-push-url="true"', () => ...)
  it('hx-history-elt={true} → hx-history-elt="true"', () => ...)
})

describe('hx-on-htmx-* → hx-on::*', () => {
  it('hx-on-htmx-after-swap → hx-on::after-swap', () => ...)
  it('hx-on-htmx-before-request → hx-on::before-request', () => ...)
})
```

### `helpers.test.ts` — clx, storeInit, alpinePlugin

```typescript
describe('clx()', () => {
  it('junta múltiplas classes', () => {
    // clx('a', 'b', 'c') → "a b c"
  })
  it('filtra false', () => {
    // clx('a', false, 'b') → "a b"
  })
  it('filtra null e undefined', () => {
    // clx('a', null, undefined) → "a"
  })
  it('filtra string vazia', () => {
    // clx('a', '', 'b') → "a b"
  })
  it('expressão condicional inline', () => {
    // clx('btn', isActive && 'btn-active') → "btn btn-active" ou "btn"
  })
  it('sem argumentos → string vazia', () => {
    // clx() → ""
  })
})

describe('storeInit()', () => {
  it('emite script com Alpine.store', () => {
    // storeInit('user', { id: 1, name: 'João' })
    // → '<script>document.addEventListener(\'alpine:init\',()=>{Alpine.store(\'user\',{"id":1,"name":"João"})})</script>'
  })
  it('serializa arrays corretamente', () => ...)
  it('serializa null corretamente', () => ...)
  it('adiciona nonce quando fornecido', () => {
    // storeInit('user', {}, { nonce: 'abc123' })
    // → '<script nonce="abc123">...'
  })
  it('sem nonce → sem atributo nonce', () => ...)
})

describe('alpinePlugin()', () => {
  it('emite script com alpine:init listener', () => ...)
  it('adiciona nonce quando fornecido', () => ...)
  it('sem nonce → sem atributo nonce', () => ...)
})
```

### `render.test.ts` — async components (adicionar ao bloco existente)

```typescript
describe('async components', () => {
  it('componente async resolve corretamente', async () => {
    async function AsyncComp() {
      await Promise.resolve()          // simula await db.select()
      return <span>loaded</span>
    }
    const html = await renderToString(async () => <AsyncComp />)
    expect(html).toBe('<span>loaded</span>')
  })

  it('múltiplos async components em paralelo', async () => {
    // cada componente faz seu próprio await
    async function A() { await Promise.resolve(); return <div>A</div> }
    async function B() { await Promise.resolve(); return <div>B</div> }
    const html = await renderToString(async () => <><A /><B /></>)
    expect(html).toBe('<div>A</div><div>B</div>')
  })

  it('renderPage async retorna Promise<string> com doctype', async () => {
    const html = await renderPage(async () => <html><body>ok</body></html>)
    expect(html).toStartWith('<!DOCTYPE html>')
  })

  it('componente sync continua funcionando (sem breaking change)', async () => {
    function Sync() { return <p>sync</p> }
    const html = await renderToString(async () => <Sync />)
    expect(html).toBe('<p>sync</p>')
  })
})
```

### `helpers.test.ts` — htmxResponse e head() (adicionar ao bloco existente)

```typescript
describe('htmxResponse()', () => {
  it('retorna Response com Content-Type text/html', async () => {
    const res = await htmxResponse(() => <div>ok</div>)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(await res.text()).toBe('<div>ok</div>')
  })

  it('adiciona HX-Trigger quando trigger é string', async () => {
    const res = await htmxResponse(() => <div />, { trigger: 'itemAdded' })
    expect(res.headers.get('HX-Trigger')).toBe('itemAdded')
  })

  it('adiciona HX-Trigger como JSON quando trigger é objeto', async () => {
    const res = await htmxResponse(() => <div />, { trigger: { evt: { id: 1 } } })
    expect(res.headers.get('HX-Trigger')).toBe('{"evt":{"id":1}}')
  })

  it('adiciona HX-Retarget', async () => {
    const res = await htmxResponse(() => <div />, { retarget: '#list' })
    expect(res.headers.get('HX-Retarget')).toBe('#list')
  })

  it('adiciona HX-Reswap', async () => {
    const res = await htmxResponse(() => <div />, { reswap: 'beforeend' })
    expect(res.headers.get('HX-Reswap')).toBe('beforeend')
  })

  it('status customizado', async () => {
    const res = await htmxResponse(() => <div />, { status: 201 })
    expect(res.status).toBe(201)
  })

  it('HX-Refresh quando refresh: true', async () => {
    const res = await htmxResponse(() => <div />, { refresh: true })
    expect(res.headers.get('HX-Refresh')).toBe('true')
  })

  it('funciona com async factory', async () => {
    async function Data() { return <span>data</span> }
    const res = await htmxResponse(async () => <Data />)
    expect(await res.text()).toBe('<span>data</span>')
  })
})

describe('head()', () => {
  it('gera charset e viewport por padrão', () => {
    const h = head({})
    expect(h).toContain('<meta charset="UTF-8">')
    expect(h).toContain('viewport')
  })

  it('gera title quando fornecido', () => {
    const h = head({ title: 'Meu App' })
    expect(h).toContain('<title>Meu App</title>')
  })

  it('alpine: true → só o core sem plugins', () => {
    const h = head({ alpine: true })
    expect(h).toContain('alpinejs')
    expect(h).not.toContain('@alpinejs/mask')
  })

  it('alpine com plugins seletivos → importa só os listados', () => {
    const h = head({ alpine: { plugins: ['mask', 'collapse'] } })
    expect(h).toContain('@alpinejs/mask')
    expect(h).toContain('@alpinejs/collapse')
    expect(h).not.toContain('@alpinejs/persist')
  })

  it('nonce aplicado em todos os scripts', () => {
    const h = head({ alpine: true, htmx: true, nonce: 'abc123' })
    const scriptMatches = h.match(/nonce="abc123"/g)
    expect(scriptMatches?.length).toBeGreaterThanOrEqual(2)  // alpine + htmx
  })

  it('styles gera links rel=stylesheet', () => {
    const h = head({ styles: ['/app.css', '/vendor.css'] })
    expect(h).toContain('<link rel="stylesheet" href="/app.css">')
    expect(h).toContain('<link rel="stylesheet" href="/vendor.css">')
  })
})
```

### `security.test.ts` — vetores de XSS e injeção

```typescript
import { describe, expect, it } from 'bun:test'
import { renderToString, raw, storeInit, alpinePlugin, head } from '../index'

describe('XSS: texto interpolado', () => {
  it('escapa < > & " \' em conteúdo de texto', async () => {
    const html = await renderToString(() => <div>{`<script>alert(1)</script>`}</div>)
    expect(html).toBe('<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>')
  })

  it('escapa em valor de atributo', async () => {
    const html = await renderToString(() => <a title={`" onclick="alert(1)`}>x</a>)
    expect(html).not.toContain('onclick')
    expect(html).toContain('&quot;')
  })
})

describe('XSS: script breakout via JSON', () => {
  it('storeInit escapa </script> em string do dado', () => {
    const evil = { bio: '</script><script>alert(1)</script>' }
    const out = storeInit('user', evil)
    expect(out).not.toContain('</script><script>')
    expect(out).toContain('\\u003c/script')   // < escapado
  })

  it('storeInit escapa U+2028 e U+2029', () => {
    const out = storeInit('msg', { text: 'line1 line2' })
    expect(out).not.toContain(' ')
    expect(out).toContain('\\u2028')
  })

  it('storeInit rejeita nome inválido', () => {
    expect(() => storeInit('bad-name; alert(1);//', {})).toThrow()
    expect(() => storeInit("name'); alert(1); //", {})).toThrow()
  })
})

describe('XSS: aspas em JSON dentro de atributo', () => {
  it('hx-headers com apóstrofo no valor → não quebra atributo', async () => {
    const html = await renderToString(() => (
      <div hx-headers={{ 'X-Token': "ab'cd" }} />
    ))
    // Sem mitigação seria: hx-headers='{"X-Token":"ab'cd"}'  ← BROKEN
    expect(html).toContain('&#39;')          // ' escapado
    expect(html).not.toMatch(/hx-headers='[^']*'[^']*cd/)
  })

  it('hx-vals com </script> no valor → escape JSON-safe', async () => {
    const html = await renderToString(() => (
      <div hx-vals={{ note: '</script>' }} />
    ))
    expect(html).not.toContain('</script>')
    expect(html).toContain('\\u003c')
  })
})

describe('XSS: injeção via spread', () => {
  it('atributos com nome inválido são descartados', async () => {
    const evil = {
      'onclick': 'alert(1)',
      'onload': 'alert(1)',
      'onerror': 'alert(1)',
      'onmouseover': 'alert(1)',
    }
    const html = await renderToString(() => <div {...evil} />)
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onload')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onmouseover')
    expect(html).toBe('<div></div>')
  })

  it('x-on:* e hx-on::* permitidos (não confundir com on*)', async () => {
    const html = await renderToString(() => (
      <div $click="ok" hx-on-htmx-after-swap="ok" />
    ))
    expect(html).toContain('x-on:click="ok"')
    expect(html).toContain('hx-on::after-swap="ok"')
  })

  it('nomes com caracteres inválidos descartados', async () => {
    const evil = {
      'data-foo bar="x"; onclick="alert(1)" data-baz': '1',
      '"><img src=x onerror=alert(1)>': '1',
    }
    const html = await renderToString(() => <div {...evil} />)
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
  })
})

describe('XSS: HtmlSafeString vs string', () => {
  it('jsx() output passa sem escape (não double-escape)', async () => {
    const html = await renderToString(() => <div><span>x</span></div>)
    expect(html).toBe('<div><span>x</span></div>')
    expect(html).not.toContain('&lt;span&gt;')
  })

  it('string crua de variável é escapada', async () => {
    const user = '<script>alert(1)</script>'
    const html = await renderToString(() => <div>{user}</div>)
    expect(html).toContain('&lt;script&gt;')
  })

  it('raw() preserva HTML sem escape (escape hatch)', async () => {
    const html = await renderToString(() => <div>{raw('<b>ok</b>')}</div>)
    expect(html).toBe('<div><b>ok</b></div>')
  })
})

describe('CSS injection via style', () => {
  it('< e > no valor CSS são removidos', async () => {
    const html = await renderToString(() => (
      <div style={{ color: 'red</style><script>alert(1)' }} />
    ))
    expect(html).not.toContain('</style>')
    expect(html).not.toContain('<script')
  })
})

describe('nonce em helpers — escape correto', () => {
  it('storeInit escapa nonce no atributo', () => {
    const out = storeInit('x', {}, { nonce: 'a"><script>alert(1)</script>' })
    expect(out).not.toContain('"><script>')
    expect(out).toContain('&quot;')
  })

  it('alpinePlugin escapa nonce', () => {
    const out = alpinePlugin('Alpine.directive(...)', { nonce: '"><x' })
    expect(out).not.toMatch(/nonce="[^"]*">.*<x/)
  })

  it('head() escapa nonce em todos os scripts', () => {
    const out = head({ alpine: true, htmx: true, nonce: 'a"x' })
    expect(out).not.toContain('a"x')
    expect(out).toContain('a&quot;x')
  })
})

describe('hx-* não escapa apóstrofo no JSON-attr', () => {
  it('hx-vals string normal mantém aspas duplas no JSON', async () => {
    const html = await renderToString(() => (
      <form hx-vals={{ user: 'ana' }} />
    ))
    // resultado esperado: hx-vals='{"user":"ana"}'
    expect(html).toContain(`hx-vals='{"user":"ana"}'`)
  })
})
```

### Estratégia de snapshot tests

Para componentes complexos onde escrever HTML esperado à mão seria tedioso, usar snapshots do Bun:

```typescript
import { expect, it } from 'bun:test'

it('Layout component snapshot', async () => {
  const html = await renderPage(async () => (
    <html lang="pt-BR">
      <head>{raw(head({ title: 'App', alpine: true }))}</head>
      <body><h1>Hello</h1></body>
    </html>
  ))
  // primeira execução: grava __snapshots__/render.test.ts.snap
  // execuções seguintes: compara — falha só se o HTML mudar
  expect(html).toMatchSnapshot()
})
```

**Regra:** unit tests de `attrs.test.ts` e `escape.test.ts` usam strings explícitas (são curtos e precisos). Testes de componentes completos em `render.test.ts` e `helpers.test.ts` podem usar snapshots.

### `compat.test.ts` — compatibilidade de runtime

```typescript
describe('Bun.serve compat', () => {
  it('renderPage retorna Promise<string> válida para new Response()', async () => {
    const html = await renderPage(() => <html><body>ok</body></html>)
    const res = new Response(html, { headers: { 'Content-Type': 'text/html' } })
    expect(res.status).toBe(200)
    expect(await res.text()).toStartWith('<!DOCTYPE html>')
  })
})

describe('Cloudflare Workers compat', () => {
  it('nenhuma API de Node.js usada (process, Buffer, fs)', () => {
    // verifica que os módulos src/* não importam 'node:*', 'fs', 'path', 'buffer'
    // pode ser feito com uma leitura estática dos arquivos
  })
  it('htmxResponse() retorna Response nativa (funciona em Workers)', async () => {
    const res = await htmxResponse(() => <div>ok</div>)
    expect(res).toBeInstanceOf(Response)
  })
})
```

---

## Exemplo completo — Counter com Alpine + HTMX

```tsx
// Sem nenhum import de htsx — tsconfig cuida do jsx-runtime

function Counter() {
  return (
    <div x-data='{ count: 0, open: false }'>

      {/* Alpine: estado local */}
      <button $click="count++">+</button>
      <button $click_prevent="count--">-</button>
      <span x-text="count" />

      {/* Alpine: dropdown local */}
      <div $click_outside="open = false">
        <button $click="open = !open">Menu</button>
        <ul x-show="open" x-transition>
          <li>Opção 1</li>
          <li>Opção 2</li>
        </ul>
      </div>

      {/* HTMX: dados do servidor */}
      <div
        hx-get="/api/items"
        hx-trigger="load"
        hx-swap="innerHTML"
        hx-indicator="#spinner"
      >
        Carregando...
      </div>
      <span id="spinner" class="htmx-indicator">⏳</span>

      {/* Alpine + HTMX juntos */}
      <button
        x-data='{ loading: false }'
        hx-post="/api/action"
        hx-swap="outerHTML"
        hx-target="#result"
        $click="loading = true"
        hx-on-htmx-after-swap="loading = false"
        x-bind-disabled="loading"
      >
        <span x-show="loading">Aguarde...</span>
        <span x-show="!loading">Enviar</span>
      </button>

      {/* Input com Alpine two-way + HTMX validation */}
      <input
        x-model_lazy="email"
        hx-get="/api/check-email"
        hx-trigger="change delay:500ms"
        hx-target="#email-status"
        type="email"
      />
      <span id="email-status" />

    </div>
  )
}
```

### HTML gerado

```html
<div x-data='{ count: 0, open: false }'>
  <button x-on:click="count++">+</button>
  <button x-on:click.prevent="count--">-</button>
  <span x-text="count"></span>
  <div x-on:click.outside="open = false">
    <button x-on:click="open = !open">Menu</button>
    <ul x-show="open" x-transition>
      <li>Opção 1</li>
      <li>Opção 2</li>
    </ul>
  </div>
  <div
    hx-get="/api/items"
    hx-trigger="load"
    hx-swap="innerHTML"
    hx-indicator="#spinner"
  >Carregando...</div>
  <span id="spinner" class="htmx-indicator">⏳</span>
  <button
    x-data='{ loading: false }'
    hx-post="/api/action"
    hx-swap="outerHTML"
    hx-target="#result"
    x-on:click="loading = true"
    hx-on::after-swap="loading = false"
    x-bind:disabled="loading"
  >
    <span x-show="loading">Aguarde...</span>
    <span x-show="!loading">Enviar</span>
  </button>
  <input
    x-model.lazy="email"
    hx-get="/api/check-email"
    hx-trigger="change delay:500ms"
    hx-target="#email-status"
    type="email"
  >
  <span id="email-status"></span>
</div>
```

---

## Uso em Bun.serve e Cloudflare Workers

```typescript
// worker.ts (Cloudflare) OU server.ts (Bun) — zero config extra
import { renderPage, raw, alpinePlugin, HX_HEADERS } from '@repo/htsx'

const tooltipPlugin = alpinePlugin(`
  Alpine.directive('tooltip', (el, { expression }, { evaluate }) => {
    el.title = evaluate(expression)
  })
`)

function Layout({ children }: { children: string }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>App</title>
        {/* plugins antes do Alpine */}
        {raw(tooltipPlugin)}
        <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" />
        <script src="https://unpkg.com/htmx.org@2/dist/htmx.min.js" />
      </head>
      <body hx-boost="true">
        {raw(children)}
      </body>
    </html>
  )
}

function HomePage() {
  return (
    <Layout>
      <main x-data='{ count: 0 }'>
        <h1>Contador</h1>
        <button $click="count++">+</button>
        <span x-text="count" />
        <div hx-get="/api/data" hx-trigger="load">Carregando dados...</div>
      </main>
    </Layout>
  )
}

const HEADERS = { 'Content-Type': 'text/html; charset=utf-8' }

// Cloudflare Workers — fetch é async, renderPage retorna Promise<string>
export default {
  async fetch(): Promise<Response> {
    const html = await renderPage(() => <HomePage />)
    return new Response(html, { headers: HEADERS })
  }
}

// Bun — mesma assinatura async
Bun.serve({
  async fetch(): Promise<Response> {
    const html = await renderPage(() => <HomePage />)
    return new Response(html, { headers: HEADERS })
  }
})
```

### Resposta com HX_HEADERS

```typescript
// Disparar evento no cliente após action server-side
return new Response(html, {
  headers: {
    ...HEADERS,
    [HX_HEADERS.Trigger]: 'itemAdded',
    [HX_HEADERS.Retarget]: '#list',
    [HX_HEADERS.Reswap]: 'beforeend',
  }
})
```

---

## Tipagem JSX (`jsx.d.ts`) — visão geral

```typescript
declare namespace JSX {
  type Element = string
  interface ElementChildrenAttribute { children: {} }

  // catch-all para atributos Alpine $events
  interface AlpineEvents {
    $click?: string
    $click_prevent?: string
    $click_stop?: string
    $click_outside?: string
    $click_window?: string
    $click_self?: string
    $submit?: string
    $submit_prevent?: string
    $keydown_enter?: string
    $keydown_enter_prevent?: string
    $keydown_escape?: string
    $keydown_ctrl_enter?: string
    $keydown_shift_enter?: string
    $input?: string
    $change?: string
    $focus?: string
    $blur?: string
    $mouseenter?: string
    $mouseleave?: string
    $scroll_window?: string
    $load?: string
    $resize_window?: string
    [k: `$${string}`]: string | undefined  // catch-all
  }

  interface AlpineDirectives {
    'x-data'?: string
    'x-init'?: string
    'x-show'?: string
    'x-text'?: string
    'x-html'?: string
    'x-model'?: string
    'x-model_lazy'?: string
    'x-model_number'?: string
    'x-model_debounce'?: string
    [k: `x-model_debounce_${string}`]: string | undefined
    'x-if'?: string
    'x-for'?: string
    'x-ref'?: string
    'x-cloak'?: true
    'x-ignore'?: true
    'x-effect'?: string
    'x-id'?: string
    'x-teleport'?: string
    'x-transition'?: true | string
    [k: `x-transition_${string}`]: string | undefined
    'x-intersect'?: string
    [k: `x-intersect_${string}`]: string | undefined
    'x-collapse'?: true
    'x-mask'?: string
    'x-sort'?: string | true
    [k: `x-anchor_${string}`]: string | undefined
    [k: `x-bind-${string}`]: string | undefined
    [k: `x-${string}`]: string | true | undefined  // diretivas custom
  }

  // Métodos HTTP HTMX — string (URL ou caminho)
  type HxMethod = string

  // Atributos HTMX que aceitam objeto JSON (renderer serializa via attrJson)
  type HxJsonAttr = string | Record<string, unknown>

  // Swap modes oficiais HTMX
  type HxSwap =
    | 'innerHTML' | 'outerHTML'
    | 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend'
    | 'delete' | 'none' | 'morph'
    // modificadores podem ser concatenados via string livre
    | (string & {})

  interface HtmxAttributes {
    'hx-get'?:           HxMethod
    'hx-post'?:          HxMethod
    'hx-put'?:           HxMethod
    'hx-patch'?:         HxMethod
    'hx-delete'?:        HxMethod
    'hx-target'?:        string
    'hx-swap'?:          HxSwap
    'hx-swap-oob'?:      string | true
    'hx-trigger'?:       string
    'hx-vals'?:          HxJsonAttr             // string ou objeto (serializa)
    'hx-headers'?:       HxJsonAttr             // string ou objeto (serializa)
    'hx-request'?:       HxJsonAttr             // string ou objeto (serializa)
    'hx-include'?:       string
    'hx-params'?:        string
    'hx-encoding'?:      'multipart/form-data'
    'hx-push-url'?:      string | true
    'hx-replace-url'?:   string | true
    'hx-history'?:       'false'
    'hx-history-elt'?:   true
    'hx-boost'?:         true | 'true' | 'false'
    'hx-indicator'?:     string
    'hx-confirm'?:       string
    'hx-prompt'?:        string
    'hx-disable'?:       true
    'hx-disinherit'?:    string
    'hx-preserve'?:      true
    'hx-sync'?:          string
    'hx-validate'?:      'true' | true
    'hx-ext'?:           string
    'hx-select'?:        string
    'hx-select-oob'?:    string
    [k: `hx-on-htmx-${string}`]: string | undefined  // hx-on::* events
    [k: `hx-${string}`]: HxJsonAttr | true | undefined  // catch-all (extensões)
  }

  // Tipo para o objeto de style (camelCase)
  type CSSProperties = Partial<Record<
    | 'backgroundColor' | 'color' | 'fontSize' | 'fontWeight' | 'fontFamily'
    | 'margin' | 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight'
    | 'padding' | 'paddingTop' | 'paddingBottom' | 'paddingLeft' | 'paddingRight'
    | 'width' | 'height' | 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight'
    | 'display' | 'flexDirection' | 'alignItems' | 'justifyContent' | 'flexWrap'
    | 'position' | 'top' | 'right' | 'bottom' | 'left' | 'zIndex'
    | 'border' | 'borderRadius' | 'borderColor' | 'borderWidth' | 'borderStyle'
    | 'opacity' | 'overflow' | 'cursor' | 'transform' | 'transition'
    | 'textAlign' | 'textDecoration' | 'lineHeight' | 'letterSpacing'
    | 'gap' | 'gridTemplateColumns' | 'gridColumn' | 'gridRow'
    // catch-all para qualquer propriedade CSS
    | string
  , string | number>>

  // Children: como o runtime renderiza tudo para string antes de passar ao componente,
  // e como JSX.Element = string, o tipo aceito como filho em JSX é:
  //   - string (texto ou HTML já renderizado por jsx())
  //   - number (renderiza como String(n), incluindo 0)
  //   - boolean | null | undefined (renderiza vazio)
  //   - array recursivo das mesmas opções (map em listas)
  type Node =
    | string
    | number
    | boolean
    | null
    | undefined
    | Node[]

  // GlobalAttrs — atributos comuns a todos os elementos HTML
  type GlobalAttrs = AlpineEvents & AlpineDirectives & HtmxAttributes & {
    id?:              string
    class?:           string
    className?:       string                     // alias React → vira "class"
    style?:           string | CSSProperties     // string ou objeto camelCase
    children?:        Node                       // qualquer Node JSX
    key?:             string | number            // JSX key — nunca emitido no HTML

    // HTML globais comuns
    tabIndex?:        number
    hidden?:          boolean
    title?:           string
    lang?:            string
    dir?:             'ltr' | 'rtl' | 'auto'
    draggable?:       boolean | 'true' | 'false'
    contentEditable?: boolean | 'true' | 'false' | 'inherit'
    spellCheck?:      boolean | 'true' | 'false'
    translate?:       'yes' | 'no'
    role?:            string
    slot?:            string
    accessKey?:       string

    // ARIA comum (catch-all abaixo cobre o resto)
    'aria-label'?:    string
    'aria-hidden'?:   boolean | 'true' | 'false'
    'aria-expanded'?: boolean | 'true' | 'false'
    'aria-controls'?: string
    'aria-describedby'?: string
    'aria-labelledby'?:  string
    'aria-live'?:     'polite' | 'assertive' | 'off'
    'aria-busy'?:     boolean | 'true' | 'false'
    'aria-disabled'?: boolean | 'true' | 'false'

    [k: `data-${string}`]: string | number | boolean | undefined
    [k: `aria-${string}`]: string | number | boolean | undefined
  }

  // Aliás retrocompatível
  type BaseAttrs = GlobalAttrs

  // ─── Per-element types ───
  // Tipagem específica para os elementos mais comuns. Cada interface herda
  // GlobalAttrs e adiciona atributos próprios. Fallback para `GlobalAttrs`
  // em qualquer tag não listada.

  type Target = '_self' | '_blank' | '_parent' | '_top' | (string & {})

  interface AnchorAttrs extends GlobalAttrs {
    href?:        string
    target?:      Target
    rel?:         string
    download?:    string | boolean
    hrefLang?:    string
    type?:        string
    referrerPolicy?: string
  }

  interface ButtonAttrs extends GlobalAttrs {
    type?:        'button' | 'submit' | 'reset'
    name?:        string
    value?:       string | number
    disabled?:    boolean
    form?:        string
    formAction?:  string
    formMethod?:  'get' | 'post'
    formEncType?: string
    formNoValidate?: boolean
    formTarget?:  Target
    autoFocus?:   boolean
  }

  type InputType =
    | 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search'
    | 'checkbox' | 'radio' | 'submit' | 'reset' | 'button' | 'file'
    | 'date' | 'time' | 'datetime-local' | 'month' | 'week'
    | 'color' | 'hidden' | 'range' | 'image'

  interface InputAttrs extends GlobalAttrs {
    type?:           InputType
    name?:           string
    value?:          string | number
    defaultValue?:   string | number
    placeholder?:    string
    required?:       boolean
    disabled?:       boolean
    readOnly?:       boolean
    checked?:        boolean
    defaultChecked?: boolean
    autoFocus?:      boolean
    autoComplete?:   string
    pattern?:        string
    min?:            number | string
    max?:            number | string
    step?:           number | string
    minLength?:      number
    maxLength?:      number
    multiple?:       boolean
    accept?:         string
    capture?:        boolean | 'user' | 'environment'
    inputMode?:      'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'
    list?:           string
    form?:           string
    size?:           number
    src?:            string
    alt?:            string
  }

  interface TextareaAttrs extends GlobalAttrs {
    name?:        string
    value?:       string
    defaultValue?: string
    placeholder?: string
    required?:    boolean
    disabled?:    boolean
    readOnly?:    boolean
    autoFocus?:   boolean
    autoComplete?: string
    rows?:        number
    cols?:        number
    wrap?:        'hard' | 'soft' | 'off'
    minLength?:   number
    maxLength?:   number
    form?:        string
  }

  interface SelectAttrs extends GlobalAttrs {
    name?:        string
    value?:       string | number
    defaultValue?: string | number
    required?:    boolean
    disabled?:    boolean
    multiple?:    boolean
    size?:        number
    autoFocus?:   boolean
    form?:        string
  }

  interface OptionAttrs extends GlobalAttrs {
    value?:       string | number
    selected?:    boolean
    defaultSelected?: boolean
    disabled?:    boolean
    label?:       string
  }

  interface FormAttrs extends GlobalAttrs {
    action?:      string
    method?:      'get' | 'post' | 'GET' | 'POST'
    encType?:     string
    target?:      Target
    name?:        string
    autoComplete?: 'on' | 'off'
    noValidate?:  boolean
    acceptCharset?: string
  }

  interface LabelAttrs extends GlobalAttrs {
    htmlFor?:     string
    form?:        string
  }

  interface ImgAttrs extends GlobalAttrs {
    src?:         string
    alt?:         string
    width?:       number | string
    height?:      number | string
    loading?:     'eager' | 'lazy'
    decoding?:    'async' | 'sync' | 'auto'
    srcSet?:      string
    sizes?:       string
    crossOrigin?: 'anonymous' | 'use-credentials' | ''
    referrerPolicy?: string
    useMap?:      string
    isMap?:       boolean
  }

  interface LinkAttrs extends GlobalAttrs {
    rel?:         string
    href?:        string
    type?:        string
    as?:          string
    crossOrigin?: 'anonymous' | 'use-credentials' | ''
    media?:       string
    sizes?:       string
    integrity?:   string
    hrefLang?:    string
    referrerPolicy?: string
  }

  interface MetaAttrs extends GlobalAttrs {
    name?:        string
    content?:     string
    httpEquiv?:   string
    charSet?:     string
    property?:    string         // OpenGraph
  }

  interface ScriptAttrs extends GlobalAttrs {
    src?:         string
    type?:        string
    async?:       boolean
    defer?:       boolean
    crossOrigin?: 'anonymous' | 'use-credentials' | ''
    integrity?:   string
    noModule?:    boolean
    nonce?:       string
    referrerPolicy?: string
  }

  interface StyleAttrs extends GlobalAttrs {
    type?:        string
    media?:       string
    nonce?:       string
  }

  interface IframeAttrs extends GlobalAttrs {
    src?:         string
    srcDoc?:      string
    name?:        string
    sandbox?:     string
    allow?:       string
    allowFullScreen?: boolean
    width?:       number | string
    height?:      number | string
    loading?:     'eager' | 'lazy'
    referrerPolicy?: string
  }

  interface TableCellAttrs extends GlobalAttrs {
    colSpan?:     number
    rowSpan?:     number
    headers?:     string
    scope?:       'row' | 'col' | 'rowgroup' | 'colgroup'
  }

  interface IntrinsicElements {
    // links e navegação
    a:          AnchorAttrs
    area:       AnchorAttrs
    base:       LinkAttrs
    link:       LinkAttrs

    // form controls
    button:     ButtonAttrs
    input:      InputAttrs
    textarea:   TextareaAttrs
    select:     SelectAttrs
    option:     OptionAttrs
    optgroup:   GlobalAttrs & { label?: string; disabled?: boolean }
    form:       FormAttrs
    label:      LabelAttrs
    fieldset:   GlobalAttrs & { name?: string; disabled?: boolean; form?: string }
    legend:     GlobalAttrs
    output:     GlobalAttrs & { htmlFor?: string; form?: string; name?: string }
    progress:   GlobalAttrs & { value?: number; max?: number }
    meter:      GlobalAttrs & { value?: number; min?: number; max?: number; low?: number; high?: number; optimum?: number }

    // mídia
    img:        ImgAttrs
    picture:    GlobalAttrs
    source:     GlobalAttrs & { src?: string; srcSet?: string; type?: string; media?: string; sizes?: string }
    video:      GlobalAttrs & { src?: string; poster?: string; controls?: boolean; autoPlay?: boolean; loop?: boolean; muted?: boolean; playsInline?: boolean; preload?: 'none' | 'metadata' | 'auto'; width?: number | string; height?: number | string; crossOrigin?: 'anonymous' | 'use-credentials' }
    audio:      GlobalAttrs & { src?: string; controls?: boolean; autoPlay?: boolean; loop?: boolean; muted?: boolean; preload?: 'none' | 'metadata' | 'auto'; crossOrigin?: 'anonymous' | 'use-credentials' }
    track:      GlobalAttrs & { kind?: string; src?: string; srcLang?: string; label?: string; default?: boolean }

    // tabela
    table:      GlobalAttrs
    thead:      GlobalAttrs
    tbody:      GlobalAttrs
    tfoot:      GlobalAttrs
    tr:         GlobalAttrs
    td:         TableCellAttrs
    th:         TableCellAttrs & { abbr?: string }
    caption:    GlobalAttrs
    col:        GlobalAttrs & { span?: number }
    colgroup:   GlobalAttrs & { span?: number }

    // metadata e head
    head:       GlobalAttrs
    title:      GlobalAttrs
    meta:       MetaAttrs
    style:      StyleAttrs
    script:     ScriptAttrs
    noscript:   GlobalAttrs

    // documento
    html:       GlobalAttrs & { lang?: string; xmlns?: string }
    body:       GlobalAttrs

    // embed/iframe
    iframe:     IframeAttrs
    embed:      GlobalAttrs & { src?: string; type?: string; width?: number | string; height?: number | string }
    object:     GlobalAttrs & { data?: string; type?: string; name?: string; form?: string; width?: number | string; height?: number | string; useMap?: string }
    param:      GlobalAttrs & { name?: string; value?: string }

    // semântica/blocos comuns — só GlobalAttrs basta
    div:        GlobalAttrs
    span:       GlobalAttrs
    p:          GlobalAttrs
    h1:         GlobalAttrs
    h2:         GlobalAttrs
    h3:         GlobalAttrs
    h4:         GlobalAttrs
    h5:         GlobalAttrs
    h6:         GlobalAttrs
    section:    GlobalAttrs
    article:    GlobalAttrs
    aside:      GlobalAttrs
    nav:        GlobalAttrs
    header:     GlobalAttrs
    footer:     GlobalAttrs
    main:       GlobalAttrs
    ul:         GlobalAttrs
    ol:         GlobalAttrs & { reversed?: boolean; start?: number; type?: '1' | 'a' | 'A' | 'i' | 'I' }
    li:         GlobalAttrs & { value?: number }
    dl:         GlobalAttrs
    dt:         GlobalAttrs
    dd:         GlobalAttrs
    figure:     GlobalAttrs
    figcaption: GlobalAttrs
    blockquote: GlobalAttrs & { cite?: string }
    pre:        GlobalAttrs
    code:       GlobalAttrs
    em:         GlobalAttrs
    strong:     GlobalAttrs
    small:      GlobalAttrs
    mark:       GlobalAttrs
    del:        GlobalAttrs & { cite?: string; dateTime?: string }
    ins:        GlobalAttrs & { cite?: string; dateTime?: string }
    sub:        GlobalAttrs
    sup:        GlobalAttrs
    hr:         GlobalAttrs
    br:         GlobalAttrs
    time:       GlobalAttrs & { dateTime?: string }
    address:    GlobalAttrs
    details:    GlobalAttrs & { open?: boolean }
    summary:    GlobalAttrs
    dialog:     GlobalAttrs & { open?: boolean }
    template:   GlobalAttrs
    slot:       GlobalAttrs & { name?: string }

    // fallback para qualquer tag custom (web components, etc.)
    [tag: string]: GlobalAttrs
  }
}

// Exportados de index.ts — usados direto no código do projeto

// Component<P>: tipo primário — sync ou async, sem children por default
// (inspirado no Solid.js: sem children implícito como no React)
type Component<P = {}> = (props: P) => JSX.Element | Promise<JSX.Element>

// ParentComponent<P>: opt-in para componentes que aceitam children
// children é string porque JSX.Element = string e o runtime renderiza antes de passar
type ParentComponent<P = {}> = Component<P & { children?: string }>

// FC<P>: alias de Component<P> para memória muscular do React
type FC<P = {}> = Component<P>

// PropsWithChildren<P>: para tipar props manualmente com children
type PropsWithChildren<P = {}> = P & { children?: string }

// AlpinePluginName — nomes válidos para head({ alpine: { plugins: [...] } })
type AlpinePluginName =
  | 'mask' | 'persist' | 'focus' | 'collapse'
  | 'intersect' | 'sort' | 'anchor' | 'morph'
```

### Por que esse design? (decisão explícita)

**`Component<P>` sem children por default** (Solid.js pattern):
- `FC<P>` no React sempre injeta `children` — o dev precisa ignorar o que não usa
- No htsx a maioria dos componentes é leaf (sem children): `<Card>`, `<Badge>`, `<Avatar>`
- Só components de layout precisam de children: `<Layout>`, `<Section>`, `<Modal>`
- Tornar children opt-in força o dev a documentar intenção e evita bugs silenciosos

**`children?: string` (não union complexa)**:
- `JSX.Element = string` — já está no namespace
- O runtime resolve async e join de arrays **antes** de passar ao componente pai
- O que chega no props `children` é sempre HTML já renderizado como string
- Union complexa (`JSX.Element | JSX.Element[] | number | null`) seria mentira de tipo

**Sem `AsyncFC<P>` separado**:
- `Component<P>` já é `(props: P) => JSX.Element | Promise<JSX.Element>`
- Distinguir sync/async no tipo não dá nenhum benefício — o runtime lida com ambos
- `const DataComponent: Component<{id: string}> = async ({ id }) => { const data = await fetch(...) ... }` funciona

**`FC<P>` como alias**:
- Desenvolvedores vindos do React vão escrever `FC<Props>` instintivamente
- Não tem custo — é apenas `type FC<P> = Component<P>`

**`defineComponent` e `defineLayout` como factory functions (opt-in)**:
- O dev pode anotar o tipo explicitamente (`const X: Component<P> = ...`) **ou** usar a factory (`const X = defineComponent<P>(...)`)
- `defineLayout` injeta `children?: string` automaticamente — não precisa lembrar de usar `ParentComponent` vs `Component`
- Ambas são identity functions em runtime (zero overhead): `return fn`
- O `$` foi descartado como prefixo para evitar colisão com os shorthands Alpine (`$click`, `$store`) já presentes no JSX
- Os tipos continuam exportados de forma standalone para quem preferir a anotação explícita

```tsx
// estilo 1: anotação explícita (para quem prefere tipos visíveis)
const Badge: Component<{ label: string }> = ({ label }) => <span>{label}</span>
const Layout: ParentComponent<{ title: string }> = ({ title, children }) => (...)

// estilo 2: factory function (menos imports, children automático em defineLayout)
const Badge = defineComponent<{ label: string }>(({ label }) => <span>{label}</span>)
const Layout = defineLayout<{ title: string }>(({ title, children }) => (...))
```

Os dois estilos coexistem — não há incompatibilidade entre eles.

### Exemplos de uso no projeto

```tsx
import type { Component, ParentComponent, FC, PropsWithChildren } from '@repo/htsx'

// Leaf component (sem children) — uso mais comum
const Badge: Component<{ label: string; color?: string }> = ({ label, color = 'blue' }) => (
  <span class={`badge badge-${color}`}>{label}</span>
)

// Async leaf component — busca dados
const UserAvatar: Component<{ userId: string }> = async ({ userId }) => {
  const user = await db.users.find(userId)
  return <img src={user.avatar} alt={user.name} class="w-8 h-8 rounded-full" />
}

// Layout component (aceita children)
const Card: ParentComponent<{ title: string }> = ({ title, children }) => (
  <div class="card">
    <h2 class="card-title">{title}</h2>
    <div class="card-body">{children}</div>
  </div>
)

// Alias FC funciona igual a Component
const Button: FC<{ label: string; variant?: 'primary' | 'ghost' }> = ({ label, variant = 'primary' }) => (
  <button class={`btn btn-${variant}`}>{label}</button>
)

// Props com children declarado manualmente (quando precisar de mais controle)
type ModalProps = PropsWithChildren<{ title: string; open: boolean }>
const Modal = ({ title, open, children }: ModalProps) => (
  <dialog open={open} x-show="open">
    <h2>{title}</h2>
    {children}
  </dialog>
)
```

---

## package.json

```json
{
  "name": "@repo/htsx",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "exports": {
    ".": {
      "types": "./index.ts",
      "default": "./index.ts"
    },
    "./jsx-runtime": {
      "types": "./src/jsx-runtime.ts",
      "default": "./src/jsx-runtime.ts"
    }
  },
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

> **Sem build step.** Bun e Wrangler transpilam TypeScript nativamente — os exports apontam para `.ts` direto. Não há `build`, `dist/` ou pré-compilação. O `tsconfig.json` é usado só para type checking (`tsc --noEmit`), não para gerar arquivos. Se alguém adicionar um build step achando que é necessário, vai quebrar os paths de import do monorepo.

## tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@repo/htsx",
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

> `outDir` foi removido intencionalmente — não existe build. `noEmit: true` deixa claro que `tsc` só verifica tipos.

## Registro no monorepo

### 1. `package.json` da raiz

O `@repo/htsx` precisa ser listado no `workspaces` da raiz do monorepo. Verificar que `pkg/*` já está incluído:

```json
// package.json (raiz do monorepo)
{
  "workspaces": ["api", "app", "web", "pkg/*"]
}
```

Se `pkg/*` ainda não existir, adicionar.

### 2. Workspaces que vão usar htsx

Em cada workspace que vai renderizar JSX (ex: `api/` para retornar HTML, `web/` para SSR), adicionar como dependência:

```json
// api/package.json (ou onde for usar)
{
  "dependencies": {
    "@repo/htsx": "workspace:*"
  }
}
```

E configurar o JSX no `tsconfig` daquele workspace:

```json
// api/tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@repo/htsx"
  }
}
```

> **Importante:** sem o `jsxImportSource`, o TS tenta usar `react/jsx-runtime` por default e falha. Cada workspace que usa JSX precisa dessa config.

### 3. Validação

Após instalar (`bun install` na raiz), testar:

```bash
cd pkg/htsx && bun run typecheck && bun test
```

Tudo deve passar antes de usar em qualquer outro workspace.

---

## O que NÃO implementar (fora do escopo v1)

- ❌ Streaming / ReadableStream
- ❌ Context API / prop drilling helpers
- ❌ Head collector / deduplicação de scripts
- ❌ Error boundaries
- ❌ Validação de dados
- ❌ Suspense / lazy loading
- ❌ Client-side hydration (não faz sentido — é SSR puro)
- ❌ React Server Components semantics

---

## Checklist de implementação

### Arquivos core

- [ ] `src/escape.ts` — `escapeHtml`, `escapeAttr`, `safeJson`, `attrJson`, `cssValue`, `VALID_ATTR_NAME`, `isUnsafeEventHandler`
- [ ] `src/elements.ts` — `VOID_ELEMENTS` + `RAW_TEXT_ELEMENTS`
- [ ] `src/attrs.ts` — `serializeAttrs` + `JSX_TO_HTML_ATTRS` + validação de nome + bloqueio `on*`
- [ ] `src/htmx-headers.ts` — `HX_HEADERS` constantes
- [ ] `src/jsx-runtime.ts` — `jsx`, `jsxs`, `Fragment`, `HtmlSafeString`, `renderChildren` (async + paralelo)
- [ ] `src/helpers.ts` — `clx`, `storeInit`, `alpinePlugin`, `htmxResponse`, `head`, `safeUrl`
- [ ] `index.ts` — exports públicos + `Component` + `ParentComponent` + `FC` + `PropsWithChildren`
- [ ] `jsx.d.ts` — namespace JSX + `GlobalAttrs` + per-element types + `AlpinePluginName` + `CSSProperties`

### Configuração

- [ ] `package.json` — sem build script, exports → `.ts` direto, scripts: test + typecheck
- [ ] `tsconfig.json` — `noEmit: true`, `jsx: "react-jsx"`, `jsxImportSource: "@repo/htsx"`
- [ ] Raiz do monorepo: `pkg/*` em `workspaces`
- [ ] Workspaces que usam htsx: dependência `"@repo/htsx": "workspace:*"` + `jsxImportSource` no tsconfig

### Testes

- [ ] `__tests__/attrs.test.ts` — camelCase, $events, x-bind, hx-* boolean, key ignorado, object values
- [ ] `__tests__/escape.test.ts` — escaping + raw text + `safeJson` (`</script>`, `&`, U+2028) + `cssValue`
- [ ] `__tests__/render.test.ts` — children edge cases + async components + paralelo
- [ ] `__tests__/alpine.test.ts` — todas as diretivas + modificadores
- [ ] `__tests__/htmx.test.ts` — todos os atributos + hx-* true → "true" + objetos em hx-vals/headers/request
- [ ] `__tests__/helpers.test.ts` — clx, storeInit, alpinePlugin, htmxResponse, head, safeUrl
- [ ] `__tests__/security.test.ts` — XSS via JSON, spread, apóstrofo, CSS, nonce, HtmlSafeString
- [ ] `__tests__/compat.test.ts` — Bun.serve + CF Workers (sem Node.js APIs)

### Regras de corretude implementadas

- [ ] `<script>` e `<style>` → children sem escape HTML (ctx.escape=false)
- [ ] `hx-*={true}` → `="true"` (string, não booleano)
- [ ] `{0}` como child → renderiza `"0"`
- [ ] `{false}` / `{null}` / `{undefined}` como child → renderiza `""`
- [ ] `key` prop → ignorado (nunca emite `key="..."` no HTML)
- [ ] camelCase attrs → HTML lowercase (`tabIndex` → `tabindex`, etc.)
- [ ] `HtmlSafeString` evita double-escape de output de `jsx()`
- [ ] Async children renderizam em paralelo via `Promise.all` (não sequencial)

### Regras de segurança implementadas

- [ ] `safeJson` escapa `<`, `>`, `&`, U+2028, U+2029 dentro de `<script>` e atributos JSON
- [ ] `attrJson` escapa `'` para `&#39;` em atributos com aspas simples
- [ ] `VALID_ATTR_NAME` rejeita nomes de atributo com caracteres inseguros
- [ ] `isUnsafeEventHandler` bloqueia `on*` (mas permite `x-on` e `hx-on`)
- [ ] `cssValue` remove `<` e `>` de valores CSS
- [ ] `storeInit` rejeita nome de store inválido (proteção contra injeção JS)
- [ ] `storeInit`, `alpinePlugin`, `head` escapam `nonce` como atributo
- [ ] `raw()` documentado como escape hatch perigoso

### Helpers implementados

- [ ] `clx()` — classes condicionais
- [ ] `storeInit()` — server data → `Alpine.store` com `safeJson` + nonce opcional
- [ ] `alpinePlugin()` — diretiva/magic custom com nonce opcional
- [ ] `htmxResponse()` — builder de `Response` para endpoints HTMX
- [ ] `head()` — geração de `<head>` com Alpine/HTMX seletivos + nonce
- [ ] `safeUrl()` — filtro opt-in de schemes (`javascript:`, `data:`, `vbscript:`)
- [ ] `raw()` — retorna `HtmlSafeString` (escape hatch documentado)

### Tipos exportados

- [ ] `Component<P>` — tipo primário, sync + async, sem children por default
- [ ] `ParentComponent<P>` — opt-in para componentes que aceitam children
- [ ] `FC<P>` — alias de `Component<P>` para memória muscular do React
- [ ] `PropsWithChildren<P>` — helper para tipar props com children manualmente
- [ ] `defineComponent<P>()` — factory identity, garante tipagem sem importar tipo separado
- [ ] `defineLayout<P>()` — factory identity, injeta children automaticamente no tipo
- [ ] `AlpinePluginName` — union dos nomes válidos de plugins
- [ ] `CSSProperties` — objeto camelCase para `style`
- [ ] `HtmlSafeString` — classe interna, exportada para guards manuais
- [ ] Per-element types: `InputAttrs`, `AnchorAttrs`, `ButtonAttrs`, `FormAttrs`, `ImgAttrs`, `ScriptAttrs`, `MetaAttrs`, `LinkAttrs`, `LabelAttrs`, `SelectAttrs`, `OptionAttrs`, `TextareaAttrs`, `IframeAttrs`, `TableCellAttrs`
