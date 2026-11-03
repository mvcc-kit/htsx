// Nome com hash nos arquivos do projeto: o conteúdo decide o nome, então o host pode dar
// cache para sempre, e um deploy nunca mistura HTML novo com CSS ou JS antigo.
import { createHash } from 'node:crypto'
import { mkdir, readdir, rename } from 'node:fs/promises'
import path from 'node:path'

/** Pasta dos arquivos com hash. No host, dê a ela cache longo e `immutable`. */
export const ASSETS_PATH = '/_htsx/assets'

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return htmlFiles(full)
    return entry.name.endsWith('.html') ? [full] : []
  }))
  return nested.flat()
}

/**
 * Move os arquivos para `ASSETS_PATH` com o hash no nome e troca as referências em `href` e
 * `src` de todos os HTML, parciais inclusive. Rode depois de gerar os arquivos. Devolve a
 * lista de caminho antigo para novo.
 */
export async function fingerprintAssets(outDir: string, files: readonly string[]): Promise<Record<string, string>> {
  const root = path.resolve(outDir)
  const renamed: Record<string, string> = {}
  for (const url of files) {
    const source = path.resolve(root, `.${url}`)
    if (!url.startsWith('/') || !source.startsWith(root + path.sep)) {
      throw new Error(`htsx: fingerprintAssets espera um caminho da raiz do site, dentro da saída: ${url}`)
    }
    const file = Bun.file(source)
    if (!(await file.exists())) throw new Error(`htsx: fingerprintAssets não achou ${url} em ${outDir}`)
    const hash = createHash('sha256').update(await file.bytes()).digest('hex').slice(0, 12)
    const { dir, name, ext } = path.posix.parse(url)
    const target = path.posix.join(ASSETS_PATH, dir, `${name}.${hash}${ext}`)
    const destination = path.join(root, `.${target}`)
    await mkdir(path.dirname(destination), { recursive: true })
    await rename(source, destination)
    renamed[url] = target
  }
  const entries = Object.entries(renamed)
  for (const page of await htmlFiles(root)) {
    const before = await Bun.file(page).text()
    let after = before
    for (const [from, to] of entries) {
      after = after.replace(new RegExp(`(\\s(?:href|src)=")${escapeRegex(from)}(")`, 'g'), (_, open, close) => open + to + close)
    }
    if (after !== before) await Bun.write(page, after)
  }
  return renamed
}
