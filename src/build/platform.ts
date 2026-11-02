// `event.platform` do Cloudflare fora do Worker (dev, testes, prerender), como o `emulate()` do
// adapter-cloudflare do SvelteKit: o mesmo wrangler.jsonc vale em todo lugar, sem env separado.
// - Com `wrangler` instalado no projeto: `getPlatformProxy` → D1, R2, KV, DO... locais de verdade.
// - Sem ele: `vars` do wrangler.jsonc + `.dev.vars`; binding que precisa do wrangler dá erro claro.
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { CloudflarePlatform } from '../adapters/cloudflare'
import { parseJsonc } from '../adapters/cloudflare-build'

export interface EmulatedPlatform {
  platform: CloudflarePlatform
  /** `wrangler`: bindings locais reais; `vars`: só as variáveis. */
  source: 'wrangler' | 'vars'
  dispose(): Promise<void>
}

export interface EmulateOptions {
  /** Arquivo do wrangler. Padrão: wrangler.jsonc, wrangler.json ou wrangler.toml. */
  configPath?: string
  /** Passado ao `getPlatformProxy` (ex.: `{ persist: false }` nos testes). */
  platformProxy?: Record<string, unknown>
}

const BINDING_KINDS: Array<[string, string, string]> = [
  ['d1_databases', 'binding', 'D1'],
  ['r2_buckets', 'binding', 'R2'],
  ['kv_namespaces', 'binding', 'KV'],
  ['queues.producers', 'binding', 'Queue'],
  ['services', 'binding', 'Service'],
  ['analytics_engine_datasets', 'binding', 'Analytics Engine'],
  ['vectorize', 'binding', 'Vectorize'],
  ['hyperdrive', 'binding', 'Hyperdrive'],
  ['durable_objects.bindings', 'name', 'Durable Object'],
]

export function findWranglerConfig(root: string, configPath?: string): string | undefined {
  if (configPath) return path.resolve(root, configPath)
  return ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].map(f => path.join(root, f)).find(existsSync)
}

/** `KEY=valor` por linha (aspas opcionais, `#` comenta), como o `.dev.vars` do wrangler. */
export function parseDevVars(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

function pendingContext() {
  return {
    waitUntil(p: Promise<unknown>) { Promise.resolve(p).catch(err => console.error('htsx: erro em ctx.waitUntil', err)) },
    passThroughOnException() {},
  }
}

/** Plataforma emulada sem o wrangler: só `vars` e `.dev.vars`. */
async function fromVars(root: string, file: string | undefined): Promise<EmulatedPlatform> {
  const config = file && !file.endsWith('.toml') ? (parseJsonc(await Bun.file(file).text()) as Record<string, any>) : {}
  const vars: Record<string, unknown> = { ...config.vars }
  const devVars = path.join(root, '.dev.vars')
  if (existsSync(devVars)) Object.assign(vars, parseDevVars(await Bun.file(devVars).text()))

  const bindings = new Map<string, string>()
  for (const [key, field, kind] of BINDING_KINDS) {
    const list = key.split('.').reduce<any>((o, k) => o?.[k], config) as Array<Record<string, string>> | undefined
    for (const b of list ?? []) if (b[field]) bindings.set(b[field]!, kind)
  }
  if (config.ai?.binding) bindings.set(config.ai.binding, 'Workers AI')

  const env = new Proxy(vars, {
    get(target, prop) {
      if (typeof prop !== 'string' || prop in target) return Reflect.get(target, prop)
      const kind = bindings.get(prop)
      if (kind) throw new Error(`htsx: o binding "${prop}" (${kind}) precisa do wrangler fora do Worker; instale no projeto: bun add -d wrangler`)
      return undefined
    },
  })
  return { platform: { env, ctx: pendingContext(), caches: undefined, cf: {} }, source: 'vars', dispose: async () => {} }
}

/** Emula o `event.platform` do Worker a partir do wrangler do projeto. */
export async function emulateCloudflare(root: string, opts: EmulateOptions = {}): Promise<EmulatedPlatform> {
  const file = findWranglerConfig(root, opts.configPath)
  let wranglerPath: string | undefined
  try { wranglerPath = Bun.resolveSync('wrangler', root) } catch { /* não instalado: só vars */ }
  if (!wranglerPath || !file) return fromVars(root, file)

  const { getPlatformProxy } = (await import(wranglerPath)) as {
    getPlatformProxy(o: Record<string, unknown>): Promise<{ env: Record<string, unknown>; ctx: CloudflarePlatform['ctx']; caches: unknown; cf: unknown; dispose(): Promise<void> }>
  }
  const proxy = await getPlatformProxy({ configPath: file, ...opts.platformProxy })
  return {
    platform: { env: proxy.env, ctx: proxy.ctx, caches: proxy.caches, cf: proxy.cf },
    source: 'wrangler',
    dispose: () => proxy.dispose(),
  }
}
