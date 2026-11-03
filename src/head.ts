/**
 * Gera conteúdo de <head> com Alpine/HTMX.
 * Produção: `vendor: '/caminho/'` carrega as cópias próprias de `vendor/` (servidas pelo app).
 * Sem `vendor`, usa CDN na versão fixada em `vendor/pins.json`, com `integrity` (SRI).
 * Opcional — para projetos com bundler próprio, escreva o <head> direto no JSX.
 */
import { escapeHtml, escapeAttr } from './escape'
import type { AlpinePluginName } from './alpine'
import { strictFail } from './strict'
import { navigationTags } from './navigation'
import pins from '../vendor/pins.json'

export type VendorName = keyof typeof pins

const CDN: Record<string, (pkg: string, v: string, file: string) => string> = {
  'htmx.org': (pkg, v, file) => `https://unpkg.com/${pkg}@${v}/${file}`,
}
const JSDELIVR = (pkg: string, v: string, file: string) => `https://cdn.jsdelivr.net/npm/${pkg}@${v}/${file}`

function hexToBase64(hex: string): string {
  return btoa(String.fromCharCode(...hex.match(/../g)!.map(b => parseInt(b, 16))))
}

/** Atributos `src` (e `integrity` quando possível) de um arquivo de `vendor/`. */
function vendorSrc(name: VendorName, vendorBase: string | undefined, version: string | undefined): string {
  const pin = pins[name]
  if (vendorBase !== undefined) return `src="${escapeAttr(vendorBase + pin.file)}"`
  const v = version ?? pin.version
  const url = (CDN[pin.package] ?? JSDELIVR)(pin.package, v, pin.path)
  if (v !== pin.version) {
    strictFail(`${pin.package}@${v} vem de CDN sem integrity; use a versão fixada (${pin.version}) ou vendor: '/caminho/'`)
    return `src="${escapeAttr(url)}"`
  }
  return `src="${escapeAttr(url)}" integrity="sha256-${hexToBase64(pin.sha256)}" crossorigin="anonymous"`
}

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
  /** Caminho local onde o app serve os arquivos de `vendor/` (ex.: '/static/vendor/'). Sem CDN. */
  vendor?:      string
  /** Transição entre páginas e pré-carregamento de links. Com `vendor`, os arquivos vêm dessa pasta; sem ele, saem embutidos. */
  navigation?:  boolean
}

export interface AlpineOpts { version?: string; plugins?: AlpinePluginName[]; vendor?: string; nonce?: string }
export interface HtmxOpts { version?: string; vendor?: string; nonce?: string; defer?: boolean }

const nonceOf = (nonce: string | undefined) => (nonce ? ` nonce="${escapeAttr(nonce)}"` : '')

/** Plugins antes do núcleo, como o Alpine exige. */
export function alpineTags(opts: AlpineOpts = {}): string[] {
  const nonce = nonceOf(opts.nonce)
  return [
    ...(opts.plugins ?? []).map(p => `<script defer ${vendorSrc(`alpine-${p}`, opts.vendor, opts.version)}${nonce}></script>`),
    `<script defer ${vendorSrc('alpine', opts.vendor, opts.version)}${nonce}></script>`,
  ]
}

/** Arquivos do Alpine na ordem de carregar, para o navegador só baixar quando a página usar. */
export function alpineFiles(vendor: string, plugins: AlpinePluginName[] = []): string[] {
  return [...plugins.map(p => vendor + pins[`alpine-${p}`].file), vendor + pins.alpine.file]
}

export function htmxTags(opts: HtmxOpts = {}): string {
  return `<script ${opts.defer ? 'defer ' : ''}${vendorSrc('htmx', opts.vendor, opts.version)}${nonceOf(opts.nonce)}></script>`
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

  if (opts.navigation) {
    parts.push(navigationTags({ base: opts.vendor, nonce: opts.nonce, htmx: Boolean(opts.htmx) }))
  }

  if (opts.alpine) {
    parts.push(...alpineTags({ ...(typeof opts.alpine === 'object' ? opts.alpine : {}), vendor: opts.vendor, nonce: opts.nonce }))
  }

  if (opts.htmx) {
    parts.push(htmxTags({ ...(typeof opts.htmx === 'object' ? opts.htmx : {}), vendor: opts.vendor, nonce: opts.nonce }))
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
