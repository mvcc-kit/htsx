import { escapeAttr, attrJson, cssValue, cssKey, VALID_ATTR_NAME, isUnsafeEventHandler } from './escape'
import { safeUrl } from './safe-url'
import { strictFail } from './strict'

export const JSX_TO_HTML_ATTRS: Record<string, string> = {
  className:       'class',
  formAction:      'formaction',
  htmlFor:         'for',
  tabIndex:        'tabindex',
  readOnly:        'readonly',
  maxLength:       'maxlength',
  minLength:       'minlength',
  autoFocus:       'autofocus',
  autoPlay:        'autoplay',
  autoComplete:    'autocomplete',
  inputMode:       'inputmode',
  charSet:         'charset',
  httpEquiv:       'http-equiv',
  colSpan:         'colspan',
  rowSpan:         'rowspan',
  encType:         'enctype',
  noValidate:      'novalidate',
  allowFullScreen: 'allowfullscreen',
  crossOrigin:     'crossorigin',
  cellPadding:     'cellpadding',
  cellSpacing:     'cellspacing',
  useMap:          'usemap',
  accessKey:       'accesskey',
  contentEditable: 'contenteditable',
}

// HTML attributes that carry URLs — auto-sanitized via safeUrl
// Comparados em minúsculas: HTML ignora maiúsculas, então formAction e HREF também valem.
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'ping', 'cite', 'manifest', 'xlink:href'])

function serializeStyle(obj: Record<string, string | number>, tag: string): string {
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => {
      const key = cssKey(k)
      // Drop property if key is invalid (could inject into style="...")
      if (!key) strictFail(`propriedade CSS inválida ${JSON.stringify(k)} em style de <${tag}>; use camelCase (fontSize) ou kebab-case (font-size)`)
      if (/[<>]/.test(String(v))) strictFail(`valor CSS ${JSON.stringify(String(v))} em style de <${tag}> tem < ou >, que são removidos; tire esses caracteres`)
      return key ? `${key}: ${cssValue(v)};` : ''
    })
    .filter(Boolean)
    .join(' ')
}

const HX_ON_RE = /^hx-on-htmx-(.+)$/

/** O que se sabe de um nome de atributo, sem olhar o valor. */
interface AttrInfo {
  /** Nome inválido ou `on*` nativo: não sai no HTML. */
  blocked: boolean
  /** Nome quando o valor é texto ou número. */
  name: string
  /** Nome quando o valor é `true`. */
  flagName: string
  /** `aria-*` e `data-*`: booleano vira "true" ou "false". */
  stringBoolean: boolean
  /** `hx-*`: `true` vira `="true"`. */
  htmx: boolean
  url: boolean
}

function describeAttr(key: string): AttrInfo {
  // hasOwn: 'constructor' viria de Object, e sairia o código da função no HTML
  const flagName = Object.hasOwn(JSX_TO_HTML_ATTRS, key) ? JSX_TO_HTML_ATTRS[key]! : key
  let name = flagName
  if (key.startsWith('$')) name = `x-on:${key.slice(1).replace(/_/g, '.')}`        // $event → x-on:event
  else if (key.startsWith('x-bind-')) name = `x-bind:${key.slice(7)}`                // x-bind-* → x-bind:*
  else if (key.startsWith('x-') && key.includes('_')) name = key.replace(/_/g, '.')  // x-*_* → x-*.*
  else {
    const hxOn = HX_ON_RE.exec(key)
    if (hxOn) name = `hx-on::${hxOn[1]}`                                              // hx-on-htmx-* → hx-on::*
  }
  return {
    blocked: !VALID_ATTR_NAME.test(key) || isUnsafeEventHandler(key),
    name,
    flagName,
    stringBoolean: key.startsWith('aria-') || key.startsWith('data-'),
    htmx: key.startsWith('hx-'),
    url: name === flagName && URL_ATTRS.has(flagName.toLowerCase()),
  }
}

// Os nomes de atributo se repetem muito; o limite cobre `{...props}` com nomes vindos de fora.
const attrCache = new Map<string, AttrInfo>()

function attrInfo(key: string): AttrInfo {
  let info = attrCache.get(key)
  if (!info) {
    info = describeAttr(key)
    if (attrCache.size < 2000) attrCache.set(key, info)
  }
  return info
}

function reportBlocked(key: string, tag: string): void {
  if (!VALID_ATTR_NAME.test(key)) {
    strictFail(`nome de atributo inválido ${JSON.stringify(key)} em <${tag}>; use letras, números, "-", ":", "." ou "_"`)
  } else {
    const event = key.slice(2).toLowerCase()
    strictFail(`atributo "${key}" bloqueado em <${tag}>; use $${event} (Alpine) ou hx-on:${event} (htmx)`)
  }
}

export function serializeAttrs(props: Record<string, unknown>, tag = 'elemento'): string {
  let out = ''

  for (const key of Object.keys(props)) {
    if (key === 'children' || key === 'key') continue
    const value = props[key]
    const info = attrInfo(key)

    if (info.blocked) {
      reportBlocked(key, tag)
      continue
    }

    if (typeof value === 'boolean') {
      if (info.stringBoolean) out += ` ${key}="${value}"`
      else if (value) out += info.htmx ? ` ${info.flagName}="true"` : ` ${info.flagName}`
      continue
    }

    if (value === null || value === undefined) continue

    // função viraria o código-fonte dela no HTML
    if (typeof value === 'function') {
      strictFail(`atributo "${key}" de <${tag}> recebeu uma função; chame a função ou passe o valor`)
      continue
    }

    if (typeof value === 'object') {
      out += key === 'style'
        ? ` style="${serializeStyle(value as Record<string, string | number>, tag)}"`
        : ` ${key}='${attrJson(value)}'`
      continue
    }

    const text = String(value)
    if (info.url) {
      const url = safeUrl(text)
      if (url === '#' && text !== '#') {
        strictFail(`URL ${JSON.stringify(text)} em ${info.name} de <${tag}> foi trocada por "#"; use http(s), caminho relativo, mailto: ou tel:`)
      }
      out += ` ${info.name}="${escapeAttr(url)}"`
    } else {
      out += ` ${info.name}="${escapeAttr(text)}"`
    }
  }

  return out
}
