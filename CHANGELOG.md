# Changelog

Regras e fluxo: [`RELEASING.md`](RELEASING.md).

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
