// Comandos de `bun htsx.config.ts <comando>` e as funções equivalentes para usar em código.
// Só Bun (build, dev, servidor): nunca vai para o Worker.
import { existsSync, statSync, watch } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createLiveReload } from './live-reload'
import path from 'node:path'
import { defineApp, type App, type AppOptions } from '../app/app'
import type { FileRoutes } from '../app/file-routes'
import type { CloudflareAdapter, Command, HtsxConfig } from '../config/config'
import type { CloudflareManifest } from '../adapters/cloudflare'
import { buildStatic } from '../adapters/static'
import { buildCloudflare, jsxConfigProblem, prepareCloudflareAssets, writeAssetRules } from '../adapters/cloudflare-build'
import { serve } from '../adapters/bun'
import { EXTS, syncRoutes, writeIfChanged } from './routes'
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

/** Gera o manifesto, os tipos `./$types` e, no Cloudflare, `.htsx/server.ts`. */
export async function sync(config: HtsxConfig, root = '.') {
  const result = await syncRoutes({ root, routes: config.routes, params: config.params, out: config.out, pkg: config.pkg })
  if (config.adapter.name === 'cloudflare') await writeServerEntry(config, config.adapter, path.resolve(root))
  return result
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

const manifestPath = (config: HtsxConfig, root: string) => path.join(outDirOf(config, root), 'cloudflare-manifest.json')

/** Recusa projeto cujo JSX o wrangler compilaria errado. */
async function assertJsxConfig(config: HtsxConfig, root: string): Promise<void> {
  const file = Bun.file(path.join(root, 'tsconfig.json'))
  const problem = jsxConfigProblem(await file.exists() ? await file.text() : null, config.pkg ?? 'htsx')
  if (problem) throw new Error(problem)
}

/** `src/server.ts` (ou o que o adapter indicar), se existir. */
function serverFile(adapter: CloudflareAdapter, root: string): string | undefined {
  const file = optionalFile(root, adapter.server ?? 'src/server')
  if (adapter.server && !file) throw new Error(`htsx: cloudflare.server aponta para ${adapter.server}, que não existe`)
  return file
}

/** O `main` que o wrangler precisa ter: o arquivo do projeto ou o gerado. */
const serverMain = (config: HtsxConfig, adapter: CloudflareAdapter, root: string) =>
  serverFile(adapter, root) ?? path.join(outDirOf(config, root), 'server.ts')

/** `.htsx/server.ts`: as rotas prontas para o `src/server.ts` chamar, ou para ser o próprio `main`. */
async function writeServerEntry(config: HtsxConfig, adapter: CloudflareAdapter, root: string): Promise<void> {
  const out = outDirOf(config, root)
  // o manifesto do último build: um sync depois dele (testes, tipos) não pode apagar a lista
  const manifestFile = Bun.file(manifestPath(config, root))
  const manifest: CloudflareManifest = await manifestFile.exists() ? await manifestFile.json() : { prerendered: [] }
  const pkg = config.pkg ?? 'htsx'
  const hooks = hooksFile(config, root)
  const rel = (abs: string) => JSON.stringify(path.relative(out, abs).split(path.sep).join('/').replace(/^(?!\.)/, './').replace(/\.(tsx?|jsx?)$/, ''))
  await writeIfChanged(path.join(out, 'server.ts'), [
    '// Gerado pelo htsx (htsx.config.ts). Não edite.',
    '// Só o `bun htsx.config.ts dev` define __HTSX_DEV__: nenhum deploy mostra a pilha do erro.',
    'declare const __HTSX_DEV__: boolean | undefined',
    `import { defineApp, type AppOptions } from ${JSON.stringify(pkg + '/app')}`,
    `import { cloudflare } from ${JSON.stringify(pkg + '/adapter-cloudflare')}`,
    `import { files } from './routes'`,
    ...(hooks ? [`import * as userHooks from ${rel(hooks)}`] : []),
    '',
    `const hooks: Partial<Pick<AppOptions, 'handle' | 'handleError' | 'context'>> = ${hooks ? 'userHooks' : '{}'}`,
    '',
    `export const app = defineApp({ ...files, ...${JSON.stringify(config.options ?? {})}, handle: hooks.handle, handleError: hooks.handleError, context: hooks.context })`,
    `export const routes = cloudflare<object>(app, { manifest: ${JSON.stringify(manifest)}, assetsBinding: ${JSON.stringify(adapter.assetsBinding ?? 'ASSETS')}, dev: typeof __HTSX_DEV__ !== 'undefined' && __HTSX_DEV__ })`,
    'export default routes',
    '',
  ].join('\n'))
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
    const main = serverMain(config, adapter, root)
    const r = await buildCloudflare(app, { root, assets, outDir: adapter.outDir, wrangler: adapter.wrangler, manifest: manifestPath(config, root), expectMain: main })
    await assertJsxConfig(config, root)
    await writeServerEntry(config, adapter, root)
    console.log(`htsx: assets em ${path.relative(root, r.outDir)}; main ${path.relative(root, main)}; rotas dinâmicas: ${r.dynamic.join(', ') || 'nenhuma'}. Publique com wrangler deploy`)
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

/** Acha o wrangler do projeto, subindo as pastas, e depois o do PATH. */
function findWrangler(adapter: CloudflareAdapter, root: string): string | undefined {
  // nome solto vem do PATH; caminho é relativo ao projeto
  if (adapter.wranglerBin) return adapter.wranglerBin.includes('/') ? path.resolve(root, adapter.wranglerBin) : adapter.wranglerBin
  for (let dir = root; ; dir = path.dirname(dir)) {
    const bin = path.join(dir, 'node_modules', '.bin', 'wrangler')
    if (existsSync(bin)) return bin
    if (dir === path.dirname(dir)) break
  }
  return Bun.which('wrangler') ?? undefined
}

/** Copia um arquivo estático alterado, ou apaga a cópia se ele saiu. */
async function syncAsset(from: string, to: string): Promise<void> {
  if (!existsSync(from)) return rm(to, { force: true })
  if (statSync(from).isFile()) await Bun.write(to, Bun.file(from))
}

/**
 * `dev` no Cloudflare: o `wrangler dev` roda o `main` no workerd, com os bindings locais e sem build.
 * Aqui só ficam as rotas e os arquivos estáticos em dia; o wrangler recarrega quando o código muda.
 */
async function devCloudflare(config: HtsxConfig, adapter: CloudflareAdapter, root: string, wrangler: string): Promise<{ stop(): void; exited: Promise<number> }> {
  const assets = config.assets ?? 'static'
  // sem páginas prontas no dev: o Worker responde tudo, e a lista do último build não vale
  await rm(manifestPath(config, root), { force: true })
  await sync(config, root)
  await assertJsxConfig(config, root)
  const { cwd, outDir } = await prepareCloudflareAssets({ root, assets, outDir: adapter.outDir, wrangler: adapter.wrangler, expectMain: serverMain(config, adapter, root) })
  await writeAssetRules(cwd, outDir)
  const port = process.env.PORT
  const child = Bun.spawn([wrangler, 'dev', '--live-reload', '--define', '__HTSX_DEV__:true', ...(port ? ['--port', port] : [])], { cwd: root, stdio: ['inherit', 'inherit', 'inherit'] })
  const report = (e: unknown) => console.error((e as Error).message)
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = (job: () => Promise<unknown>) => { queue = queue.then(job).catch(report) }
  const watchers = [config.routes ?? 'src/routes', config.params ?? 'src/params']
    .map(d => path.resolve(root, d))
    .filter(d => existsSync(d))
    // arquivo novo ou apagado muda o manifesto; conteúdo o wrangler já vê sozinho
    .map(d => watch(d, { recursive: true }, ev => { if (ev === 'rename') enqueue(() => sync(config, root)) }))
  const staticDir = path.resolve(root, assets)
  // um arquivo por vez: o wrangler observa a pasta e cai se ela sumir
  if (existsSync(staticDir)) {
    watchers.push(watch(staticDir, { recursive: true }, (_ev, file) => {
      if (file) enqueue(() => syncAsset(path.join(staticDir, file), path.join(outDir, file)))
    }))
  }
  return {
    stop() { for (const w of watchers) w.close(); child.kill() },
    exited: child.exited,
  }
}

export async function run(cmd: Command, config: HtsxConfig, root: string): Promise<void> {
  if (cmd === 'sync') { const r = await sync(config, root); console.log(`htsx: ${r.routes.length} rotas, tipos em ${path.relative(root, outDirOf(config, root))}/types`); return }
  if (cmd === 'build') { await build(config, root); return }
  if (cmd === 'dev' && config.adapter.name === 'cloudflare') {
    const wrangler = findWrangler(config.adapter, path.resolve(root))
    if (wrangler) {
      const dev = await devCloudflare(config, config.adapter, path.resolve(root), wrangler)
      const signals = process as unknown as { once(signal: string, listener: () => void): unknown }
      signals.once('SIGINT', dev.stop)
      signals.once('SIGTERM', dev.stop)
      process.exitCode = await dev.exited
      dev.stop()
      return
    }
    console.warn('htsx: wrangler não encontrado; dev no Bun, sem o workerd e sem src/server.ts. Instale o wrangler ou use cloudflareAdapter({ wranglerBin })')
  }
  const server = await start(config, root, { watch: cmd === 'dev' })
  // Ctrl+C / parada do processo: fecha o servidor e o wrangler local antes de sair
  const stop = () => { void server.stop().finally(() => process.exit(0)) }
  // Cast estrutural: no monorepo só o bun-types descreve `process`, sem os sinais.
  const signals = process as unknown as { once(signal: string, listener: () => void): unknown }
  signals.once('SIGINT', stop)
  signals.once('SIGTERM', stop)
}
