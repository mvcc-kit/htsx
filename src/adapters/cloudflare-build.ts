// Modo Cloudflare Workers (build): pré-renderiza as rotas marcadas, copia os arquivos estáticos
// para a pasta de Static Assets, gera `_headers`, `_redirects`, `.assetsignore` e o manifesto
// que o Worker importa. Confere o wrangler.jsonc como o adapter-cloudflare do SvelteKit.
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { App } from '../app/app'
import { cleanDir, copyAssets, copyVendor, listFiles, writePrerendered } from '../build/files'
import { prerender, type PrerenderOptions } from '../build/prerender'
import { VENDOR_PATH } from '../vendor-path'
import type { AssetsFetcher, CloudflareManifest } from './cloudflare'

export interface CloudflareBuildOptions {
  /** Base dos caminhos relativos (wrangler, _headers, _redirects, pastas). Padrão: diretório atual. */
  root?: string
  /** Pasta de Static Assets (`assets.directory` do wrangler). Padrão `.htsx/cloudflare`. */
  outDir?: string
  /** Manifesto que o Worker importa. Padrão `.htsx/cloudflare-manifest.json`. */
  manifest?: string
  /** Pasta de arquivos estáticos do app. Padrão `static`. */
  assets?: string
  /** Arquivo do wrangler a conferir. Padrão: `wrangler.jsonc` ou `wrangler.json`; `false` pula. */
  wrangler?: string | false
  /** Copia Alpine e htmx para `VENDOR_PATH`. Padrão `true`. */
  vendor?: boolean
  prerender?: Omit<PrerenderOptions, 'assets'>
}

export interface CloudflareBuildResult {
  outDir: string
  manifest: CloudflareManifest
  /** Rotas atendidas pelo Worker. */
  dynamic: string[]
}

/** Lê JSONC (comentários e vírgula no fim), sem dependência. */
export function parseJsonc(text: string): unknown {
  let out = '', inStr = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!, n = text[i + 1]
    if (inStr) {
      out += c
      if (c === '\\') out += text[++i] ?? ''
      else if (c === '"') inStr = false
    } else if (c === '"') { inStr = true; out += c }
    else if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n' }
    else if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++ }
    else out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

interface WranglerConfig {
  main?: string
  site?: unknown
  compatibility_flags?: string[]
  assets?: { directory?: string; binding?: string }
}

/** Confere o wrangler: as mesmas regras do SvelteKit, mais a flag de AsyncLocalStorage. */
export function validateWrangler(config: WranglerConfig, file: string, outDir: string, cwd: string): string[] {
  const errors: string[] = []
  if (config.site) errors.push(`tire "site" de ${file}: Workers Sites foi substituído por Static Assets ("assets")`)
  if (config.main && !config.assets?.directory) errors.push(`defina "assets": { "directory": "${path.relative(cwd, outDir)}" } em ${file}`)
  if (config.main && !config.assets?.binding) errors.push(`defina "assets.binding" (ex.: "ASSETS") em ${file} para o Worker ler as páginas pré-renderizadas`)
  if (!config.main && config.assets?.binding) errors.push(`defina "main" em ${file} (o Worker), ou tire "assets.binding" se o site for só estático`)
  if (config.assets?.directory && path.resolve(path.dirname(path.resolve(cwd, file)), config.assets.directory) !== outDir) {
    errors.push(`"assets.directory" em ${file} é "${config.assets.directory}", mas o build grava em "${path.relative(cwd, outDir)}"; use o mesmo caminho`)
  }
  const flags = config.compatibility_flags ?? []
  if (config.main && !flags.includes('nodejs_als') && !flags.includes('nodejs_compat')) {
    errors.push(`adicione "compatibility_flags": ["nodejs_als"] em ${file}: o htsx usa AsyncLocalStorage para o contexto da requisição`)
  }
  return errors
}

function headersFile(userHeaders: string): string {
  const ours = [
    `${VENDOR_PATH}*`,
    '  Cache-Control: public, max-age=31536000, immutable',
    '  X-Robots-Tag: noindex',
  ].join('\n')
  return userHeaders.trim() ? `${userHeaders.trimEnd()}\n\n${ours}\n` : `${ours}\n`
}

export async function buildCloudflare(app: App, opts: CloudflareBuildOptions = {}): Promise<CloudflareBuildResult> {
  const cwd = path.resolve(opts.root ?? '.')
  const outDir = path.resolve(cwd, opts.outDir ?? '.htsx/cloudflare')
  const assetsDir = path.resolve(cwd, opts.assets ?? 'static')

  if (opts.wrangler !== false) {
    const file = opts.wrangler ?? ['wrangler.jsonc', 'wrangler.json'].find(f => existsSync(path.join(cwd, f)))
    if (!file) {
      if (existsSync(path.join(cwd, 'wrangler.toml'))) throw new Error('htsx: só sei conferir wrangler.jsonc/wrangler.json; converta o wrangler.toml ou passe wrangler: false')
      throw new Error(`htsx: wrangler.jsonc não encontrado em ${cwd}; crie um (veja SKILL.md, modo Cloudflare) ou passe wrangler: false`)
    }
    const errors = validateWrangler(parseJsonc(await Bun.file(path.resolve(cwd, file)).text()) as WranglerConfig, file, outDir, cwd)
    if (errors.length) throw new Error(`htsx: configuração do wrangler inválida:\n${errors.map(e => `  - ${e}`).join('\n')}`)
  }
  for (const f of ['_routes.json', '_headers', '_redirects']) {
    if (existsSync(path.join(assetsDir, f))) throw new Error(`htsx: ${f} deve ficar na raiz do projeto, não em ${path.relative(cwd, assetsDir)}/`)
  }

  await cleanDir(outDir)
  const assets = new Set(await copyAssets(assetsDir, outDir))
  if (opts.vendor ?? true) for (const f of await copyVendor(outDir)) assets.add(f)

  const result = await prerender(app, { ...opts.prerender, assets })
  await writePrerendered(result.files, outDir)

  const at = (f: string) => path.join(cwd, f)
  const userHeaders = existsSync(at('_headers')) ? await Bun.file(at('_headers')).text() : ''
  await Bun.write(path.join(outDir, '_headers'), headersFile(userHeaders))
  const redirects = [
    existsSync(at('_redirects')) ? (await Bun.file(at('_redirects')).text()).trimEnd() : '',
    ...result.redirects.map(r => `${r.from} ${r.to} ${r.status}`),
  ].filter(Boolean).join('\n')
  if (redirects) await Bun.write(path.join(outDir, '_redirects'), redirects + '\n')
  await Bun.write(path.join(outDir, '.assetsignore'), '_worker.js\n_routes.json\n')

  const manifest: CloudflareManifest = { prerendered: result.files.filter(f => f.contentType.startsWith('text/html')).map(f => f.path) }
  await Bun.write(path.resolve(cwd, opts.manifest ?? '.htsx/cloudflare-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  return { outDir, manifest, dynamic: result.dynamic.map(r => r.id) }
}

/**
 * `env.ASSETS` local para desenvolvimento e testes: serve a pasta do build como o Static Assets
 * (`/sobre` → `sobre.html` ou `sobre/index.html`; 404 sem corpo quando não existe).
 */
export async function assetsFromDir(dir: string): Promise<AssetsFetcher> {
  const files = new Set(await listFiles(dir))
  return {
    async fetch(input) {
      const { pathname } = new URL(typeof input === 'string' ? input : input.url)
      const p = decodeURIComponent(pathname)
      const hit = [p, `${p}.html`, `${p.replace(/\/$/, '')}/index.html`, p === '/' ? '/index.html' : ''].find(f => f && files.has(f))
      return hit ? new Response(Bun.file(path.join(dir, hit))) : new Response(null, { status: 404 })
    },
  }
}
