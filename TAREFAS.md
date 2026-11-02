# Tarefas do htsx

Detalhes de cada falha e de cada etapa: [`docs/revisao-2026-11-02.md`](docs/revisao-2026-11-02.md). Marque `[x]` ao terminar, no mesmo commit da mudança.

## P0. Segurança (antes de qualquer uso em produção)

- [x] Falha 1 (alta): componente que devolve texto comum sai sem escape. O retorno passa pelo mesmo caminho dos filhos; só `HtmlSafeString` passa direto. Teste que falhava antes em `__tests__/security.test.ts`.
- [x] Falha 2 (alta): texto dentro de `<script>` ou `<style>` consegue fechar a tag. Ali só aceitar `raw()` ou `HtmlSafeString`; texto comum vira erro. Teste que falhava antes.
- [x] Falha 3 (média): `aria-expanded={true}` sai sem valor e `aria-hidden={false}` some. Em `aria-*` e `data-*`, booleano vira `"true"` ou `"false"`. Teste que falhava antes.
- [x] Teste de entrada aleatória para o retorno de componentes e para filhos de `<script>` e `<style>`.
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

- [x] Tokens e componentes base (Button, Field, Panel, Badge) num pacote à parte, por exemplo `@repo/htsx-ui`.
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
- [x] Rotas por arquivos (opcional): `+page.tsx`, `+page.server.ts`, `+layout.tsx`, `+layout.server.ts` com `parent()`, `+server.ts`, `+error.tsx`, grupos, `src/params`; `htsx sync` gera o manifesto e os tipos `./$types`.
- [ ] Testar o Worker no `workerd` de verdade. Hoje é testado com `assetsFromDir` e `env` simulado; o `wrangler` entraria como dependência de desenvolvimento, que precisa do pedido do dono.
- [ ] Streaming de `load` (promessas resolvidas depois do primeiro byte).
- [ ] Mesma suíte de testes de rota contra `app.respond`, contra o build estático e contra o Worker.
