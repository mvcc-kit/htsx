// Modo estático: o app inteiro vira arquivos HTML no build (prerender), para qualquer
// servidor estático (Cloudflare Pages/Workers Static Assets, GitHub Pages, S3, Nginx...).
// Como o adapter-static do SvelteKit: falha se alguma rota precisar de servidor.
import path from 'node:path'
import type { App } from '../app/app'
import { cleanDir, copyAssets, copyVendor, redirectHtml, writePrerendered } from '../build/files'
import { outputFile, prerender, type PrerenderOptions } from '../build/prerender'

export interface StaticOptions {
  /** Base dos caminhos relativos. Padrão: diretório atual. */
  root?: string
  /** Pasta de saída. Padrão `build`. */
  outDir?: string
  /** Pasta de arquivos estáticos do app, copiada como está. Padrão `static`. */
  assets?: string
  /** Página de "não encontrado" gerada pelo app. Padrão `404.html`; `false` desliga. */
  fallback?: string | false
  /** `false` aceita rotas dinâmicas (elas ficam de fora do site). Padrão `true`. */
  strict?: boolean
  /** Copia Alpine e htmx para `VENDOR_PATH`. Padrão `true`. */
  vendor?: boolean
  prerender?: Omit<PrerenderOptions, 'assets'>
}

export interface BuildResult {
  outDir: string
  /** Caminhos de URL gerados (páginas e arquivos). */
  files: string[]
}

const SERVER_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const

export async function buildStatic(app: App, opts: StaticOptions = {}): Promise<BuildResult> {
  const root = path.resolve(opts.root ?? '.')
  const outDir = path.resolve(root, opts.outDir ?? 'build')
  const strict = opts.strict ?? true

  const problems: string[] = []
  for (const r of app.routes) {
    const needsServer = SERVER_METHODS.filter(m => r.def[m])
    if (r.def.actions) needsServer.push('POST')
    if (needsServer.length) problems.push(`${r.id} responde ${needsServer.join('/')}, que precisa de servidor`)
    else if (!(r.def.prerender ?? app.options.prerender)) problems.push(`${r.id} não está marcada com prerender`)
  }
  if (problems.length && strict) {
    throw new Error([
      'htsx: modo estático precisa que todas as rotas virem arquivos, mas estas são dinâmicas:',
      ...problems.map(p => `  - ${p}`),
      'Opções:',
      '  - ponha `prerender: true` em defineApp() (vale para todas) ou na rota;',
      '  - tire POST/PUT/PATCH/DELETE e actions, ou use o modo Cloudflare Workers;',
      '  - passe `strict: false` para deixar essas rotas de fora do site.',
    ].join('\n'))
  }

  await cleanDir(outDir)
  const assets = new Set(await copyAssets(path.resolve(root, opts.assets ?? 'static'), outDir))
  if (opts.vendor ?? true) for (const f of await copyVendor(outDir)) assets.add(f)

  const result = await prerender(app, { ...opts.prerender, assets })
  await writePrerendered(result.files, outDir)
  const slash = app.options.trailingSlash ?? 'never'
  for (const r of result.redirects) {
    await Bun.write(path.join(outDir, outputFile(r.from, true, slash)), redirectHtml(r.to))
  }

  const fallback = opts.fallback ?? '404.html'
  if (fallback) {
    const res = await app.respond(new Request(`${opts.prerender?.origin ?? 'http://localhost'}/__htsx_fallback__`, { headers: { accept: 'text/html' } }), { prerendering: true })
    await Bun.write(path.join(outDir, fallback), await res.text())
  }

  return {
    outDir,
    files: [...assets, ...result.files.map(f => f.path), ...result.redirects.map(r => r.from), ...(fallback ? ['/' + fallback] : [])].sort(),
  }
}
