# SvelteKit: o que serve para o htsx

Análise de 02/11/2026 do repositório `sveltejs/kit` (commit `be36145`): `@sveltejs/kit` 3.1.1, `adapter-cloudflare` 8.0.2 e `adapter-static` 4.0.1. O objetivo é tirar dali práticas de DX, desempenho e qualidade que sirvam para uma biblioteca de SSR sem hidratação, com HTMX e Alpine.

## Resumo

O que o SvelteKit faz de melhor e que cabe aqui é a **separação entre a lógica do app e o lugar onde ele roda**. Rotas, `load`, ações, hooks e erros formam um servidor que só conhece `Request → Response`. Cada adaptador (`adapt(builder)`) decide como empacotar e onde entregar. O htsx passou a seguir esse desenho, com dois modos: **estático** e **Cloudflare Workers**.

O que não cabe: compilador Svelte, hidratação, roteador no cliente, Vite/HMR e remote functions. O htsx não tem bundle de cliente por padrão, então essas peças não se aplicam.

## O que foi adotado

| Prática do SvelteKit | Onde ela está no SvelteKit | No htsx |
|---|---|---|
| Servidor como `Request → Response`, sem plataforma; o adaptador só chama `server.respond()` | `runtime/server/respond.js`, `adapter-*/files/worker.js` | `defineApp().respond()` em `src/app/app.ts`; adaptadores em `src/adapters/` |
| Rotas `[param]`, `[[opcional]]`, `[...rest]` e `[param=matcher]`, com ordem determinística | `utils/routing.js` (`parse_route_id`) e `core/sync/create_manifest_data/sort.js` | `src/app/routing.ts`, com `params` tipados a partir do id (`ParamsOf<'/blog/[slug]'>`) |
| `load`, ações de formulário (`default` ou `?/nome`), `fail()`, `redirect()` e `error()` | `core-concepts/20-load`, `30-form-actions` | `route(id, { load, actions, page })` e `src/app/errors.ts` |
| Hooks `handle` + `sequence`, `handleError` com mensagem segura, `event.locals` | `advanced/20-hooks` | `handle`, `sequence`, `handleError`, `locals` e `getRequestEvent()` |
| CSRF por `Origin` em POST/PUT/PATCH/DELETE de formulário, com `trustedOrigins` | `runtime/server/csrf.js` | Ligado por padrão; 403 para formulário de outra origem |
| `cookies` com padrões seguros (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`) e `setHeaders` | `runtime/server/cookie.js` | `event.cookies` e `event.setHeaders` (`src/app/cookies.ts`); `Secure` sempre, menos em `http://localhost` |
| `trailingSlash: 'never'` com redirecionamento 308 | `page-options#trailingSlash` | Mesmo padrão; `'always'` grava `pasta/index.html` |
| Prerender com crawler de `<a href>`, `entries()` para rotas dinâmicas e build que falha em link quebrado ou rota não alcançada | `core/postbuild/prerender.js`, `crawl.js` | `src/build/prerender.ts` (usa `HTMLRewriter`) |
| Endpoint pré-renderizado precisa de extensão (`/feed.xml`), para o servidor estático saber o tipo | `page-options#Route-conflicts` | Erro no build com a correção |
| `adapter-static` falha se houver rota dinâmica, listando as rotas e as opções; `strict: false` para aceitar | `adapter-static/index.js` | `buildStatic` com a mesma mensagem e opções |
| Worker: assets e pré-renderizadas pelo binding `ASSETS`; erro ≥ 400 vindo dos assets com `no-store`; 308 de barra no fim para página pré-renderizada | `adapter-cloudflare/files/worker.js` | `cloudflare(app, { manifest })` em `src/adapters/cloudflare.ts` |
| `platform = { env, ctx, caches, cf }` e `getClientAddress` por `cf-connecting-ip` | `adapter-cloudflare` | `cloudflarePlatform<Env>(event)`, tipado, com erro claro fora do Worker e no prerender |
| Conferir o `wrangler.jsonc` no build: sem `site`, com `assets.directory` e `assets.binding` quando há `main` | `adapter-cloudflare/utils.js` (`validate_worker_settings`) | `validateWrangler`, que também exige `nodejs_als`/`nodejs_compat` (o contexto usa AsyncLocalStorage) e confere se `assets.directory` bate com a saída |
| `_headers` e `_redirects` na raiz do projeto, mesclados com os gerados; erro se estiverem em `static/` | `adapter-cloudflare/index.js` | Mesmo comportamento; redirecionamentos do prerender entram no `_redirects` |
| Arquivos com versão no caminho e cache `immutable` (`_app/immutable/*`) | `generate_headers` | `VENDOR_PATH = /_htsx/vendor/<hash dos pinos>/` com `Cache-Control: immutable` |
| `.assetsignore` para não publicar arquivos internos | `generate_assetsignore` | Gerado no build |
| Mensagens de erro com o problema e a correção | `messages/*.js` (com código e link) | Todas as mensagens `htsx: ...` dizem o que fazer |

Duas ideias são específicas do htsx, porque o HTMX muda o que a resposta deve ser:
- **Requisição htmx parcial sai sem layout.** Isso vale para `HX-Request` sem `HX-Boosted`. A resposta leva `Vary: HX-Request` para que o cache não misture fragmento e página.
- **`redirect()` numa requisição htmx também manda `HX-Redirect`.** Sem isso, o htmx trocaria só o alvo pelo conteúdo da página de destino.

## Lógica separada da implementação

Agora é uma regra do projeto (`AGENTS.md`, regra 9), conferida por `__tests__/layers.test.ts`:
- `src/app/` (lógica) não importa `src/adapters/` nem `src/build/`.
- O que roda no Worker não usa `node:*`, exceto `node:async_hooks`.
- O build (`src/build/`, `adapter-static`, `adapter-cloudflare/build`) usa `node:fs` e fica em entradas separadas. Assim, o Worker nunca carrega esse código.

Num app, isso vira três arquivos: `src/app.tsx` (rotas, sem plataforma), `build.ts` (estático) e `src/worker.tsx` (Cloudflare). O app é testado com `app.respond(new Request(...))`, sem plataforma.

## DX, desempenho e qualidade: o que mais vale copiar

Itens que ainda não foram feitos (entraram em `TAREFAS.md`, P7):

1. **Códigos de erro com link.** O SvelteKit gera `messages/*.js` a partir de Markdown, e cada erro tem código e URL (`https://svelte.dev/e/kit/<código>`). Vale fazer o mesmo com âncoras no `SKILL.md`.
2. ~~Rotas por arquivos~~ e 3. ~~tipos `$types` por pasta~~: feitos (`htsx sync`, `src/app/file-routes.ts`, `src/build/routes.ts`). Diferença do SvelteKit: não há `+page.ts`/`+layout.ts` universais, porque tudo roda no servidor. Os tipos usam `satisfies` em vez de reescrever o código-fonte, como faz o SvelteKit.
4. **`emulate()` em desenvolvimento.** O SvelteKit usa o `getPlatformProxy` do wrangler para ter `env` real no dev. Aqui há `assetsFromDir` e o `env` passado à mão. Integrar com o wrangler exigiria uma dependência de desenvolvimento, e isso precisa do seu pedido (regra 1).
5. **Streaming da página.** `load` que devolve promessas resolvidas depois do primeiro byte. O `Suspense` atual resolve por uma requisição separada.
6. **`precompress` no modo estático** (gzip e brotli dos arquivos), para hospedagens que não comprimem sozinhas. O Cloudflare comprime sozinho.
7. **Testes nos dois modos com a mesma suíte.** O SvelteKit roda os apps de teste em dev e em build. Aqui, um mesmo conjunto de testes de rota poderia rodar contra `app.respond`, contra o build estático e contra o Worker com `assetsFromDir`.
8. **Changesets e changelog por pacote**, quando houver mais de um consumidor.

## O que não serve aqui

- **Hidratação, roteador no cliente, `csr`/`ssr`, snapshots, shallow routing.** O htsx não tem componentes no cliente. A interatividade é HTMX e Alpine.
- **Remote functions (`query`/`form`/`command`).** Dependem de RPC gerado e serialização com devalue. As ações de formulário e os endpoints cobrem o caso sem JavaScript gerado.
- **Vite como base.** O htsx usa Bun (`Bun.build`, `bun test`) e nenhuma dependência de execução. Trazer o Vite contraria a regra 1.
- **Cloudflare Pages com `_routes.json`.** O próprio SvelteKit trata o Pages como legado e prefere Workers + Static Assets. O htsx só gera para Workers.
