# htsx

JSX no servidor para [HTMX](https://htmx.org) e [Alpine.js](https://alpinejs.dev), sem dependências. JSX vira string HTML: sem React, sem DOM virtual, sem hidratação. Roda em Bun, Cloudflare Workers e Node 18+.

```tsx
import { head, raw, renderPage } from '@repo/htsx'

const HEAD = head({ title: 'Meu App', htmx: true, alpine: true, vendor: '/static/vendor/' })

export default {
  async fetch(req: Request): Promise<Response> {
    const html = await renderPage(() => (
      <html lang="pt-br">
        <head>{raw(HEAD)}</head>
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

`@repo/htsx` é um pacote privado do workspace (não está no npm). No `package.json` do app:

```json
{ "dependencies": { "@repo/htsx": "workspace:*" } }
```

E no `tsconfig.json`:

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@repo/htsx" } }
```

## Documentação

- [`SKILL.md`](SKILL.md): guia completo da API, com exemplos que compilam e rodam nos testes. É a fonte única; o `llms.txt` é gerado dele.
- [`AGENTS.md`](AGENTS.md): regras para quem mexe na biblioteca.
- [`docs/revisao-2026-11-02.md`](docs/revisao-2026-11-02.md): revisão de segurança e plano.
- [`docs/sveltekit-analise.md`](docs/sveltekit-analise.md): o que veio do SvelteKit (modos estático e Cloudflare) e o que falta.

Entradas públicas: `@repo/htsx` (renderização), `@repo/htsx/app` (rotas, load, ações, hooks; sem plataforma), `@repo/htsx/config` (`htsx.config.ts`: modo, pastas e opções; roda os comandos sem CLI), `@repo/htsx/project` (`loadApp`, `build`, `start`, `sync` em código), `@repo/htsx/adapter-static`, `@repo/htsx/adapter-cloudflare` (+ `/build`) e `@repo/htsx/adapter-bun` (os modos de entrega), `@repo/htsx/store` (cliente, `defineStore`), `@repo/htsx/testing` (testes) e `@repo/htsx/vendor/*` (Alpine e htmx fixados). Componentes prontos: `@repo/htsx-ui` (pasta `ui/`).

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
