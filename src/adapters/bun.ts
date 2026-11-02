// Modo servidor Bun: Bun.serve com o app, a pasta static/ e o vendor (Alpine/htmx com cache immutable).
import path from 'node:path'
import type { App, Platform } from '../app/app'
import { fileServer } from '../build/files'

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
    fetch(req, server) {
      return files(req) ?? getApp().respond(req, {
        platform: { ...opts.platform, server },
        getClientAddress: () => server.requestIP(req)?.address ?? '',
      })
    },
  })
}
