// Comandos de `bun htsx.config.ts <comando>` e as funções equivalentes para usar em código.
// Só Bun (build, dev, servidor): nunca vai para o Worker.
import { existsSync, watch } from 'node:fs'
import { createLiveReload } from './live-reload'
import path from 'node:path'
import { defineApp, type App, type AppOptions } from '../app/app'
import type { FileRoutes } from '../app/file-routes'
import type { CloudflareAdapter, Command, HtsxConfig } from '../config/config'
import { buildStatic } from '../adapters/static'
import { buildCloudflare } from '../adapters/cloudflare-build'
import { serve } from '../adapters/bun'
import { EXTS, syncRoutes } from './routes'
import { emulateCloudflare, type EmulatedPlatform } from './platform'
import type { Platform } from '../app/app'

/** Arquivo opcional (`src/hooks.server` + extensão); `undefined` se não existir. */
function optionalFile(root: string, file: string): string | undefined {
  const abs = path.resolve(root, file)
  if (existsSync(abs)) return abs
  return EXTS.map(e => abs + e).find(f => existsSync(f))
}

const hooksFile = (config: HtsxConfig, root: string) => optionalFile(root, config.hooks ?? 'src/hooks.server')
const outDirOf = (config: HtsxConfig, root: string) => path.resolve(root, config.out ?? '.htsx')

/** Gera o manifesto e os tipos `./$types` (o que a CLI `sync` fazia). */
export async function sync(config: HtsxConfig, root = '.') {
  return syncRoutes({ root, routes: config.routes, params: config.params, out: config.out, pkg: config.pkg })
}

let generation = 0

/** App carregado da configuração; `close()` libera a plataforma emulada (wrangler). */
export interface LoadedApp extends App {
  /** De onde vem `event.platform` fora do Worker: `wrangler` (bindings locais), `vars` ou nenhuma. */
  readonly platformSource: EmulatedPlatform['source'] | 'none'
  /** O mesmo `event.platform` das requisições (ex.: preparar o D1 num teste). */
  readonly platform: Platform | undefined
  close(): Promise<void>
}

export interface LoadOptions {
  /** Plataforma já emulada (o dev reaproveita entre recargas). */
  platform?: EmulatedPlatform
}

async function resolveConfig(root: string): Promise<HtsxConfig> {
  const file = optionalFile(root, 'htsx.config')
  if (!file) throw new Error(`htsx: htsx.config.ts não encontrado em ${root}; crie um com export default defineConfig({ adapter: ... })`)
  return ((await import(file)) as { default: HtsxConfig }).default
}

/** Plataforma de fora do Worker para o modo da configuração (só o Cloudflare tem uma). */
export async function emulatePlatform(config: HtsxConfig, root: string): Promise<EmulatedPlatform | undefined> {
  const a = config.adapter
  if (a.name !== 'cloudflare') return undefined
  return emulateCloudflare(root, { configPath: a.wrangler || undefined, platformProxy: a.platformProxy })
}

/**
 * Monta o app a partir da configuração: rotas por arquivos + hooks + opções, com o mesmo
 * `event.platform` do modo (no Cloudflare, emulado pelo wrangler.jsonc). Sem `config`, lê
 * `htsx.config.ts` da raiz. Use nos testes: `const app = await loadApp()`.
 */
export async function loadApp(config?: HtsxConfig, root = '.', opts: LoadOptions = {}): Promise<LoadedApp> {
  root = path.resolve(root)
  config ??= await resolveConfig(root)
  const result = await sync(config, root)
  // `?v=` força recarregar o manifesto quando as rotas mudam (dev)
  const { files } = (await import(`${result.manifest}?v=${++generation}`)) as { files: FileRoutes }
  const hooksPath = hooksFile(config, root)
  const hooks: Partial<Pick<AppOptions, 'handle' | 'handleError' | 'context'>> = hooksPath ? await import(hooksPath) : {}
  const app = defineApp({ ...files, ...config.options, handle: hooks.handle, handleError: hooks.handleError, context: hooks.context })
  const emulated = opts.platform ?? (await emulatePlatform(config, root))
  const owned = !opts.platform
  const platform = emulated?.platform as unknown as Platform | undefined
  return {
    ...app,
    platformSource: emulated?.source ?? 'none',
    platform,
    respond: (request, o = {}) => app.respond(request, { platform, ...o }),
    fetch: request => app.respond(request, { platform }),
    close: async () => { if (owned) await emulated?.dispose() },
  }
}

/** Código do Worker gerado: o app + o módulo opcional `src/worker.ts` (Durable Objects, scheduled...). */
function workerEntry(config: HtsxConfig, adapter: CloudflareAdapter, root: string, manifest: object): string {
  const out = outDirOf(config, root)
  const rel = (abs: string) => JSON.stringify(path.relative(out, abs).split(path.sep).join('/').replace(/^(?!\.)/, './').replace(/\.(tsx?|jsx?)$/, ''))
  const pkg = config.pkg ?? 'htsx'
  const hooks = hooksFile(config, root)
  const extra = optionalFile(root, adapter.worker ?? 'src/worker')
  if (adapter.worker && !extra) throw new Error(`htsx: cloudflare.worker aponta para ${adapter.worker}, que não existe`)
  return [
    '// Gerado pelo build do htsx (modo Cloudflare). Não edite.',
    `import { defineApp } from ${JSON.stringify(pkg + '/app')}`,
    `import { cloudflare } from ${JSON.stringify(pkg + '/adapter-cloudflare')}`,
    `import { files } from './routes'`,
    hooks ? `import * as hooks from ${rel(hooks)}` : 'const hooks = {} as Record<string, undefined>',
    extra ? `import * as extra from ${rel(extra)}\nexport * from ${rel(extra)}` : 'const extra = {} as { default?: object }',
    '',
    `const app = defineApp({ ...files, ...${JSON.stringify(config.options ?? {})}, handle: hooks.handle, handleError: hooks.handleError, context: hooks.context })`,
    `const worker = cloudflare(app, { manifest: ${JSON.stringify(manifest)}, assetsBinding: ${JSON.stringify(adapter.assetsBinding ?? 'ASSETS')} })`,
    '',
    '// fetch do htsx + scheduled/queue/email do src/worker.ts, se houver',
    'export default { ...(extra.default ?? {}), fetch: worker.fetch }',
    '',
  ].join('\n')
}

/** Build do modo configurado. */
export async function build(config: HtsxConfig, root = '.'): Promise<{ outDir: string; files?: string[] }> {
  root = path.resolve(root)
  const app = await loadApp(config, root)   // prerender com o mesmo event.platform do dev
  try {
    return await buildWith(app, config, root)
  } finally {
    await app.close()
  }
}

async function buildWith(app: App, config: HtsxConfig, root: string): Promise<{ outDir: string; files?: string[] }> {
  const adapter = config.adapter
  const assets = config.assets ?? 'static'

  if (adapter.name === 'static') {
    const r = await buildStatic(app, { root, assets, outDir: adapter.outDir, fallback: adapter.fallback, strict: adapter.strict })
    console.log(`htsx: site estático em ${path.relative(root, r.outDir)} (${r.files.length} arquivos)`)
    return r
  }

  if (adapter.name === 'cloudflare') {
    const out = outDirOf(config, root)
    const r = await buildCloudflare(app, { root, assets, outDir: adapter.outDir, wrangler: adapter.wrangler, manifest: path.join(out, 'cloudflare-manifest.json'), expectMain: path.join(path.resolve(root, adapter.outDir ?? '.htsx/cloudflare'), '_worker.js') })
    const entry = path.join(out, 'worker.ts')
    await Bun.write(entry, workerEntry(config, adapter, root, r.manifest))
    const bundled = await Bun.build({
      entrypoints: [entry],
      outdir: r.outDir,
      naming: '_worker.js',
      target: 'browser',
      conditions: ['workerd', 'worker', 'browser'],
      format: 'esm',
      minify: true,
      // JSX do htsx explícito: não depende do tsconfig do projeto ser lido pelo bundler
      jsx: { runtime: 'automatic', importSource: config.pkg ?? 'htsx', development: false },
      // node:async_hooks vem da flag nodejs_als; cloudflare:* é do próprio runtime
      external: ['node:*', 'cloudflare:*'],
    })
    if (!bundled.success) throw new AggregateError(bundled.logs, 'htsx: o bundle do Worker falhou')
    console.log(`htsx: Worker em ${path.relative(root, path.join(r.outDir, '_worker.js'))}; rotas dinâmicas: ${r.dynamic.join(', ') || 'nenhuma'}`)
    return r
  }

  await sync(config, root)
  console.log('htsx: modo bun não tem build; rode bun htsx.config.ts start')
  return { outDir: root }
}

/** Servidor Bun com as rotas. `watch` recarrega quando arquivos de rota entram ou saem. */
export async function start(config?: HtsxConfig, root = '.', opts: { watch?: boolean; port?: number } = {}) {
  root = path.resolve(root)
  config ??= await resolveConfig(root)
  const cfg = config
  // emulada uma vez: as recargas do dev reaproveitam (o wrangler sobe o workerd local)
  const emulated = await emulatePlatform(cfg, root)
  let app = await loadApp(cfg, root, { platform: emulated })
  const adapter = cfg.adapter
  const port = opts.port ?? (adapter.name === 'bun' ? adapter.port : undefined) ?? Number(process.env.PORT ?? 3000)
  const live = opts.watch ? createLiveReload() : undefined
  const server = serve(() => app, {
    dev: live,
    port,
    // dev só na máquina (como o Vite); produção em todas as interfaces
    hostname: (adapter.name === 'bun' ? adapter.hostname : undefined) ?? (opts.watch ? 'localhost' : '0.0.0.0'),
    maxBodySize: adapter.name === 'bun' ? adapter.maxBodySize : undefined,
    cacheFiles: !opts.watch,
    assets: path.resolve(root, cfg.assets ?? 'static'),
    platform: emulated?.platform as unknown as Platform | undefined,
  })
  const watchers: Array<{ close(): void }> = []
  if (opts.watch) {
    let pending: Promise<void> | undefined
    for (const d of [cfg.routes ?? 'src/routes', cfg.params ?? 'src/params'].map(x => path.resolve(root, x))) {
      if (!existsSync(d)) continue
      watchers.push(watch(d, { recursive: true }, ev => {
        // arquivo novo/apagado muda o manifesto; mudança de conteúdo o `bun --hot` já recarrega
        if (ev !== 'rename') { live?.notify(); return }
        if (pending) return
        pending = loadApp(cfg, root, { platform: emulated }).then(a => { app = a; live?.notify() }, e => console.error((e as Error).message)).finally(() => { pending = undefined })
      }))
    }
  }
  if (emulated) console.log(`htsx: event.platform.env do ${emulated.source === 'wrangler' ? 'wrangler (bindings locais)' : 'wrangler.jsonc/.dev.vars (instale o wrangler para D1/R2/KV locais)'}`)
  console.log(`htsx: http://${server.hostname}:${server.port}`)
  return {
    hostname: server.hostname,
    port: server.port,
    url: server.url,
    /** Para o servidor, os observadores e a plataforma emulada. */
    async stop() {
      for (const w of watchers) w.close()
      live?.close()
      server.stop(true)
      await emulated?.dispose()
    },
  }
}

export async function run(cmd: Command, config: HtsxConfig, root: string): Promise<void> {
  if (cmd === 'sync') { const r = await sync(config, root); console.log(`htsx: ${r.routes.length} rotas, tipos em ${path.relative(root, outDirOf(config, root))}/types`); return }
  if (cmd === 'build') { await build(config, root); return }
  const server = await start(config, root, { watch: cmd === 'dev' })
  // Ctrl+C / parada do processo: fecha o servidor e o wrangler local antes de sair
  const stop = () => { void server.stop().finally(() => process.exit(0)) }
  // Cast estrutural: no monorepo só o bun-types descreve `process`, sem os sinais.
  const signals = process as unknown as { once(signal: string, listener: () => void): unknown }
  signals.once('SIGINT', stop)
  signals.once('SIGTERM', stop)
}
