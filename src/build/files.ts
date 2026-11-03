// Utilidades de build (só Bun/Node, nunca no Worker): listar, copiar e gravar arquivos.
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { statSync } from 'node:fs'
import path from 'node:path'
import pins from '../../vendor/pins.json'
import type { PrerenderedFile } from './prerender'
import { VENDOR_PATH } from '../vendor-path'
import { NAVIGATION_FILES } from '../navigation'

// Resolvido pelo pacote (exports './vendor/*').
export const VENDOR_DIR = path.dirname(new URL(resolveVendor()).pathname)

function resolveVendor(): string {
  return import.meta.resolve('htsx/vendor/pins.json')
}

/** Lista os arquivos de `dir`, como caminhos de URL (`/img/logo.png`). Pasta inexistente → vazio. */
export async function listFiles(dir: string): Promise<string[]> {
  try { if (!(await stat(dir)).isDirectory()) return [] } catch { return [] }
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter(e => e.isFile())
    .map(e => '/' + path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .sort()
}

const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep)

/**
 * A pasta de saída é apagada antes do build: recusa caminhos que levariam junto o projeto
 * ou a pasta de arquivos estáticos (ex.: `outDir: '.'` ou `outDir: 'static'`).
 */
export function assertSafeOutDir(outDir: string, root: string, assetsDir: string): void {
  const rel = path.relative(root, outDir) || '.'
  if (inside(root, outDir)) throw new Error(`htsx: outDir "${rel}" é a raiz do projeto ou está acima dela; o build apaga essa pasta. Use uma subpasta, ex.: "build"`)
  if (inside(outDir, assetsDir) || inside(assetsDir, outDir)) throw new Error(`htsx: outDir "${rel}" e a pasta de arquivos estáticos "${path.relative(root, assetsDir)}" se sobrepõem; o build apagaria os arquivos. Use pastas separadas`)
  for (const keep of ['src', 'node_modules', '.git']) {
    if (inside(path.join(root, keep), outDir)) throw new Error(`htsx: outDir "${rel}" contém ${keep}/; o build apaga essa pasta. Use uma subpasta só para a saída, ex.: "build"`)
  }
}

export async function cleanDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
}

/** Copia a pasta de arquivos estáticos do app para a saída. Devolve os caminhos copiados. */
export async function copyAssets(from: string, to: string): Promise<string[]> {
  const files = await listFiles(from)
  for (const f of files) await Bun.write(path.join(to, f), Bun.file(path.join(from, f)))
  return files
}

/** O que copiar para VENDOR_PATH: tudo, só a navegação (site sem Alpine nem htmx) ou nada. */
export type VendorOption = boolean | 'navigation'

/** Copia Alpine, htmx, plugins e os arquivos de navegação para `<saída>` + VENDOR_PATH. */
export async function copyVendor(to: string, what: VendorOption = true): Promise<string[]> {
  const out: string[] = []
  if (what === false) return out
  for (const [file, body] of Object.entries(NAVIGATION_FILES)) {
    await Bun.write(path.join(to, VENDOR_PATH, file), body)
    out.push(VENDOR_PATH + file)
  }
  if (what === 'navigation') return out
  for (const pin of Object.values(pins)) {
    await Bun.write(path.join(to, VENDOR_PATH, pin.file), Bun.file(path.join(VENDOR_DIR, pin.file)))
    out.push(VENDOR_PATH + pin.file)
  }
  return out
}

/** Caminho dentro da saída. O nome vem da URL, inclusive de links do conteúdo: `..%2f` não pode sair da pasta. */
export function outputPath(to: string, file: string): string {
  const base = path.resolve(to)
  const target = path.resolve(base, file)
  if (!inside(target, base)) throw new Error(`htsx: o prerender tentou gravar fora da pasta de saída: ${JSON.stringify(file)}`)
  return target
}

export async function writePrerendered(files: PrerenderedFile[], to: string): Promise<void> {
  for (const f of files) await Bun.write(outputPath(to, f.file), f.body)
}

/** Página HTML de redirecionamento para hospedagem estática sem regras de servidor. */
export function redirectHtml(to: string): string {
  const safe = to.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
  return `<!DOCTYPE html><meta http-equiv="refresh" content="0;url=${safe}"><link rel="canonical" href="${safe}"><a href="${safe}">${safe}</a>`
}

export interface FileServerOptions {
  /** Serve Alpine e htmx em VENDOR_PATH (cache immutable). Padrão `false`. */
  vendor?: boolean
  /** `/sobre` → `sobre.html` ou `sobre/index.html` (páginas pré-renderizadas). Padrão `false`. */
  html?: boolean
  /** Lembra o resultado da busca no disco (produção). Padrão `false`: arquivo novo aparece na hora (dev). */
  cache?: boolean
}

const VENDOR_FILES = new Map(Object.values(pins).map(p => [VENDOR_PATH + p.file, p.file]))
const NAVIGATION_BY_PATH = new Map(Object.entries(NAVIGATION_FILES).map(([file, body]) => [VENDOR_PATH + file, body]))
const IMMUTABLE = 'public, max-age=31536000, immutable'

/**
 * Servidor de arquivos de uma pasta: devolve a resposta ou `null` (segue para o app).
 * Lê o disco a cada pedido (arquivo novo aparece sem reiniciar) e recusa `..`, `\0` e
 * arquivos ocultos (`.env`, `.git`...), exceto `/.well-known/`.
 */
export function fileServer(dir: string, opts: FileServerOptions = {}): (request: Request | string) => Response | null {
  const base = path.resolve(dir)
  const memo = new Map<string, string | null>()
  const lookup = (rel: string): string | null => {
    const abs = path.join(base, rel)
    if (!inside(abs, base)) return null
    try { return statSync(abs).isFile() ? abs : null } catch { return null }
  }
  const file = (rel: string): string | null => {
    if (!opts.cache) return lookup(rel)
    if (!memo.has(rel)) {
      if (memo.size > 10_000) memo.clear()   // limite: caminhos inventados não enchem a memória
      memo.set(rel, lookup(rel))
    }
    return memo.get(rel)!
  }
  return request => {
    const req = typeof request === 'string' ? new Request(request) : request
    if (req.method !== 'GET' && req.method !== 'HEAD') return null
    let p: string
    try { p = decodeURIComponent(new URL(req.url).pathname) } catch { return null }
    if (p.includes('\0') || p.split('/').some(s => s === '..' || (s.startsWith('.') && s !== '.well-known'))) return null
    if (opts.vendor) {
      const v = VENDOR_FILES.get(p)
      if (v) return new Response(Bun.file(path.join(VENDOR_DIR, v)), { headers: { 'cache-control': IMMUTABLE } })
      const nav = NAVIGATION_BY_PATH.get(p)
      if (nav) return new Response(nav, { headers: { 'cache-control': IMMUTABLE, 'content-type': p.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' } })
    }
    const candidates = opts.html ? [p, `${p}.html`, `${p.replace(/\/$/, '')}/index.html`] : [p]
    for (const c of candidates) {
      if (c.endsWith('/')) continue
      const hit = file(c)
      if (hit) return new Response(Bun.file(hit))
    }
    return null
  }
}
