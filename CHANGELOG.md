# Changelog

Regras e fluxo: [`RELEASING.md`](RELEASING.md).

## 0.1.5-beta (04/11/2026)

### Corrigido

- `inlineStyles` mantém o `media` do link. Antes, um CSS de impressão passava a valer na tela.
- `applyMeta` troca só a tag escrita à mão com o mesmo `media`. Antes, a tag com `media` nunca era trocada, e a sem `media` podia apagar a que tinha.
- `applyMeta` não confunde `data-name` com `name`.

### Mudanças de quebra

- `inlineStyles` recusa CSS com endereço relativo, porque dentro do HTML ele contaria a partir da página. O que fazer: usar um caminho a partir da raiz, como `url(/x.png)`.
- `inlineStyles` e `fingerprintAssets` recusam arquivo que nenhum HTML cita, sem alterar nada. Antes, o arquivo era apagado ou movido em silêncio. O que fazer: citar o arquivo em um `href` ou `src` de HTML, ou tirá-lo da lista.

## 0.1.4-beta (03/11/2026)

### Adicionado

- `inlineStyles(outDir, files)` em `htsx/adapter-static`: põe o CSS pequeno dentro de cada HTML, para a primeira visita não esperar outro download, e devolve os hashes para a CSP.

## 0.1.3-beta (03/11/2026)

### Melhorado

- `applyMeta` põe `charset`, `viewport` e `<title>` no começo do `<head>`, antes de CSS e scripts e de tags escritas à mão.

## 0.1.2-beta (03/11/2026)

### Adicionado

- `fingerprintAssets(outDir, files)` em `htsx/adapter-static`: põe o hash no nome dos arquivos do projeto e atualiza os HTML, para o host dar cache longo sem misturar versões depois de um deploy.

### Corrigido

- `Meta` não junta mais tags de mesmo nome com `media` diferente, como `theme-color` no claro e no escuro.

## 0.1.1-beta (03/11/2026)

### Adicionado

- `src/server.ts` como `main` do wrangler no modo Cloudflare: recebe cada requisição antes das rotas, que vêm geradas em `.htsx/server.ts`, e também exporta Durable Objects, `scheduled` e `queue`.
- `routes.fetch(request, env, ctx, { locals })`: o que o servidor calcula chega às rotas em `event.locals`.
- `cloudflareAdapter({ server, wranglerBin })`.

### Melhorado

- `bun htsx.config.ts dev` no Cloudflare roda no workerd pelo `wrangler dev`, sem build. Rota nova, código e `static/` se atualizam sozinhos.
- O wrangler passa a empacotar o Worker, então o `build` só prepara os assets e as páginas prontas.
- O `dev` mostra a pilha do erro; `wrangler deploy` nunca, mesmo com `NODE_ENV=development`.
- O `dev` e o `build` recusam `tsconfig.json` com JSX errado, que só cairia em produção.
- `.htsx/routes.ts` e `.htsx/server.ts` só são gravados se mudaram, e o `dev` recarrega menos.
- `cloudflareAdapter({ wranglerBin: 'wrangler' })` aceita nome solto, vindo do PATH.

### Corrigido

- Um `sync` depois do `build`, como o `loadApp()` dos testes, não apaga mais a lista de páginas prontas.

### Segurança

- `event.locals` é copiado a cada requisição: objeto fixo passado em `respond(request, { locals })` não vaza entre requisições.

### Mudanças de quebra

- O build não gera mais `_worker.js`. No `wrangler.jsonc`, troque `"main": ".htsx/cloudflare/_worker.js"` por `"main": "src/server.ts"` ou, sem esse arquivo, por `"main": ".htsx/server.ts"`.
- `src/worker.ts` e `cloudflareAdapter({ worker })` saem. Passe o conteúdo para `src/server.ts`, com um `fetch` que chama `routes.fetch`.
- O `tsconfig.json` precisa de `"jsx": "react-jsx"` e `"jsxImportSource": "htsx"`, porque o wrangler lê o JSX dali.

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
