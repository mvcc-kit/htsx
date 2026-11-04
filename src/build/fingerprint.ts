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

function assetPath(root: string, url: string, name: string): string {
  const file = path.resolve(root, `.${url}`)
  if (!url.startsWith('/') || !file.startsWith(root + path.sep)) {
    throw new Error(`htsx: ${name} espera um caminho da raiz do site, dentro da saída: ${url}`)
  }
  return file
}

/** O novo texto de cada HTML que mudou. Nada é gravado aqui: um erro não deixa o build pela metade. */
async function rewritePages(root: string, rewrite: (html: string) => string): Promise<Map<string, string>> {
  const changed = new Map<string, string>()
  for (const page of await htmlFiles(root)) {
    const before = await Bun.file(page).text()
    const after = rewrite(before)
    if (after !== before) changed.set(page, after)
  }
  return changed
}

/**
 * Move os arquivos para `ASSETS_PATH` com o hash no nome e troca as referências em `href` e
 * `src` de todos os HTML, parciais inclusive. Rode depois de gerar os arquivos. Devolve a
 * lista de caminho antigo para novo.
 *
 * Só olha `href` e `src` com aspas duplas nos HTML: `import` em JS, `url()` em CSS e `srcset`
 * continuam com o nome antigo, então não liste um arquivo citado só nesses lugares. Arquivo que
 * nenhum HTML cita é recusado antes de mover qualquer coisa, porque ficaria inacessível.
 */
export async function fingerprintAssets(outDir: string, files: readonly string[]): Promise<Record<string, string>> {
  const root = path.resolve(outDir)
  const renamed: Record<string, string> = {}
  const sources = new Map<string, string>()
  for (const url of files) {
    const source = assetPath(root, url, 'fingerprintAssets')
    const file = Bun.file(source)
    if (!(await file.exists())) throw new Error(`htsx: fingerprintAssets não achou ${url} em ${outDir}`)
    const hash = createHash('sha256').update(await file.bytes()).digest('hex').slice(0, 12)
    const { dir, name, ext } = path.posix.parse(url)
    renamed[url] = path.posix.join(ASSETS_PATH, dir, `${name}.${hash}${ext}`)
    sources.set(url, source)
  }
  const cited = new Set<string>()
  const pages = await rewritePages(root, html => {
    let after = html
    for (const [from, to] of Object.entries(renamed)) {
      after = after.replace(new RegExp(`(\\s(?:href|src)=")${escapeRegex(from)}(")`, 'g'), (_, open, close) => {
        cited.add(from)
        return open + to + close
      })
    }
    return after
  })
  const unused = files.filter(url => !cited.has(url))
  if (unused.length) throw new Error(`htsx: fingerprintAssets não achou nenhum HTML que cite ${unused.join(', ')}`)
  for (const [url, target] of Object.entries(renamed)) {
    const destination = path.join(root, `.${target}`)
    await mkdir(path.dirname(destination), { recursive: true })
    await rename(sources.get(url)!, destination)
  }
  await Promise.all([...pages].map(([page, html]) => Bun.write(page, html)))
  return renamed
}

// `@import url(...)` cai no ramo de `url(`. Sem comentários, para não acusar texto solto.
const CSS_ADDRESS = /(?:url\(\s*|@import\s+(?!url\())(['"]?)([^'")\s;]+)/gi

/** Dentro do HTML, um endereço relativo passaria a contar a partir da página, não do arquivo CSS. */
function relativeAddress(css: string): string | undefined {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of code.matchAll(CSS_ADDRESS)) {
    const address = match[2]!
    if (!/^(?:\/|#|[a-z][a-z0-9+.-]*:)/i.test(address)) return address
  }
  return undefined
}

/**
 * Põe o CSS dentro de cada HTML que o cita, no lugar de `<link rel="stylesheet">`, mantendo o
 * `media`: a primeira visita não espera outro download para desenhar. Cada página fica maior, e
 * o CSS deixa de ter cache próprio, então serve para CSS pequeno. Com CSP, some os hashes
 * devolvidos a `style-src`. Rode depois de gerar os arquivos, antes de `fingerprintAssets`.
 *
 * Recusa, sem alterar nada: CSS com `</style`, com endereço relativo, ou que nenhum HTML cita.
 */
export async function inlineStyles(outDir: string, files: readonly string[]): Promise<{ cspHashes: string[] }> {
  const root = path.resolve(outDir)
  const sources: Array<{ url: string; file: string; css: string }> = []
  for (const url of files) {
    const file = assetPath(root, url, 'inlineStyles')
    const source = Bun.file(file)
    if (!(await source.exists())) throw new Error(`htsx: inlineStyles não achou ${url} em ${outDir}`)
    const css = await source.text()
    // Dentro de <style>, este texto fecharia a tag: o HTML seguinte viraria outra coisa.
    if (/<\/style/i.test(css)) throw new Error(`htsx: inlineStyles recusa ${url}, que contém </style`)
    const relative = relativeAddress(css)
    if (relative) throw new Error(`htsx: inlineStyles recusa ${url}, que tem o endereço relativo ${relative}. Use um caminho a partir da raiz`)
    sources.push({ url, file, css })
  }
  const cited = new Set<string>()
  const pages = await rewritePages(root, html => {
    let after = html
    for (const { url, css } of sources) {
      const link = new RegExp(`<link\\b(?=[^>]*\\brel="stylesheet")[^>]*\\bhref="${escapeRegex(url)}"[^>]*>`, 'g')
      after = after.replace(link, tag => {
        cited.add(url)
        const media = /\smedia="[^"]*"/.exec(tag)?.[0] ?? ''
        return `<style${media}>${css}</style>`
      })
    }
    return after
  })
  const unused = files.filter(url => !cited.has(url))
  if (unused.length) throw new Error(`htsx: inlineStyles não achou nenhum HTML que cite ${unused.join(', ')}`)
  await Promise.all([...pages].map(([page, html]) => Bun.write(page, html)))
  await Promise.all(sources.map(({ file }) => rm(file)))
  return {
    cspHashes: sources.map(({ css }) => `'sha256-${createHash('sha256').update(css).digest('base64')}'`),
  }
}
