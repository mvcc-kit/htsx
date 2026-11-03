# Changelog

Regras e fluxo: [`RELEASING.md`](RELEASING.md).

## 0.2.0-beta.1 (02/11/2026)

**Mudança incompatível:** o pacote agora se chama `@mvcc-kit/htsx`, porque `@repo/*` é nome de uso interno. Troque o nome nos imports, no `jsxImportSource` e no `package.json`.

- Nova entrada `@mvcc-kit/htsx/meta`: `<Title>`, `<Meta>`, `<Link>`, `<Htmx>`, `<Alpine>` e `<Navigation>` em qualquer componente vão para o `<head>`. O conteúdo vence o layout. `head()` continua funcionando.

## 0.1.0-beta.1 (02/11/2026)

Primeira versão pública.

- JSX no servidor com escape por padrão, Alpine e htmx com cópia própria, e app com rotas, prerender e adaptadores estático, Cloudflare Workers e Bun.
- `Navigation` e `head({ navigation })`: transição entre páginas e pré-carregamento de links, com ou sem `defineApp`.
- Página sem layout que devolve `<html>` completo sai com `<!DOCTYPE html>`.
