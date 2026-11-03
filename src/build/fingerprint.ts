// Nome com hash nos arquivos do projeto: o conteúdo decide o nome, então o host pode dar
// cache para sempre, e um deploy nunca mistura HTML novo com CSS ou JS antigo.
import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
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

/**
 * Põe o CSS dentro de cada HTML que o cita, no lugar de `<link rel="stylesheet">`: a primeira
 * visita não espera outro download para desenhar. Cada página fica maior, e o CSS deixa de ter
 * cache próprio, então serve para CSS pequeno. Com CSP, some os hashes devolvidos a `style-src`.
 * Rode depois de gerar os arquivos, antes de `fingerprintAssets`.
 */
export async function inlineStyles(outDir: string, files: readonly string[]): Promise<{ cspHashes: string[] }> {
  const root = path.resolve(outDir)
  const sources: Array<{ url: string; file: string; css: string }> = []
  for (const url of files) {
    const file = path.resolve(root, `.${url}`)
    if (!url.startsWith('/') || !file.startsWith(root + path.sep)) {
      throw new Error(`htsx: inlineStyles espera um caminho da raiz do site, dentro da saída: ${url}`)
    }
    const source = Bun.file(file)
    if (!(await source.exists())) throw new Error(`htsx: inlineStyles não achou ${url} em ${outDir}`)
    const css = await source.text()
    // Dentro de <style>, este texto fecharia a tag: o HTML seguinte viraria outra coisa.
    if (/<\/style/i.test(css)) throw new Error(`htsx: inlineStyles recusa ${url}, que contém </style`)
    sources.push({ url, file, css })
  }
  for (const page of await htmlFiles(root)) {
    const before = await Bun.file(page).text()
    let after = before
    for (const { url, css } of sources) {
      const link = new RegExp(`<link\\b(?=[^>]*\\brel="stylesheet")[^>]*\\bhref="${escapeRegex(url)}"[^>]*>`, 'g')
      after = after.replace(link, () => `<style>${css}</style>`)
    }
    if (after !== before) await Bun.write(page, after)
  }
  await Promise.all(sources.map(({ file }) => rm(file)))
  return {
    cspHashes: sources.map(({ css }) => `'sha256-${createHash('sha256').update(css).digest('base64')}'`),
  }
}
