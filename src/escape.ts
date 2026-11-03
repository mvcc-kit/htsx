const HTML_CHARS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => HTML_CHARS[c]!)
}

export function escapeAttr(s: string): string {
  return s.replace(/[&<>"]/g, c => HTML_CHARS[c]!)
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function attrJson(value: unknown): string {
  return safeJson(value).replace(/'/g, '&#39;')
}

/** Corta no primeiro `;` fora de aspas e parênteses: ali começaria outra propriedade CSS. */
function firstCssValue(s: string): string {
  let quote = ''
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ';' && depth === 0) return s.slice(0, i)
  }
  return s
}

export function cssValue(v: string | number): string {
  // Escape " to prevent breaking out of style="..." HTML attribute.
  // Strip < > to block any HTML/tag injection within the CSS value.
  return firstCssValue(String(v)).replace(/"/g, '&quot;').replace(/[<>]/g, '')
}

// Valid CSS property name after camelCase→kebab conversion:
//   standard props:  color, background-color, -webkit-transform
//   custom props:    --my-var, --color-primary
const VALID_CSS_KEY_RE = /^-{0,2}[a-zA-Z_][a-zA-Z0-9_-]*$/

function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase()
}

/**
 * Converts a camelCase CSS property name to kebab-case and validates it.
 * Returns empty string for keys that could inject into the style attribute.
 */
export function cssKey(raw: string): string {
  const kebab = camelToKebab(raw)
  return VALID_CSS_KEY_RE.test(kebab) ? kebab : ''
}

export const VALID_ATTR_NAME = /^[a-zA-Z_$][a-zA-Z0-9_:\-.$]*$/

export function isUnsafeEventHandler(key: string): boolean {
  const lower = key.toLowerCase()
  if (!lower.startsWith('on')) return false
  if (lower.startsWith('x-on') || lower.startsWith('hx-on')) return false
  return true
}
