# Changelog

## Regras de versão

- Cada versão é uma tag `vX.Y.Z` ou `vX.Y.Z-beta.N`, igual a `version` em `package.json`.
- Tag publicada não muda nem é apagada. Correção vira versão nova.
- Em beta, a API pode mudar entre versões: a mudança incompatível aparece aqui, com o que fazer.
- `v1.0.0` só quando a API estiver estável.
- Quem usa fixa a tag exata, nunca um branch: `github:mvcc-kit/htsx#vX.Y.Z-beta.N`.
- Antes da tag: `bun test`, `bunx tsc --noEmit -p .`, `bunx tsc --noEmit -p ui` e teste num projeto que usa a biblioteca.

## 0.1.0-beta.1 (02/11/2026)

Primeira versão pública.

- JSX no servidor com escape por padrão, Alpine e htmx com cópia própria, e app com rotas, prerender e adaptadores estático, Cloudflare Workers e Bun.
- `Navigation` e `head({ navigation })`: transição entre páginas e pré-carregamento de links, com ou sem `defineApp`.
- Página sem layout que devolve `<html>` completo sai com `<!DOCTYPE html>`.
