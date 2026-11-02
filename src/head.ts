/**
 * Gera conteúdo de <head> com Alpine/HTMX via CDN.
 * Opcional — para projetos com bundler próprio, escreva o <head> direto no JSX.
 */
import { escapeHtml, escapeAttr } from './escape'
import type { AlpinePluginName } from './alpine'

const ALPINE_CDN        = (v: string) => `https://cdn.jsdelivr.net/npm/alpinejs@${v}/dist/cdn.min.js`
const ALPINE_PLUGIN_CDN = (v: string, name: string) => `https://cdn.jsdelivr.net/npm/@alpinejs/${name}@${v}/dist/cdn.min.js`
const HTMX_CDN          = (v: string) => `https://unpkg.com/htmx.org@${v}/dist/htmx.min.js`

const ALPINE_DEFAULT_VERSION = '3.x.x'
const HTMX_DEFAULT_VERSION   = '2.x.x'

export interface HeadOpts {
  title?:       string
  description?: string
  charset?:     string
  viewport?:    string
  styles?:      string[]
  scripts?:     Array<string | { src: string; defer?: boolean; async?: boolean; type?: string }>
  alpine?:      boolean | { version?: string; plugins?: AlpinePluginName[] }
  htmx?:        boolean | { version?: string }
  nonce?:       string
}

export function head(opts: HeadOpts = {}): string {
  const parts: string[] = []
  const nonceAttr = opts.nonce ? ` nonce="${escapeAttr(opts.nonce)}"` : ''

  parts.push(`<meta charset="${escapeAttr(opts.charset ?? 'UTF-8')}">`)
  parts.push(`<meta name="viewport" content="${escapeAttr(opts.viewport ?? 'width=device-width, initial-scale=1')}">`)

  if (opts.title)       parts.push(`<title>${escapeHtml(opts.title)}</title>`)
  if (opts.description) parts.push(`<meta name="description" content="${escapeAttr(opts.description)}">`)

  for (const href of opts.styles ?? []) {
    parts.push(`<link rel="stylesheet" href="${escapeAttr(href)}">`)
  }

  if (opts.alpine) {
    const cfg     = typeof opts.alpine === 'object' ? opts.alpine : {}
    const version = cfg.version ?? ALPINE_DEFAULT_VERSION
    const plugins = cfg.plugins ?? []
    for (const p of plugins) {
      parts.push(`<script defer src="${escapeAttr(ALPINE_PLUGIN_CDN(version, p))}"${nonceAttr}></script>`)
    }
    parts.push(`<script defer src="${escapeAttr(ALPINE_CDN(version))}"${nonceAttr}></script>`)
  }

  if (opts.htmx) {
    const cfg     = typeof opts.htmx === 'object' ? opts.htmx : {}
    const version = cfg.version ?? HTMX_DEFAULT_VERSION
    parts.push(`<script src="${escapeAttr(HTMX_CDN(version))}"${nonceAttr}></script>`)
  }

  for (const s of opts.scripts ?? []) {
    if (typeof s === 'string') {
      parts.push(`<script src="${escapeAttr(s)}"${nonceAttr}></script>`)
    } else {
      const attrs: string[] = [`src="${escapeAttr(s.src)}"`]
      if (s.defer) attrs.push('defer')
      if (s.async) attrs.push('async')
      if (s.type)  attrs.push(`type="${escapeAttr(s.type)}"`)
      if (opts.nonce) attrs.push(`nonce="${escapeAttr(opts.nonce)}"`)
      parts.push(`<script ${attrs.join(' ')}></script>`)
    }
  }

  return parts.join('\n')
}
