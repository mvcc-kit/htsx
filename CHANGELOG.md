# Changelog

Regras e fluxo: [`RELEASING.md`](RELEASING.md).

## 0.1.0-beta (03/11/2026)

Primeira versão beta. A numeração recomeçou aqui: as versões anteriores foram apagadas, e o código é o mesmo da última delas.

### Adicionado

- JSX que vira HTML no servidor, sem React e sem dependências em runtime.
- htmx e Alpine vendorizados, com `<Head>`, `<Title>`, `<Meta>`, `<Link>` e `<Outlet>`.
- `defineApp`, com rotas por arquivo: `+page.tsx`, `+layout.tsx` e `+name.partial.tsx`.
- Parciais tipados com `partial()`, em `?/name`, `.get`, `.lazy` e `.respond`.
- `event.htmx`, `href` tipado, `<Image>`, `<UserContent>`, `localPath()`, formulários, flash e SSE.
- Adaptadores estático, Cloudflare e Bun, com prerender.
- `htsx/kit`, `htsx/store`, `htsx/testing`, `htsx/config` e `htsx/project`.
- `dev` com recarga do navegador e erro com a pilha.

### Melhorado

- Navegação sem recarregar a página: só o trecho muda, com pré-carregamento e cache.
- Acessibilidade na troca de página: anúncio ao leitor de tela e foco no conteúdo.
- Barra de carregamento, proteção contra envio duplo, foco no campo com erro e âncora preservada.
- Alpine sob demanda, com `vendor: 'auto'`, ETag, 304 e gzip no modo Bun.

### Segurança

- CSRF, `securityHeaders`, `bodyLimit`, `contentSecurityPolicy()` e `createNonce()`.
- `Vary` completo nas respostas do htmx, e resposta que grava cookie sai como `private, no-store`.
- `localPath()` para redirecionar só a caminhos locais, e prerender que recusa redirecionamento malformado.
