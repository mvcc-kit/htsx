// Modo servidor Bun: Bun.serve com o app, a pasta static/ e o vendor (Alpine/htmx com cache immutable).
import path from 'node:path'
import type { App } from '../app/app'
import { listFiles, VENDOR_DIR } from '../build/files'
import { VENDOR_PATH } from '../vendor-path'
import pins from '../../vendor/pins.json'

export interface BunServeOptions {
  port?: number
  hostname?: string
  /** Pasta de arquivos estáticos. Padrão `static`. */
  assets?: string
  /** Serve Alpine e htmx em VENDOR_PATH. Padrão `true`. */
  vendor?: boolean
  /** Vai para `event.platform` (ex.: conexão com o banco). */
  platform?: Record<string, unknown>
}

/** `event.platform` no modo Bun. */
export interface BunPlatform {
  server: { requestIP(req: Request): { address: string } | null }
  [key: string]: unknown
}

/** Responde arquivo de `static/` ou do vendor, ou `null` para seguir para o app. */
export async function staticHandler(assetsDir: string, vendor = true): Promise<(req: Request) => Response | null> {
  const files = new Set(await listFiles(assetsDir))
  const vendorFiles = new Map(Object.values(pins).map(p => [VENDOR_PATH + p.file, path.join(VENDOR_DIR, p.file)]))
  return req => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return null
    let p: string
    try { p = decodeURIComponent(new URL(req.url).pathname) } catch { return null }
    if (vendor && vendorFiles.has(p)) {
      return new Response(Bun.file(vendorFiles.get(p)!), { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
    }
    // só caminhos listados no início: nada de ../ saindo da pasta
    if (files.has(p)) return new Response(Bun.file(path.join(assetsDir, p)))
    return null
  }
}

/** Sobe o servidor. Devolve o `Bun.Server` (use `.stop()` para parar). */
export async function serve(app: App | (() => App), opts: BunServeOptions = {}) {
  const getApp = typeof app === 'function' ? app : () => app
  const assets = await staticHandler(path.resolve(opts.assets ?? 'static'), opts.vendor ?? true)
  const server = Bun.serve({
    port: opts.port ?? 3000,
    hostname: opts.hostname,
    async fetch(req, srv) {
      return assets(req) ?? getApp().respond(req, {
        platform: { ...opts.platform, server: srv },
        getClientAddress: () => srv.requestIP(req)?.address ?? '',
      })
    },
  })
  return server
}
