import { escapeAttr, attrJson, cssValue, cssKey, VALID_ATTR_NAME, isUnsafeEventHandler } from './escape'
import { safeUrl } from './safe-url'
import { strictFail } from './strict'

export const JSX_TO_HTML_ATTRS: Record<string, string> = {
  className:       'class',
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
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction'])

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

export function serializeAttrs(props: Record<string, unknown>, tag = 'elemento'): string {
  const parts: string[] = []

  for (const [rawKey, value] of Object.entries(props)) {
    // skip internal JSX props
    if (rawKey === 'children' || rawKey === 'key') continue

    // security: validate attr name
    if (!VALID_ATTR_NAME.test(rawKey)) {
      strictFail(`nome de atributo inválido ${JSON.stringify(rawKey)} em <${tag}>; use letras, números, "-", ":", "." ou "_"`)
      continue
    }

    // security: block native on* event handlers (allow x-on / hx-on)
    if (isUnsafeEventHandler(rawKey)) {
      strictFail(`atributo "${rawKey}" bloqueado em <${tag}>; use $${rawKey.slice(2).toLowerCase()} (Alpine) ou hx-on:${rawKey.slice(2).toLowerCase()}`)
      continue
    }

    // aria-* e data-*: booleano vira "true" ou "false"
    if (typeof value === 'boolean' && (rawKey.startsWith('aria-') || rawKey.startsWith('data-'))) {
      parts.push(`${rawKey}="${value}"`)
      continue
    }

    // omit falsy values
    if (value === null || value === undefined || value === false) continue

    // boolean true
    if (value === true) {
      const htmlKey = JSX_TO_HTML_ATTRS[rawKey] ?? rawKey
      if (rawKey.startsWith('hx-')) {
        parts.push(`${htmlKey}="true"`)
      } else {
        parts.push(htmlKey)
      }
      continue
    }

    // object / array values
    if (typeof value === 'object' && value !== null) {
      if (rawKey === 'style') {
        const css = serializeStyle(value as Record<string, string | number>, tag)
        parts.push(`style="${css}"`)
      } else {
        parts.push(`${rawKey}='${attrJson(value)}'`)
      }
      continue
    }

    // string / number — determine HTML attr name first, then escape value
    const escaped = escapeAttr(String(value))

    // $event → x-on:event (with _ → . for modifiers)
    if (rawKey.startsWith('$')) {
      const event = rawKey.slice(1).replace(/_/g, '.')
      parts.push(`x-on:${event}="${escaped}"`)
      continue
    }

    // x-bind-* → x-bind:*
    if (rawKey.startsWith('x-bind-')) {
      const attr = rawKey.slice(7)
      parts.push(`x-bind:${attr}="${escaped}"`)
      continue
    }

    // x-*_* → x-*.* (modifiers)
    if (rawKey.startsWith('x-') && rawKey.includes('_')) {
      const transformed = rawKey.replace(/_/g, '.')
      parts.push(`${transformed}="${escaped}"`)
      continue
    }

    // hx-on-htmx-* → hx-on::*
    const hxOnMatch = HX_ON_RE.exec(rawKey)
    if (hxOnMatch) {
      parts.push(`hx-on::${hxOnMatch[1]}="${escaped}"`)
      continue
    }

    // camelCase aliases (className, htmlFor, tabIndex, etc.)
    const htmlKey = JSX_TO_HTML_ATTRS[rawKey] ?? rawKey
    // Auto-sanitize URL attributes — blocks javascript:, data:, vbscript:, blob:
    let finalEscaped = escaped
    if (URL_ATTRS.has(htmlKey)) {
      const url = safeUrl(String(value))
      if (url === '#' && String(value) !== '#') {
        strictFail(`URL ${JSON.stringify(String(value))} em ${htmlKey} de <${tag}> foi trocada por "#"; use http(s), caminho relativo, mailto: ou tel:`)
      }
      finalEscaped = escapeAttr(url)
    }
    parts.push(`${htmlKey}="${finalEscaped}"`)
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : ''
}
