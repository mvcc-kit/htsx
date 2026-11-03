// Modo servidor Bun: Bun.serve com o app, a pasta static/ e o vendor (Alpine/htmx com cache immutable).
import path from 'node:path'
import type { App, Platform } from '../app/app'
import { fileServer } from '../build/files'
import { injectLiveReload, LIVE_RELOAD_PATH, type LiveReload } from '../build/live-reload'
import { acceptsGzip, isCompressible, MAX_COMPRESS_BYTES, MIN_COMPRESS_BYTES } from './compression'

export interface BunServeOptions {
  port?: number
  hostname?: string
  /** Pasta de arquivos estáticos. Padrão `static`. */
  assets?: string
  /** Serve Alpine e htmx em VENDOR_PATH. Padrão `true`. */
  vendor?: boolean
  /** Vai para `event.platform` junto com `server` (ex.: conexão com o banco). */
  platform?: Platform
  /** Tamanho máximo do corpo da requisição, em bytes. Padrão 10 MB. */
  maxBodySize?: number
  /** Lembra a busca de arquivos estáticos (produção). Padrão `true`. */
  cacheFiles?: boolean
  /** Segundos até fechar conexão parada, contra quem abre e não usa. Padrão do Bun: 10. SSE não conta. */
  idleTimeout?: number
  /** Só o `dev`: recarrega o navegador e mostra a pilha do erro. */
  dev?: LiveReload
  /** Comprime HTML, CSS, JS e JSON com gzip. Padrão `true`; `false` se um proxy já comprime. */
  compress?: boolean
}

/** `event.platform` no modo Bun. */
export interface BunPlatform {
  server: { requestIP(req: Request): { address: string } | null }
  [key: string]: unknown
}

/** Sobe o servidor. Aceita uma função para trocar o app sem reiniciar (dev). Devolve o `Bun.Server`. */
export function serve(app: App | (() => App), opts: BunServeOptions = {}) {
  const getApp = typeof app === 'function' ? app : () => app
  const files = fileServer(path.resolve(opts.assets ?? 'static'), { vendor: opts.vendor ?? true, cache: opts.cacheFiles ?? true })
  return Bun.serve({
    port: opts.port ?? 3000,
    hostname: opts.hostname,
    maxRequestBodySize: opts.maxBodySize ?? 10 * 1024 * 1024,
    idleTimeout: opts.idleTimeout,
    async fetch(req, server) {
      if (opts.dev && new URL(req.url).pathname === LIVE_RELOAD_PATH) {
        server.timeout(req, 0)
        return opts.dev.response()
      }
      const answered = await (files(req) ?? getApp().respond(req, {
        platform: { ...opts.platform, server },
        getClientAddress: () => server.requestIP(req)?.address ?? '',
        dev: !!opts.dev,
      }))
      // SSE fica parado entre eventos: sem isto, o Bun fecharia a conexão.
      if (answered.headers.get('content-type')?.startsWith('text/event-stream')) server.timeout(req, 0)
      const res = opts.dev ? await withLiveReload(answered, req) : answered
      return opts.compress === false ? res : compressed(req, res)
    },
  })
}

async function withLiveReload(res: Response, req: Request): Promise<Response> {
  const isPage = res.headers.get('content-type')?.startsWith('text/html') && req.headers.get('hx-request') !== 'true'
  if (!isPage || !res.body) return res
  const headers = new Headers(res.headers)
  headers.delete('etag')
  return new Response(injectLiveReload(await res.text()), { status: res.status, statusText: res.statusText, headers })
}

// O mesmo conteúdo não precisa ser comprimido de novo: ETag ou arquivo imutável identificam a versão.
const gzipCache = new Map<string, Uint8Array<ArrayBuffer>>()
const GZIP_CACHE_ENTRIES = 200
const GZIP_CACHE_MAX_BYTES = 1024 * 1024

function gzipOnce(key: string | null, body: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const known = key ? gzipCache.get(key) : undefined
  if (known) return known
  const out = Bun.gzipSync(body) as Uint8Array<ArrayBuffer>
  if (key && body.byteLength <= GZIP_CACHE_MAX_BYTES) {
    if (gzipCache.size >= GZIP_CACHE_ENTRIES) gzipCache.clear()
    gzipCache.set(key, out)
  }
  return out
}

async function compressed(req: Request, res: Response): Promise<Response> {
  const type = res.headers.get('content-type')
  if (!res.body || !acceptsGzip(req.headers.get('accept-encoding')) || !isCompressible(type) || res.headers.has('content-encoding')) return res
  const body = new Uint8Array(await res.arrayBuffer())
  const headers = new Headers(res.headers)
  headers.append('vary', 'Accept-Encoding')
  // Muito grande: comprimir aqui travaria as outras requisições enquanto dura.
  if (body.byteLength < MIN_COMPRESS_BYTES || body.byteLength > MAX_COMPRESS_BYTES) return new Response(body, { status: res.status, statusText: res.statusText, headers })
  headers.set('content-encoding', 'gzip')
  const etag = res.headers.get('etag')
  const version = etag ?? (res.headers.get('cache-control')?.includes('immutable') ? 'immutable' : null)
  // Resposta que grava cookie é de uma pessoa: não fica guardada na memória.
  const key = version && res.status === 200 && !res.headers.has('set-cookie') ? `${new URL(req.url).pathname}|${version}` : null
  return new Response(gzipOnce(key, body), { status: res.status, statusText: res.statusText, headers })
}
