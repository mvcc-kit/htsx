# Changelog

Regras e fluxo: [`RELEASING.md`](RELEASING.md).

## 0.4.6-beta.1 (03/11/2026)

Qualidade de código:

- **Sem duplicação:** base64url, HMAC e comparação segura ficam em `src/crypto.ts`; nomes de cookie e de evento, em `src/patterns.ts`; cabeçalhos de pedido do htmx, em `HX_REQUEST`.
- **Lógica separada:** regras de requisição em `src/app/request.ts`, sem imports, e montagem de resposta em `src/app/response.ts`, ambas testadas sozinhas.
- Sai `build.ts`, que publicava no npm: a distribuição é pelo GitHub.

**Mudança incompatível:** `<Form>` não aceita mais `errors` e `values`. Antes eles eram recebidos e descartados em silêncio. Use `<Field error value>` ou `formContext()`.

Correção: `ErrorBoundary` com `fallback` em lista saía como texto escapado.

## 0.4.5-beta.1 (03/11/2026)

Performance, medida com `bun run bench`:

- **Render cerca de 2x mais rápido:** tabela de 500 linhas de 759 para 377 µs; 10 atributos de 0,96 para 0,42 µs.
- `renderPage` com `<Head>` de 8,3 para 4,9 µs: tags síncronas não criam mais promessas.
- Cookies e `event.htmx` só são lidos se a rota usar, e a resposta não é mais copiada para receber cabeçalhos.
- **Modo Bun:** comprime com gzip, guarda o resultado por versão, e arquivos estáticos levam `ETag` e `nosniff`, com 304 quando não mudam.

**Mudança para quem usa:** `HtmlSafeString` não herda mais de `String`. `String(x)` e `x.toString()` continuam iguais; métodos como `x.length` e `x.includes()` precisam de `String(x)` antes.

Correção: `{...props}` com a chave `constructor` ou `toString` não gera mais o código da função no HTML.

## 0.4.4-beta.1 (02/11/2026)

- **Alpine sob demanda:** o `<Head>` baixa o Alpine só quando a página tem `x-data` ou `x-init`, inclusive depois de uma troca. Script inline que usa `Alpine` direto deve esperar `alpine:init`.
- **`buildStatic(app, { vendor: 'auto' })`:** publica só os arquivos que as páginas citam.
- **`<Outlet preload>`:** pré-carrega o parcial ao passar o mouse. Exige cache do host em `/_htsx/partial/`, que o adaptador Cloudflare já configura.
- **`ETag` e 304** nas páginas e parciais renderizados no servidor.

## 0.4.3-beta.1 (02/11/2026)

- **Sem download duplicado:** links com `hx-boost` não são mais pré-carregados, porque cada clique baixava o parcial duas vezes.
- **Voltar troca só o `Outlet`:** com `hx-history-elt`, o rodapé e o resto do `<body>` ficam intactos.

## 0.4.2-beta.1 (02/11/2026)

- **Parciais de verdade no site estático:** o build gera cada parcial em `/_htsx/partial/...`, e a navegação baixa só ele, em vez do arquivo inteiro. Se o arquivo faltar, cai para a navegação completa.
- **Só o `Outlet` anima:** antes, a transição atuava na página inteira.
- **`hx-get` interno não anima mais a página:** o `<Head>` deixa de ligar `globalViewTransitions`; a navegação por boost continua animada.
- Pré-carregamento ao passar o mouse com `hx-boost`. Saiu na 0.4.3: baixava o parcial duas vezes.

## 0.4.1-beta.1 (02/11/2026)

**Atualize:** esta versão corrige falhas de segurança.

Falhas corrigidas:

- **Open redirect:** `https://site//evil.com/` redirecionava para `//evil.com`, outro site. Afeta apps com `defineApp`.
- **XSS em `redirect()`:** com htmx, `redirect(303, 'javascript:...')` chegava a `HX-Redirect`, que o htmx executa. Agora é erro, também em `event.htmx.redirect` e `location`.
- **XSS em atributos de URL:** `formAction` e `HREF` escapavam da checagem, e `data`, `poster`, `xlink:href` e outros não eram checados.
- **XSS em `Suspense`:** texto comum em `children` saía sem escape.
- **Id da sessão no HTML:** o token CSRF levava o `sessionId`, legível por qualquer um com acesso à página.
- **Injeção em SSE:** CR em texto de usuário criava outro evento.
- **Injeção por nome de elemento, CSS e cookie:** nome com atributos, `;` em valor de `style`, e `;` em `path` ou `domain`.
- **Escrita fora da saída:** link como `..%2f` no conteúdo gravava arquivo fora da pasta no prerender.

**Mudanças incompatíveis:**

- Tokens CSRF agora são `ts.sig`. Tokens de páginas já abertas deixam de valer depois do deploy.
- `OOB` e `Suspense` podem devolver `Promise`. Em JSX não muda nada; quem usa `String(...)` deve usar `renderToString`.
- Cookie repetido na requisição: vale o primeiro, antes valia o último.
- Valor de `style` é cortado no primeiro `;` fora de aspas e parênteses.

Outras melhorias:

- `defineApp` envia `X-Content-Type-Options`, `X-Frame-Options` e `Referrer-Policy`, ajustáveis com `securityHeaders`.
- `OOB` e `Suspense` aceitam lista e componente assíncrono; antes saía `[object Promise]`.
- `sseResponse` encerra o gerador quando o cliente sai.
- `htmxResponse` aceita emoji em `trigger`; `handleError` que falha não derruba a resposta; `inspector()` some em produção.

## 0.4.0-beta.2 (02/11/2026)

- Exemplos, testes e o padrão de arquivo na documentação em inglês: `+name.partial.tsx`, `?/name`, `List`. A API não mudou.

## 0.4.0-beta.1 (02/11/2026)

**Mudança incompatível:** o `<Head>` agora liga `allowEval: false`. Quem usa `hx-on` precisa de `<Head htmx={{ allowEval: true }}>`.

- Nova entrada `htsx/kit`: rotas, parciais, `<Head>` e `<Outlet>` juntos.
- `partial()`: trecho de página que é componente tipado e tem URL própria (`?/nome`). Em arquivos, `+nome.partial.tsx`. Entrada validada por Standard Schema, com `guard` e os `load` dos layouts rodando antes.
- `event.htmx`: leitura do pedido e comandos da resposta, como `trigger` e `retarget`.
- Ação pode devolver `Response`, como `Lista.respond(props)`.
- Correção: resposta de `fail()` com 400 ou 422 agora aparece na tela com `<Head>`; antes, o htmx a descartava.

## 0.3.0-beta.1 (02/11/2026)

**Mudança incompatível:** o pacote agora se chama `htsx`. Troque `@mvcc-kit/htsx` nos imports, no `jsxImportSource` e no `package.json`, onde a dependência fica `"htsx": "github:mvcc-kit/htsx#v0.3.0-beta.1"`. O pacote `htsx` do npm é outro projeto.

- `<Head>` traz charset, viewport, htmx, Alpine e navegação por padrão. `false` desliga; objeto configura.
- `<Outlet>` com `hx-boost`: a navegação troca só o conteúdo. Com servidor, a resposta traz só a página e o título; em site estático, o cliente usa só esse trecho. Erro ou resposta sem `Outlet` cai para a navegação completa.
- Correção: pedido de restauração de histórico do htmx saía sem o layout.

## 0.2.0-beta.1 (02/11/2026)

**Mudança incompatível:** o pacote agora se chama `@mvcc-kit/htsx`, porque `@repo/*` é nome de uso interno. Troque o nome nos imports, no `jsxImportSource` e no `package.json`.

- Nova entrada `@mvcc-kit/htsx/meta`: `<Title>`, `<Meta>`, `<Link>`, `<Htmx>`, `<Alpine>` e `<Navigation>` em qualquer componente vão para o `<head>`. O conteúdo vence o layout. `head()` continua funcionando.

## 0.1.0-beta.1 (02/11/2026)

Primeira versão pública.

- JSX no servidor com escape por padrão, Alpine e htmx com cópia própria, e app com rotas, prerender e adaptadores estático, Cloudflare Workers e Bun.
- `Navigation` e `head({ navigation })`: transição entre páginas e pré-carregamento de links, com ou sem `defineApp`.
- Página sem layout que devolve `<html>` completo sai com `<!DOCTYPE html>`.
