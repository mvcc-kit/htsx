// Modo Cloudflare Workers (runtime): o Worker atende as rotas dinâmicas e deixa os arquivos
// estáticos e as páginas pré-renderizadas com o binding de Static Assets.
// Segue o worker do adapter-cloudflare do SvelteKit. Sem APIs só do Node, exceto
// AsyncLocalStorage (flag `nodejs_als` ou `nodejs_compat` no wrangler).
import type { App, RequestEvent } from '../app/app'

/** Mínimo do Static Assets binding (`env.ASSETS`). */
export interface AssetsFetcher {
  fetch(request: Request | string): Promise<Response>
}

/** Mínimo do ExecutionContext do Workers. */
export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException?(): void
}

/** `event.platform` no Cloudflare. */
export interface CloudflarePlatform<Env = Record<string, unknown>> {
  env: Env
  ctx: WorkerContext
  caches: unknown
  /** Dados de `request.cf` (país, colo, TLS...). */
  cf: unknown
}

/** Gerado por `buildCloudflare` em `.htsx/cloudflare-manifest.json`. */
export interface CloudflareManifest {
  /** Caminhos das páginas pré-renderizadas (ex.: `/sobre`). */
  prerendered: string[]
}

export interface CloudflareOptions {
  /** Nome do binding de assets no wrangler (`assets.binding`). Padrão `ASSETS`. */
  assetsBinding?: string
  manifest?: CloudflareManifest
  /** `event.dev`: mostra a pilha do erro. Só o `dev` do htsx liga. */
  dev?: boolean
}

/** Extras de quem chama, normalmente o `src/server.ts`. */
export interface WorkerFetchOptions {
  /** Valor inicial de `event.locals` nas rotas. */
  locals?: Record<string, unknown>
}

export interface Worker<Env> {
  fetch(request: Request, env: Env, ctx: WorkerContext, opts?: WorkerFetchOptions): Promise<Response>
}

/** As rotas do app como handler do Worker: `routes.fetch(request, env, ctx)` no `main` do wrangler. */
export function cloudflare<Env extends object = Record<string, unknown>>(app: App, opts: CloudflareOptions = {}): Worker<Env> {
  const binding = opts.assetsBinding ?? 'ASSETS'
  const prerendered = new Set(opts.manifest?.prerendered ?? [])

  return {
    async fetch(request, env, ctx, fetchOpts) {
      // Páginas pré-renderizadas (`prerender: 'auto'` ou quando o Worker roda antes dos assets)
      if (prerendered.size && (request.method === 'GET' || request.method === 'HEAD')) {
        const url = new URL(request.url)
        let pathname = url.pathname
        try { pathname = decodeURIComponent(pathname) } catch { /* URL inválida: segue como veio */ }
        const stripped = pathname !== '/' ? pathname.replace(/\/$/, '') : pathname
        if (prerendered.has(stripped)) {
          if (stripped !== pathname) return new Response(null, { status: 308, headers: { location: stripped + url.search } })
          const assets = (env as Record<string, unknown>)[binding] as AssetsFetcher | undefined
          if (!assets?.fetch) {
            throw new Error(`htsx: binding "${binding}" não existe no env; declare "assets": { "binding": "${binding}", "directory": ".htsx/cloudflare" } no wrangler.jsonc`)
          }
          let res = await assets.fetch(request)
          if (res.status >= 400) {
            // _headers vale para qualquer status; não deixe erro ficar em cache
            res = new Response(res.body, res)
            res.headers.set('cache-control', 'no-store')
          }
          return res
        }
      }

      const platform: CloudflarePlatform<Env> = {
        env,
        ctx,
        caches: (globalThis as { caches?: unknown }).caches,
        cf: (request as { cf?: unknown }).cf,
      }
      return app.respond(request, {
        platform: platform as unknown as Record<string, unknown>,
        getClientAddress: () => request.headers.get('cf-connecting-ip') ?? '',
        locals: fetchOpts?.locals,
        dev: opts.dev,
      })
    },
  }
}

/** `event.platform` tipado. Lança erro fora do Cloudflare (ex.: no prerender do build). */
export function cloudflarePlatform<Env = Record<string, unknown>>(event: Pick<RequestEvent, 'platform' | 'prerendering'>): CloudflarePlatform<Env> {
  const p = event.platform as Partial<CloudflarePlatform<Env>> | undefined
  if (!p?.env || !p.ctx) {
    throw new Error(event.prerendering
      ? 'htsx: env do Cloudflare não existe no prerender; tire prerender da rota ou só leia env quando !event.prerendering'
      : 'htsx: event.platform não veio do Cloudflare; rode o app com cloudflare(app) no Worker')
  }
  return p as CloudflarePlatform<Env>
}
