// Mesma suíte de testes nos modos de entrega: o app direto (app.respond), o build estático
// servido como um host estático e o Worker do Cloudflare com o Static Assets simulado.
import path from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'
import type { App } from '../app/app'
import { buildStatic, type StaticOptions } from '../adapters/static'
import { buildCloudflare, assetsFromDir, type CloudflareBuildOptions } from '../adapters/cloudflare-build'
import { cloudflare, type WorkerContext } from '../adapters/cloudflare'
import { fileServer } from '../build/files'

export type ModeName = 'app' | 'static' | 'cloudflare'

export interface Mode {
  name: ModeName
  /** `fetch('/blog/ola')`: caminho relativo à origem do teste. */
  fetch(pathname: string, init?: RequestInit): Promise<Response>
}

export interface ModesOptions {
  /** Modos a montar. Padrão: os três. */
  only?: ModeName[]
  /** Raiz do projeto (pasta `static`, `_headers`...). Padrão: diretório atual. */
  root?: string
  /** `env` do Worker (bindings e vars), sem o `ASSETS`. */
  env?: Record<string, unknown>
  origin?: string
  static?: Omit<StaticOptions, 'root' | 'outDir'>
  cloudflare?: Omit<CloudflareBuildOptions, 'root' | 'outDir' | 'manifest'>
}

/** Monta os modos para o mesmo app. Os builds vão para uma pasta temporária. */
export async function modes(app: App, opts: ModesOptions = {}): Promise<Mode[]> {
  const origin = opts.origin ?? 'http://localhost'
  const only = new Set(opts.only ?? ['app', 'static', 'cloudflare'])
  const root = path.resolve(opts.root ?? '.')
  const tmp = await mkdtemp(path.join(tmpdir(), 'htsx-modes-'))
  const out: Mode[] = []
  const url = (p: string) => new Request(origin + p)

  if (only.has('app')) {
    // como em desenvolvimento: static/ e o vendor servidos antes das rotas
    const files = fileServer(path.join(root, opts.static?.assets ?? 'static'), { vendor: true })
    out.push({
      name: 'app',
      fetch: async (p, init) => files(new Request(origin + p, init)) ?? app.respond(new Request(origin + p, init)),
    })
  }

  if (only.has('static')) {
    const outDir = path.join(tmp, 'static')
    const built = await buildStatic(app, { strict: false, ...opts.static, root, outDir })
    const assets = await assetsFromDir(built.outDir)
    const fallback = opts.static?.fallback === false ? null : opts.static?.fallback ?? '404.html'
    out.push({
      name: 'static',
      async fetch(p, init) {
        const method = init?.method ?? 'GET'
        if (method !== 'GET' && method !== 'HEAD') return new Response(null, { status: 405 })
        const res = await assets.fetch(url(p))
        if (res.status !== 404 || !fallback) return res
        // como um host estático: 404.html com status 404
        return new Response(Bun.file(path.join(built.outDir, fallback)), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })
      },
    })
  }

  if (only.has('cloudflare')) {
    const outDir = path.join(tmp, 'cloudflare')
    const built = await buildCloudflare(app, { wrangler: false, ...opts.cloudflare, root, outDir, manifest: path.join(tmp, 'manifest.json') })
    const assets = await assetsFromDir(built.outDir)
    const worker = cloudflare(app, { manifest: built.manifest })
    const ctx: WorkerContext = { waitUntil() {} }
    out.push({
      name: 'cloudflare',
      async fetch(p, init) {
        // como o Static Assets: arquivo existente é servido antes de chamar o Worker
        if (!init?.method || init.method === 'GET') {
          const hit = await assets.fetch(url(p))
          if (hit.status !== 404) return hit
        }
        return worker.fetch(new Request(origin + p, init), { ...opts.env, ASSETS: assets }, ctx)
      },
    })
  }
  return out
}
