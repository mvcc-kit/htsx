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
- [ ] Uma fonte de documentação: `SKILL.md` como fonte, `llms.txt` gerado dele, exemplos rodando como teste. Resolver a repetição entre `README.md`, `SKILL.md`, `llms.txt` e `PLAN.md`.
- [x] Falha 7 (baixa): `README.md` manda `bun add htsx`, mas o pacote é privado do workspace.

## P2. Testar interatividade como usuário, sem dependência

- [ ] Consultas ao HTML do servidor com `HTMLRewriter`: `page.text()`, `page.byTestId()`, `page.attr()`.
- [ ] Navegador real pelo Chrome DevTools Protocol com o `WebSocket` nativo do Bun: `type`, `press`, `waitFor`, `inspect` e `screenshot`. Seletores por texto, `id:` e `data-testid`; espera por condição, sem `sleep`.
- [ ] Inspetor só em desenvolvimento: `window.__htsx.inspect()` devolve o estado do Alpine em JSON e `__htsx.set(caminho, valor)` altera.

## P3. Alpine e htmx sem CDN

- [ ] Cópia própria em `vendor/`, com versão e sha256 num arquivo de pinos, e teste que confere o hash (falha 6).
- [ ] `head()` aceita caminho local e emite `integrity` quando usar CDN.

## P4. Signals com Alpine (futuro)

- [ ] `defineStore({ state, derived, actions })` tipado em TypeScript, empacotado pelo `Bun.build`: `$state` vira propriedade, `$derived` vira getter, `$effect` vira `Alpine.effect`.
- [ ] Servidor emite só o estado inicial com `safeJson`; tipos iguais no servidor e no cliente.
- [ ] Testes de derivados sem navegador.

## P5. Design system separado do núcleo

- [ ] Tokens e componentes base (Button, Field, Panel, Badge) num pacote à parte, por exemplo `@repo/htsx-ui`.
- [ ] Checagem que impede `src/` de importar desse pacote.

## P6. Placar

- [ ] `bun run scorecard`: número de testes, tamanho minificado, o que ainda some sem aviso e pendências desta lista.
- [ ] Teto de tamanho que falha o CI se crescer sem explicação.
