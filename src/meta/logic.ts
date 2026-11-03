// Regras de <Title>, <Meta> e <Link>, sem renderizar nada e sem imports: só texto entra e sai.
export interface MetaTag {
  /** Duas tags com a mesma chave são a mesma informação. `null`: pode repetir. */
  key: string | null
  html: string
}

export type Attrs = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

export const TITLE_KEY = 'title'

const HEAD_FIRST = ['meta:charset', 'meta:name:viewport', TITLE_KEY]

export function metaKey(attrs: Attrs): string | null {
  if (attrs.charset !== undefined) return 'meta:charset'
  for (const attr of ['name', 'property', 'http-equiv']) {
    const value = text(attrs[attr])
    // A mesma tag pode valer para media diferente, como theme-color no claro e no escuro.
    const media = text(attrs.media)
    if (value) return media ? `meta:${attr}:${value}:${media}` : `meta:${attr}:${value}`
  }
  return null
}

/** Só `canonical` é único por página; `icon` e `preload` podem repetir. */
export function linkKey(attrs: Attrs): string | null {
  return attrs.rel === 'canonical' ? 'link:rel:canonical' : null
}

/** A última vence: tags chegam na ordem do documento, e o conteúdo vem depois do <head> do layout. */
export function dedupeTags(tags: readonly MetaTag[]): MetaTag[] {
  const last = new Map(tags.map((tag, index) => [tag.key, index]))
  return tags.filter((tag, index) => tag.key === null || last.get(tag.key) === index)
}

/** Marca o lugar onde a tag foi escrita. A ordem de renderização não é a ordem do documento. */
export function metaMarker(index: number): string {
  return `<!--htsx-meta:${index}-->`
}

const MARKER = /<!--htsx-meta:(\d+)-->/g

/** Tira as marcas do HTML e põe as tags na ordem em que aparecem nele. Tag sem marca vem antes. */
export function resolveMarkers(html: string, tags: readonly MetaTag[]): { html: string; tags: MetaTag[] } {
  const order = new Map<number, number>()
  for (const match of html.matchAll(MARKER)) order.set(Number(match[1]), match.index)
  const position = (index: number) => order.get(index) ?? -1
  return {
    html: html.replace(MARKER, ''),
    tags: tags.map((tag, index) => ({ tag, index })).sort((a, b) => position(a.index) - position(b.index)).map(({ tag }) => tag),
  }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** O que já está escrito no <head> com a mesma chave, para a tag da página substituir. */
export function existingTagPattern(key: string): RegExp | null {
  if (key === TITLE_KEY) return /<title(\s[^>]*)?>[\s\S]*?<\/title\s*>\s*/i
  if (key === 'meta:charset') return /<meta\b[^>]*\bcharset=[^>]*>\s*/i
  const [tag, attr, value] = key.split(/:(.*?):(.*)/s).filter(Boolean)
  if (!tag || !attr || !value) return null
  return new RegExp(`<${tag}\\b[^>]*\\b${escapeRegExp(attr)}="${escapeRegExp(value)}"[^>]*>\\s*`, 'i')
}

export interface AppliedMeta {
  html: string
  /** Tags que não tinham onde entrar: a página tem <html>, mas não tem <head>. */
  dropped: MetaTag[]
}

/**
 * Põe as tags antes de `</head>`, trocando as que já existem com a mesma chave.
 * Sem <head> (resposta parcial do htmx), só o título entra: o htmx o aplica sozinho.
 */
export function applyMeta(html: string, tags: readonly MetaTag[]): AppliedMeta {
  const unique = dedupeTags(tags)
  if (unique.length === 0) return { html, dropped: [] }
  const end = html.search(/<\/head\s*>/i)
  if (end < 0) {
    const title = unique.find(tag => tag.key === TITLE_KEY)
    return {
      html: title ? title.html + html : html,
      dropped: /<html[\s>]/i.test(html) ? unique.filter(tag => tag.key !== TITLE_KEY) : [],
    }
  }
  let head = html.slice(0, end)
  for (const { key } of unique) {
    const pattern = key === null ? null : existingTagPattern(key)
    if (pattern) head = head.replace(pattern, '')
  }
  // charset, viewport e título vêm antes de tudo: o navegador precisa deles logo nos primeiros bytes.
  const first = HEAD_FIRST.flatMap(key => unique.filter(tag => tag.key === key))
  const rest = unique.filter(tag => !first.includes(tag))
  const open = /<head(\s[^>]*)?>/i.exec(head)
  const start = open ? open.index + open[0].length : 0
  head = head.slice(0, start) + first.map(tag => tag.html).join('') + head.slice(start)
  return { html: head + rest.map(tag => tag.html).join('') + html.slice(end), dropped: [] }
}

/**
 * Padrão do <Head>: sem cópia de páginas no aparelho, sem `eval` no
 * navegador (`hx-on` precisa de `allowEval: true`) e com a resposta de `fail()` aparecendo na tela,
 * porque o htmx não troca o conteúdo em erro 4xx por padrão.
 */
export const DEFAULT_HTMX_CONFIG = {
  historyCacheSize: 0,
  allowEval: false,
  selfRequestsOnly: true,
  responseHandling: [
    { code: '204', swap: false },
    { code: '[23]..', swap: true },
    { code: '400', swap: true, error: true },
    { code: '422', swap: true, error: true },
    { code: '[45]..', swap: false, error: true },
  ],
} as const

/** `false` desliga, `true` usa o padrão, objeto soma ao padrão. `null`: não carregar. */
export function resolveHtmxConfig(value: boolean | Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (value === false) return null
  return { ...DEFAULT_HTMX_CONFIG, ...(typeof value === 'object' ? value : {}) }
}

/** `false` desliga; `true` e vazio carregam sem opções. `null`: não carregar. */
export function resolveAlpineOptions<T extends object>(value: boolean | T | undefined): T | Record<string, never> | null {
  if (value === false) return null
  return typeof value === 'object' ? value : {}
}
