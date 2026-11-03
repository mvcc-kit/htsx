// Componentes de /meta. As regras estão em ./logic; aqui só se gera o HTML e se entrega ao coletor.
import { alpineFiles, alpineTags, htmxTags, type AlpineOpts, type HtmxOpts } from '../head'
import { HtmlSafeString, jsx, raw, toHtml } from '../jsx-runtime'
import { navigationTags, type NavigationOpts } from '../navigation'
import { escapeAttr } from '../escape'
import type { Children } from '../jsx-types'
import { collect, isCollecting } from './collector'
import { linkKey, metaKey, resolveAlpineOptions, resolveHtmxConfig, TITLE_KEY, type Attrs } from './logic'
import { isPrerendering, OUTLET_ID, PARTIALS_PATH } from '../outlet'
import { VENDOR_PATH } from '../vendor-path'

type Rendered = HtmlSafeString | Promise<HtmlSafeString>

/** Vai para o <head> da página; fora de `renderPage` ou do app, sai onde foi escrito. */
function place(key: string | null, node: Rendered): Rendered {
  if (!isCollecting()) return node
  // Quase toda tag é síncrona: promessa só quando há conteúdo assíncrono.
  const html = node instanceof HtmlSafeString ? node.toString() : toHtml(node)
  const marker = collect({ key, html })
  if (typeof html !== 'string') html.catch(() => {}) // a falha aparece quando a renderização aguarda a tag
  return raw(marker ?? '')
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

export interface HeadProps {
  /** Padrão `true`. `false` desliga; objeto configura o htmx (soma ao padrão). */
  htmx?: boolean | Record<string, unknown>
  /** Padrão `true`. `false` desliga; objeto escolhe os plugins. */
  alpine?: boolean | Pick<AlpineOpts, 'plugins' | 'version'>
  /** Transição e pré-carregamento. Padrão `true`. */
  navigation?: boolean
  /** Pasta que serve Alpine, htmx e a navegação. Padrão `VENDOR_PATH`. */
  vendor?: string
  nonce?: string
  children?: Children
}

/** `<head>` com charset, viewport, htmx, Alpine e navegação, todos ligados por padrão. */
export function Head(props: HeadProps = {}): Rendered {
  const vendor = props.vendor ?? VENDOR_PATH
  const { nonce } = props
  const resolved = resolveHtmxConfig(props.htmx)
  // Com CSP por nonce, o htmx precisa do nonce para o estilo e os scripts que insere.
  const config = resolved && nonce ? { inlineScriptNonce: nonce, inlineStyleNonce: nonce, ...resolved } : resolved
  const alpine = resolveAlpineOptions(props.alpine)
  return jsx('head', {
    children: [
      Meta({ charset: 'utf-8' }),
      Meta({ name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      props.navigation === false ? null : Navigation({ base: vendor, nonce }),
      config ? Htmx({ vendor, nonce, config, defer: true }) : null,
      // Com a navegação ligada, o Alpine só é baixado quando a página usa: é ela que carrega.
      alpine && props.navigation !== false
        ? place('alpine', raw(`<meta name="htsx-alpine" content="${escapeAttr(alpineFiles(vendor, (alpine as AlpineOpts).plugins).join(' '))}">`))
        : alpine ? Alpine({ ...alpine, vendor, nonce }) : null,
      props.children,
    ],
  })
}

/** Onde o conteúdo fica no layout. Com `hx-boost` no `<body>`, a navegação troca só este trecho. */
export function Outlet(props: {
  /**
   * Em site estático, baixa o parcial ao passar o mouse. Só ligue se o host der cache a
   * `/_htsx/partial/` (ex.: `max-age=300`); sem cache, cada clique baixaria duas vezes.
   */
  preload?: boolean
  children?: Children
}): Rendered {
  // hx-history-elt: voltar no navegador troca só este trecho, não o <body> inteiro
  const outlet = jsx('div', { id: OUTLET_ID, 'hx-history-elt': 'true', children: props.children })
  if (!isPrerendering()) return outlet
  const preload = props.preload ? ' data-preload="true"' : ''
  return Promise.all([place('partials', raw(`<meta name="htsx-partials" content="${PARTIALS_PATH}"${preload}>`)), outlet])
    .then(([marker, html]) => raw(String(marker) + String(html)))
}
