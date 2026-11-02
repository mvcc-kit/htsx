# AGENTS.md: guia para agentes que mexem no htsx

`@repo/htsx` transforma JSX em HTML no servidor, para páginas com htmx e Alpine. Não é React: JSX vira string, sem DOM virtual. Roda em Bun e em Cloudflare Workers. Princípios gerais do repositório: [`docs/principios-ia-nativa.md`](../../docs/principios-ia-nativa.md). Revisão e plano: [`docs/revisao-2026-11-02.md`](docs/revisao-2026-11-02.md).

## Leia primeiro (5 minutos)

| Arquivo | Para quê |
|---|---|
| `index.ts` | Tudo o que é público. Não importe de `src/` fora daqui |
| `src/jsx-runtime.ts` | Como JSX vira string, e onde o escape acontece |
| `src/attrs.ts` e `src/escape.ts` | Atributos, URLs, CSS e JSON seguros |
| `SKILL.md` | Como usar a biblioteca num app |
| `docs/revisao-2026-11-02.md` | Falhas conhecidas e o plano em ordem |

## Regras fixas

1. **Zero dependência em tempo de execução.** `package.json` só tem dependências de desenvolvimento. Uma dependência nova exige pedido do dono e a revisão da regra 3b do `CLAUDE.md`.
2. **Escape por padrão, sempre.** Texto vindo de qualquer lugar é escapado. Só `raw()` e `HtmlSafeString` passam sem escape, e só com HTML gerado pelo próprio servidor. Toda falha de escape vira teste em `__tests__/security.test.ts` no mesmo commit.
3. **Nada some em silêncio.** Atributo inválido, `on*` bloqueado, URL trocada por `#` ou um filho que não dá para desenhar precisam gerar erro no modo estrito, com o nome do atributo ou do valor e a correção sugerida. Fora do modo estrito, o comportamento seguro continua.
4. **Funciona em Workers.** Sem APIs só do Node. `node:async_hooks` é aceito porque os Workers o oferecem com `nodejs_compat`.
5. **Navegador sem CDN em produção.** Alpine e htmx entram como cópia própria, fixada por versão e sha256. CDN só em exemplo ou desenvolvimento.
6. **Testes não dependem do relógio.** Espere a condição; use relógio falso em Suspense, SSE e flash.
7. **Núcleo não importa do design system.** `ui/` (`@repo/htsx-ui`) fica uma camada acima; `__tests__/layers.test.ts` falha se `src/` importar dele.
8. **Documentação junto com o código.** Mudou a API pública: atualize `SKILL.md`, `README.md` e `llms.txt` no mesmo commit. Exemplo de documentação precisa compilar e rodar.

## Antes de terminar

```sh
cd pkg/htsx
bun test             # 500+ testes; nenhum pode depender de tempo
bunx tsc --noEmit -p .
bunx tsc --noEmit -p ui   # design system @repo/htsx-ui
bun run scorecard         # placar: testes, tamanho, o que some sem aviso, pendências
```

O tamanho minificado tem teto em `size-limit.json` (testado em `__tests__/size.test.ts`). Se precisar subir, mude `maxBytes` e explique em `motivo`.

Depois rode `bun run check-types` na raiz, porque o `apps/email-worker` usa a biblioteca. Relate o que verificou e o que não verificou.
