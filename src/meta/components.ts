// Componentes de /meta. As regras estão em ./logic; aqui só se gera o HTML e se entrega ao coletor.
import { alpineTags, htmxTags, type AlpineOpts, type HtmxOpts } from '../head'
import { HtmlSafeString, jsx, raw, toHtml } from '../jsx-runtime'
import { navigationTags, type NavigationOpts } from '../navigation'
import { escapeAttr } from '../escape'
import type { Children } from '../jsx-types'
import { collect } from './collector'
import { linkKey, metaKey, TITLE_KEY, type Attrs } from './logic'

type Rendered = HtmlSafeString | Promise<HtmlSafeString>

/** Vai para o <head> da página; fora de `renderPage` ou do app, sai onde foi escrito. */
function place(key: string | null, node: Rendered): Rendered {
  const html = toHtml(node)
  const marker = collect({ key, html })
  if (marker === null) return node
  html.catch(() => {}) // a falha aparece quando a renderização aguarda a tag
  return raw(marker)
}

export function Title(props: { children?: Children }): Rendered {
  return place(TITLE_KEY, jsx('title', { children: props.children }))
}

export function Meta(props: Attrs): Rendered {
  return place(metaKey(props), jsx('meta', props))
}

export function Link(props: Attrs): Rendered {
  return place(linkKey(props), jsx('link', props))
}

export function Alpine(props: AlpineOpts = {}): Rendered {
  return place('alpine', raw(alpineTags(props).join('')))
}

export function Htmx(props: HtmxOpts & { config?: Record<string, unknown> } = {}): Rendered {
  const config = props.config ? `<meta name="htmx-config" content="${escapeAttr(JSON.stringify(props.config))}">` : ''
  return place('htmx', raw(config + htmxTags(props)))
}

export function Navigation(props: NavigationOpts = {}): Rendered {
  return place('navigation', raw(navigationTags(props)))
}
