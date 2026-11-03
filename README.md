# htsx

JSX no servidor para [HTMX](https://htmx.org) e [Alpine.js](https://alpinejs.dev), sem dependências. JSX vira string HTML: sem React, sem DOM virtual, sem hidratação. Roda em Bun, Cloudflare Workers e Node 18+.

```tsx
import { renderPage } from 'htsx'
import { Head, Outlet, Title } from 'htsx/meta'

export default {
  async fetch(req: Request): Promise<Response> {
    const html = await renderPage(() => (
      <html lang="pt-br">
        <Head>
          <Title>Meu App</Title>
        </Head>
        <body hx-boost="true">
          <nav><a href="/">Início</a></nav>
          <Outlet>
            <h1 hx-get="/saudacao" hx-trigger="load">...</h1>
            <div x-data="{ n: 0 }"><button $click="n++" x-text="n"></button></div>
          </Outlet>
        </body>
      </html>
    ))
    return new Response(html, { headers: { 'content-type': 'text/html' } })
  },
}
```

## Instalação

Sem npm: a instalação vem direto do GitHub, por tag imutável. Só para Bun, porque `exports` aponta para os `.ts`. O pacote `htsx` do npm é outro projeto: use sempre `github:`.

```json
{ "dependencies": { "htsx": "github:mvcc-kit/htsx#v0.4.0-beta.2" } }
```

E no `tsconfig.json`:

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "htsx" } }
```

## Versões

O htsx está em beta e a API ainda pode mudar. O que mudou em cada versão está em [`CHANGELOG.md`](CHANGELOG.md).

## Documentação

- [`SKILL.md`](SKILL.md): guia completo da API, com exemplos que compilam e rodam nos testes. É a fonte única; o `llms.txt` é gerado dele.
- [`AGENTS.md`](AGENTS.md): regras para quem mexe na biblioteca.
- [`RELEASING.md`](RELEASING.md): regras de versão e como publicar.
- [`docs/sveltekit-analise.md`](docs/sveltekit-analise.md): o que veio do SvelteKit (modos estático e Cloudflare) e o que falta.

Entradas públicas: `htsx/kit` (modo framework: rotas, parciais e `<Head>` juntos), `htsx` (só renderização, para qualquer servidor), `htsx/meta` (`<Title>`, `<Meta>`, `<Link>`, `<Htmx>`, `<Alpine>`), `htsx/app` (rotas, load, ações, hooks; sem plataforma), `htsx/config` (`htsx.config.ts`: modo, pastas e opções; roda os comandos sem CLI), `htsx/project` (`loadApp`, `build`, `start`, `sync` em código), `htsx/adapter-static`, `htsx/adapter-cloudflare` (+ `/build`) e `htsx/adapter-bun` (os modos de entrega), `htsx/store` (cliente, `defineStore`), `htsx/testing` (testes) e `htsx/vendor/*` (Alpine e htmx fixados). Componentes prontos: `htsx-ui` (pasta `ui/`).

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
