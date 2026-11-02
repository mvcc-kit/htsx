// Comandos de `bun htsx.config.ts <comando>` e as funções equivalentes para usar em código.
// Só Bun (build, dev, servidor): nunca vai para o Worker.
import { existsSync, watch } from 'node:fs'
import path from 'node:path'
import { defineApp, type App, type AppOptions } from '../app/app'
import type { FileRoutes } from '../app/file-routes'
import type { CloudflareAdapter, Command, HtsxConfig } from '../config/config'
import { buildStatic } from '../adapters/static'
import { buildCloudflare } from '../adapters/cloudflare-build'
import { serve } from '../adapters/bun'
import { syncRoutes } from './routes'

const EXTS = ['.ts', '.tsx', '.js', '.jsx']

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

/** Monta o app a partir da configuração: rotas por arquivos + hooks + opções. Roda no Bun. */
export async function loadApp(config: HtsxConfig, root = '.'): Promise<App> {
  root = path.resolve(root)
  const result = await sync(config, root)
  // `?v=` força recarregar o manifesto quando as rotas mudam (dev)
  const { files } = (await import(`${result.manifest}?v=${++generation}`)) as { files: FileRoutes }
  const hooksPath = hooksFile(config, root)
  const hooks: Partial<Pick<AppOptions, 'handle' | 'handleError' | 'context'>> = hooksPath ? await import(hooksPath) : {}
  return defineApp({ ...files, ...config.options, handle: hooks.handle, handleError: hooks.handleError, context: hooks.context })
}

/** Código do Worker gerado: o app + o módulo opcional `src/worker.ts` (Durable Objects, scheduled...). */
function workerEntry(config: HtsxConfig, adapter: CloudflareAdapter, root: string, manifest: object): string {
  const out = outDirOf(config, root)
  const rel = (abs: string) => JSON.stringify(path.relative(out, abs).split(path.sep).join('/').replace(/^(?!\.)/, './').replace(/\.(tsx?|jsx?)$/, ''))
  const pkg = config.pkg ?? '@repo/htsx'
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
  const app = await loadApp(config, root)
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
      jsx: { runtime: 'automatic', importSource: config.pkg ?? '@repo/htsx', development: false },
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
export async function start(config: HtsxConfig, root = '.', opts: { watch?: boolean; port?: number } = {}) {
  root = path.resolve(root)
  let app = await loadApp(config, root)
  const adapter = config.adapter
  const port = opts.port ?? (adapter.name === 'bun' ? adapter.port : undefined) ?? Number(process.env.PORT ?? 3000)
  // no dev do modo Cloudflare, event.platform imita o do Worker (env de devEnv)
  const platform = adapter.name === 'cloudflare'
    ? { env: adapter.devEnv ?? {}, ctx: { waitUntil() {} }, caches: undefined, cf: undefined }
    : undefined
  const server = await serve(() => app, { port, hostname: adapter.name === 'bun' ? adapter.hostname : undefined, assets: path.resolve(root, config.assets ?? 'static'), platform })
  if (opts.watch) {
    const dirs = [config.routes ?? 'src/routes', config.params ?? 'src/params'].map(d => path.resolve(root, d))
    let pending: Promise<void> | undefined
    for (const d of dirs) {
      if (!existsSync(d)) continue
      watch(d, { recursive: true }, ev => {
        // arquivo novo/apagado muda o manifesto; mudança de conteúdo o `bun --hot` já recarrega
        if (ev !== 'rename' || pending) return
        pending = loadApp(config, root).then(a => { app = a }, e => console.error((e as Error).message)).finally(() => { pending = undefined })
      })
    }
  }
  console.log(`htsx: http://${server.hostname}:${server.port}`)
  return server
}

export async function run(cmd: Command, config: HtsxConfig, root: string): Promise<void> {
  if (cmd === 'sync') { const r = await sync(config, root); console.log(`htsx: ${r.routes.length} rotas, tipos em ${path.relative(root, outDirOf(config, root))}/types`); return }
  if (cmd === 'build') { await build(config, root); return }
  await start(config, root, { watch: cmd === 'dev' })
}
