// Utilidades de build (só Bun/Node, nunca no Worker): listar, copiar e gravar arquivos.
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import pins from '../../vendor/pins.json'
import type { PrerenderedFile } from './prerender'
import { VENDOR_PATH } from '../vendor-path'

// Resolvido pelo pacote (exports './vendor/*'): funciona no workspace (@repo/htsx) e no dist/ (htsx)
const VENDOR_DIR = path.dirname(new URL(resolveVendor()).pathname)

function resolveVendor(): string {
  try { return import.meta.resolve('@repo/htsx/vendor/pins.json') } catch { return import.meta.resolve('htsx/vendor/pins.json') }
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

/** Copia Alpine, htmx e plugins de `vendor/` para `<saída>` + VENDOR_PATH. */
export async function copyVendor(to: string): Promise<string[]> {
  const out: string[] = []
  for (const pin of Object.values(pins)) {
    await Bun.write(path.join(to, VENDOR_PATH, pin.file), Bun.file(path.join(VENDOR_DIR, pin.file)))
    out.push(VENDOR_PATH + pin.file)
  }
  return out
}

export async function writePrerendered(files: PrerenderedFile[], to: string): Promise<void> {
  for (const f of files) await Bun.write(path.join(to, f.file), f.body)
}

/** Página HTML de redirecionamento para hospedagem estática sem regras de servidor. */
export function redirectHtml(to: string): string {
  const safe = to.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
  return `<!DOCTYPE html><meta http-equiv="refresh" content="0;url=${safe}"><link rel="canonical" href="${safe}"><a href="${safe}">${safe}</a>`
}
