# htsx

JSX no servidor para [HTMX](https://htmx.org) e [Alpine.js](https://alpinejs.dev), sem dependências. JSX vira string HTML: sem React, sem DOM virtual, sem hidratação. Roda em Bun, Cloudflare Workers e Node 18+.

```tsx
import { renderPage, VENDOR_PATH } from '@mvcc-kit/htsx'
import { Alpine, Htmx, Meta, Title } from '@mvcc-kit/htsx/meta'

export default {
  async fetch(req: Request): Promise<Response> {
    const html = await renderPage(() => (
      <html lang="pt-br">
        <head>
          <Title>Meu App</Title>
          <Meta name="description" content="Exemplo" />
          <Htmx vendor={VENDOR_PATH} />
          <Alpine vendor={VENDOR_PATH} />
        </head>
        <body>
          <h1 hx-get="/saudacao" hx-trigger="load">...</h1>
          <div x-data="{ n: 0 }"><button $click="n++" x-text="n"></button></div>
        </body>
      </html>
    ))
    return new Response(html, { headers: { 'content-type': 'text/html' } })
  },
}
```

## Instalação

Sem npm: a instalação vem direto do GitHub, por tag imutável. Só para Bun, porque `exports` aponta para os `.ts`.

```json
{ "dependencies": { "@mvcc-kit/htsx": "github:mvcc-kit/htsx#v0.2.0-beta.1" } }
```

E no `tsconfig.json`:

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@mvcc-kit/htsx" } }
```

## Versões

O htsx está em beta e a API ainda pode mudar. O que mudou em cada versão está em [`CHANGELOG.md`](CHANGELOG.md).

## Documentação

- [`SKILL.md`](SKILL.md): guia completo da API, com exemplos que compilam e rodam nos testes. É a fonte única; o `llms.txt` é gerado dele.
- [`AGENTS.md`](AGENTS.md): regras para quem mexe na biblioteca.
- [`RELEASING.md`](RELEASING.md): regras de versão e como publicar.
- [`docs/sveltekit-analise.md`](docs/sveltekit-analise.md): o que veio do SvelteKit (modos estático e Cloudflare) e o que falta.

Entradas públicas: `@mvcc-kit/htsx` (renderização), `@mvcc-kit/htsx/meta` (`<Title>`, `<Meta>`, `<Link>`, `<Htmx>`, `<Alpine>`), `@mvcc-kit/htsx/app` (rotas, load, ações, hooks; sem plataforma), `@mvcc-kit/htsx/config` (`htsx.config.ts`: modo, pastas e opções; roda os comandos sem CLI), `@mvcc-kit/htsx/project` (`loadApp`, `build`, `start`, `sync` em código), `@mvcc-kit/htsx/adapter-static`, `@mvcc-kit/htsx/adapter-cloudflare` (+ `/build`) e `@mvcc-kit/htsx/adapter-bun` (os modos de entrega), `@mvcc-kit/htsx/store` (cliente, `defineStore`), `@mvcc-kit/htsx/testing` (testes) e `@mvcc-kit/htsx/vendor/*` (Alpine e htmx fixados). Componentes prontos: `@mvcc-kit/htsx-ui` (pasta `ui/`).

## Num app

`htsx.config.ts` com `export default defineConfig({ adapter: cloudflareAdapter() })`, as rotas em `src/routes/` (`+page.tsx`, `+layout.tsx`...) e os scripts `bun --hot htsx.config.ts dev`, `bun htsx.config.ts build` e `bun htsx.config.ts start`. Detalhes no `SKILL.md`.

## Comandos desta biblioteca

```sh
bun test                  # testes (modo estrito ligado)
bun run typecheck         # tsc do núcleo e do ui/
bun run docs              # gera llms.txt a partir de SKILL.md
bun run scorecard         # testes, tamanho, o que some sem aviso, pendências
bun run vendor            # atualiza vendor/ (Alpine e htmx) conferindo a integridade
bun run build             # gera dist/
```

## Licença

MIT
