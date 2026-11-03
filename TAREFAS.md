# Tarefas do htsx

Marque `[x]` ao terminar, no mesmo commit da mudança.

## P0. Segurança (antes de qualquer uso em produção)

- [x] Falha 1 (alta): componente que devolve texto comum sai sem escape. O retorno passa pelo mesmo caminho dos filhos; só `HtmlSafeString` passa direto. Teste que falhava antes em `__tests__/security.test.ts`.
- [x] Falha 2 (alta): texto dentro de `<script>` ou `<style>` consegue fechar a tag. Ali só aceitar `raw()` ou `HtmlSafeString`; texto comum vira erro. Teste que falhava antes.
- [x] Falha 3 (média): `aria-expanded={true}` sai sem valor e `aria-hidden={false}` some. Em `aria-*` e `data-*`, booleano vira `"true"` ou `"false"`. Teste que falhava antes.
- [x] Teste de entrada aleatória para o retorno de componentes e para filhos de `<script>` e `<style>`.
- [x] Falha 1 também na raiz: a string devolvida pela função de `renderPage`, `renderToString` e `htmxResponse` é escapada.
- [ ] Antes de corrigir a falha 1, conferir se algum app que usa o htsx devolve, de um componente, texto vindo de entrada externa.

## P1. Mais fácil para a IA

- [x] Modo estrito (`HTSX_STRICT=1`, sempre ligado nos testes): objeto, `Date`, `bigint`, atributo inválido, `on*` bloqueado e URL trocada por `#` viram erro com o nome do problema e a correção (falhas 4 e 5).
- [x] Tipos reais em `IntrinsicElements`: atributos HTML por elemento, mais `hx-*`, `x-*`, `$*`, `aria-*` e `data-*`. `clas=` passa a dar erro de compilação.
- [x] Exportar o tipo `Children` e aceitar `children?: Children`, acabando com `children as JSX.Element`.
- [x] Uma fonte de documentação: `SKILL.md` como fonte, `llms.txt` gerado dele, exemplos rodando como teste. Resolver a repetição entre `README.md`, `SKILL.md`, `llms.txt` e `PLAN.md`.
- [x] Falha 7 (baixa): `README.md` manda `bun add htsx`, mas o pacote é privado do workspace.

## P2. Testar interatividade como usuário, sem dependência

- [x] Consultas ao HTML do servidor com `HTMLRewriter`: `page.text()`, `page.byTestId()`, `page.attr()`.
- [x] Navegador real pelo Chrome DevTools Protocol com o `WebSocket` nativo do Bun: `type`, `press`, `waitFor`, `inspect` e `screenshot`. Seletores por texto, `id:` e `data-testid`; espera por condição, sem `sleep`.
- [x] Inspetor só em desenvolvimento: `window.__htsx.inspect()` devolve o estado do Alpine em JSON e `__htsx.set(caminho, valor)` altera.

## P3. Alpine e htmx sem CDN

- [x] Cópia própria em `vendor/`, com versão e sha256 num arquivo de pinos, e teste que confere o hash (falha 6).
- [x] `head()` aceita caminho local e emite `integrity` quando usar CDN.

## P4. Signals com Alpine (futuro)

- [x] `defineStore({ state, derived, actions })` tipado em TypeScript, empacotado pelo `Bun.build`: `$state` vira propriedade, `$derived` vira getter, `$effect` vira `Alpine.effect`.
- [x] Servidor emite só o estado inicial com `safeJson`; tipos iguais no servidor e no cliente.
- [x] Testes de derivados sem navegador.

## P5. Design system separado do núcleo

- [x] Tokens e componentes base (Button, Field, Panel, Badge) num pacote à parte, por exemplo `htsx-ui`.
- [x] Checagem que impede `src/` de importar desse pacote.

## P6. Placar

- [x] `bun run scorecard`: número de testes, tamanho minificado, o que ainda some sem aviso e pendências desta lista.
- [x] Teto de tamanho que falha o CI se crescer sem explicação.

## P7. Modos de entrega (estático e Cloudflare Workers)

Análise e origem de cada item: [`docs/sveltekit-analise.md`](docs/sveltekit-analise.md).

- [x] Núcleo do app sem plataforma: `defineApp`, `route` com params tipados, `load`, ações, `fail`/`redirect`/`error`, `handle`/`sequence`/`handleError`, cookies, CSRF, `trailingSlash`.
- [x] Prerender com crawler de links, `entries()` e falha em link quebrado, endpoint sem extensão e rota não alcançada.
- [x] Modo estático (`buildStatic`), que falha listando as rotas dinâmicas, como o adapter-static.
- [x] Modo Cloudflare Workers (`cloudflare`, `buildCloudflare`), com checagem do wrangler, `_headers`/`_redirects`, `.assetsignore`, manifesto e `cloudflarePlatform`.
- [x] Regra "lógica separada da implementação" no `AGENTS.md`, conferida em `__tests__/layers.test.ts`.
- [ ] Códigos de erro com link para a seção do `SKILL.md` (como `svelte.dev/e/kit/<código>`).
- [x] Rotas por arquivos (opcional): `+page.tsx`, `+page.server.ts`, `+layout.tsx`, `+layout.server.ts` com `parent()`, `+server.ts`, `+error.tsx`, grupos, `src/params`; o sync do `htsx.config.ts` gera o manifesto e os tipos `./$types`.
- [ ] Testar o Worker no `workerd` de verdade. Hoje é testado com `assetsFromDir` e `env` simulado; o `wrangler` entraria como dependência de desenvolvimento, que precisa do pedido do dono.
- [ ] Streaming de `load` (promessas resolvidas depois do primeiro byte).
- [x] Mesma suíte de testes de rota contra `app.respond`, contra o build estático e contra o Worker (`modes(app)` em `htsx/testing`).

## P8. Sem CLI: configuração como no SvelteKit

- [x] `htsx.config.ts` (`defineConfig`, `staticAdapter`/`cloudflareAdapter`/`bunAdapter`); o próprio arquivo roda `dev`, `build`, `start` e `sync`.
- [x] `src/hooks.server.ts` (`handle`, `handleError`, `context`) e `src/worker.ts` opcional (Durable Objects, `scheduled`, `queue`).
- [x] Build do Cloudflare empacota um único `.htsx/cloudflare/_worker.js` (sem manifesto versionado); tipos `./$types` gerados sozinhos.
- [x] Modo servidor Bun (`serve`, `start`).
- [x] `event.platform` igual em dev, testes e prerender: emulado pelo `wrangler.jsonc` (com o wrangler do projeto, D1/R2/KV locais reais; sem ele, `vars` e `.dev.vars`).
- [x] Testado no `workerd` real (`wrangler dev` no `_worker.js`) e com `getPlatformProxy` (D1/R2/KV locais), com o wrangler instalado à parte; `__tests__/wrangler.test.tsx` roda com `HTSX_WRANGLER_NODE_MODULES`.
- [ ] Durable Objects locais no dev (o `getPlatformProxy` precisa do script com a classe).

## P12. Performance (03/11/2026)

- [x] `bun run bench`: benchmark reproduzível do render e de `respond`.
- [x] Render 2x mais rápido: `HtmlSafeString` sem herdar de `String`, sem cópia de props, sem objeto de contexto por elemento, com cache de nomes de atributo e de elemento.
- [x] `<Title>`, `<Meta>` e `<Link>` sem promessa quando o conteúdo é síncrono; cookies e `event.htmx` sob demanda; resposta sem cópia para cabeçalhos.
- [x] Modo Bun: gzip com cache por versão e `ETag`/304 em arquivos.
- Sem índice de rotas: 200 rotas com parâmetro não mudam o tempo de forma mensurável (medido).
- [ ] Streaming de HTML: mandar o `<head>` antes do `load` terminar. Muda o tratamento de erro e de redirecionamento.

## P11. Auditoria de segurança (02/11/2026)

Testes em `__tests__/hardening.test.tsx`.

- [x] Open redirect por `//site/` no ajuste de barra final.
- [x] `javascript:` em `redirect()`, `event.htmx.redirect` e `location`, que o htmx executaria.
- [x] Atributos de URL com qualquer capitalização (`formAction`, `HREF`) e `data`, `poster`, `xlink:href` e outros.
- [x] XSS em `Suspense` com texto comum; token CSRF sem o id da sessão; injeção por CR em SSE.
- [x] Nome de elemento, função em atributo, `;` em CSS, atributos de cookie, cookie repetido e `constructor`.
- [x] Prerender não grava fora da saída; `inspector()` some em produção; `handleError` que falha; cabeçalhos de segurança.
- [ ] O registro do `Suspense` vive em uma requisição, mas o pedido do cliente é outra: o fluxo documentado não funciona no `defineApp`.
- [ ] Teto de corpo de requisição e limite de tempo fora do modo Bun.

## P10. Modo framework do htmx

- [x] `htsx/kit` e `partial()`: componente tipado com URL própria (`?/name`), `+name.partial.tsx`, `input` com Standard Schema, `guard` e `load` dos layouts antes do parcial.
- [x] `event.htmx`: leitura do pedido e comandos da resposta.
- [x] `<Head>` mais seguro por padrão: `allowEval: false`, e `fail()` com 400 ou 422 aparece na tela.
- [x] Parciais em arquivo no build estático.
- [x] `<Outlet preload>`: pré-carrega parciais em arquivo, com cache do host, sem baixar duas vezes.
- [x] Alpine sob demanda, `vendor: 'auto'` e `ETag` nas páginas renderizadas.
- [ ] `HX-Location` no lugar de `HX-Redirect` em `redirect()` dentro de um layout com `Outlet`.
- [ ] Morph (`idiomorph`), para manter foco e estado do Alpine na troca. Exige copiar mais uma biblioteca para `vendor/`.

## P9. Navegação fluida na raiz

- [x] `<Head>` com htmx, Alpine e navegação por padrão, e `<Outlet>`: navegação troca só o conteúdo, parcial no servidor e no estático, testado no Chrome real.
- [x] Pedido de restauração de histórico recebe a página inteira (saía sem layout).
- [x] Entrada `/meta`: `Title`, `Meta`, `Link`, `Htmx`, `Alpine` e `Navigation` de qualquer componente para o `<head>`, com as regras em `src/meta/logic.ts`.
- [x] `Navigation` e `head({ navigation })`: transição nativa entre páginas, pré-carregamento de links e htmx com a mesma transição, com ou sem `defineApp`, testado no Chrome real com CSP estrita.
- [x] Página sem `layout` que devolve `<html>` completo sai com `<!DOCTYPE html>` (saía em modo de compatibilidade).
