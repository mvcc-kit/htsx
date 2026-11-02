// Tipos de JSX: atributos HTML por elemento, mais as famílias hx-*, x-*, $*, aria-* e data-*.
// Atributo fora daqui (ex.: `clas=`, `onclick=`) é erro de compilação.
import type { HtmlSafeString } from './jsx-runtime'

type S = string
type N = number | string
type B = boolean

/** Qualquer coisa que o htsx sabe desenhar como filho. */
export type Child =
  | HtmlSafeString
  | Promise<string | HtmlSafeString>
  | string
  | number
  | boolean
  | null
  | undefined
export type Children = Child | readonly Children[]

/** Filhos de `<script>` e `<style>`: só `raw()` (texto comum lança erro). */
export type RawChildren =
  | HtmlSafeString
  | Promise<HtmlSafeString>
  | null
  | undefined
  | false
  | readonly RawChildren[]

type AttrValue = string | number | boolean | null | undefined
type JsonValue = AttrValue | Record<string, unknown> | readonly unknown[]

export interface PatternAttrs {
  [hx: `hx-${string}`]: JsonValue
  [alpine: `x-${string}`]: JsonValue
  [event: `$${string}`]: string | undefined
  [aria: `aria-${string}`]: AttrValue
  [data: `data-${string}`]: JsonValue
}

export interface GlobalAttrs extends PatternAttrs {
  children?: Children
  key?: string | number
  accesskey?: S; accessKey?: S
  autocapitalize?: S
  autofocus?: B; autoFocus?: B
  class?: S; className?: S
  contenteditable?: B | 'true' | 'false' | 'plaintext-only'; contentEditable?: B | 'true' | 'false' | 'plaintext-only'
  dir?: 'ltr' | 'rtl' | 'auto'
  draggable?: B | 'true' | 'false'
  enterkeyhint?: S
  hidden?: B | 'until-found'
  id?: S
  inert?: B
  inputmode?: S; inputMode?: S
  is?: S
  itemid?: S; itemprop?: S; itemref?: S; itemscope?: B; itemtype?: S
  lang?: S
  nonce?: S
  part?: S
  popover?: B | 'auto' | 'manual' | 'hint'
  role?: S
  slot?: S
  spellcheck?: B | 'true' | 'false'
  style?: S | Record<string, string | number | null | undefined>
  tabindex?: N; tabIndex?: N
  title?: S
  translate?: 'yes' | 'no'
}

interface FormControlAttrs {
  disabled?: B
  form?: S
  name?: S
}

interface FormSubmitAttrs {
  formaction?: S; formenctype?: S; formmethod?: S; formnovalidate?: B; formtarget?: S
}

interface LinkLikeAttrs {
  href?: S; target?: S; rel?: S; download?: B | S; hreflang?: S; ping?: S; referrerpolicy?: S
}

interface MediaAttrs {
  src?: S; autoplay?: B; autoPlay?: B; controls?: B; loop?: B; muted?: B
  preload?: 'none' | 'metadata' | 'auto' | ''
  crossorigin?: S; crossOrigin?: S
}

interface SizeAttrs { width?: N; height?: N }

interface ElementAttrs {
  a: LinkLikeAttrs & { type?: S }
  area: LinkLikeAttrs & { alt?: S; coords?: S; shape?: S }
  audio: MediaAttrs
  base: { href?: S; target?: S }
  blockquote: { cite?: S }
  button: FormControlAttrs & FormSubmitAttrs & {
    type?: 'button' | 'submit' | 'reset'; value?: N
    popovertarget?: S; popovertargetaction?: S; command?: S; commandfor?: S
  }
  canvas: SizeAttrs
  col: { span?: N }
  colgroup: { span?: N }
  data: { value?: N }
  del: { cite?: S; datetime?: S }
  details: { open?: B; name?: S }
  dialog: { open?: B }
  embed: SizeAttrs & { src?: S; type?: S }
  fieldset: FormControlAttrs
  form: {
    action?: S; method?: S; enctype?: S; encType?: S; novalidate?: B; noValidate?: B
    target?: S; autocomplete?: S; autoComplete?: S; name?: S; 'accept-charset'?: S; rel?: S
  }
  iframe: SizeAttrs & {
    src?: S; srcdoc?: S; name?: S; allow?: S; allowfullscreen?: B; allowFullScreen?: B
    loading?: 'eager' | 'lazy'; referrerpolicy?: S; sandbox?: S
  }
  img: SizeAttrs & {
    src?: S; alt?: S; srcset?: S; sizes?: S; loading?: 'eager' | 'lazy'
    decoding?: 'sync' | 'async' | 'auto'; crossorigin?: S; crossOrigin?: S
    referrerpolicy?: S; usemap?: S; useMap?: S; ismap?: B; fetchpriority?: 'high' | 'low' | 'auto'
  }
  input: FormControlAttrs & FormSubmitAttrs & SizeAttrs & {
    accept?: S; alt?: S; autocomplete?: S; autoComplete?: S; checked?: B; dirname?: S
    list?: S; max?: N; maxlength?: N; maxLength?: N; min?: N; minlength?: N; minLength?: N
    multiple?: B; pattern?: S; placeholder?: S; readonly?: B; readOnly?: B; required?: B
    size?: N; src?: S; step?: N; type?: S; value?: N; capture?: S
  }
  ins: { cite?: S; datetime?: S }
  label: { for?: S; htmlFor?: S }
  li: { value?: N }
  link: {
    href?: S; rel?: S; as?: S; type?: S; media?: S; sizes?: S; crossorigin?: S; crossOrigin?: S
    integrity?: S; hreflang?: S; referrerpolicy?: S; disabled?: B; fetchpriority?: S; blocking?: S
  }
  map: { name?: S }
  meta: {
    name?: S; content?: S; charset?: S; charSet?: S; 'http-equiv'?: S; httpEquiv?: S
    media?: S; property?: S
  }
  meter: { value?: N; min?: N; max?: N; low?: N; high?: N; optimum?: N }
  object: SizeAttrs & { data?: S; type?: S; name?: S; form?: S }
  ol: { reversed?: B; start?: N; type?: S }
  optgroup: { disabled?: B; label?: S }
  option: { disabled?: B; label?: S; selected?: B; value?: N }
  output: { for?: S; htmlFor?: S; form?: S; name?: S }
  progress: { value?: N; max?: N }
  q: { cite?: S }
  script: {
    children?: RawChildren
    src?: S; type?: S; async?: B; defer?: B; crossorigin?: S; crossOrigin?: S
    integrity?: S; nomodule?: B; referrerpolicy?: S; blocking?: S; fetchpriority?: S
  }
  select: FormControlAttrs & {
    autocomplete?: S; autoComplete?: S; multiple?: B; required?: B; size?: N
  }
  slot: { name?: S }
  source: SizeAttrs & { src?: S; srcset?: S; type?: S; media?: S; sizes?: S }
  style: { children?: RawChildren; media?: S; blocking?: S }
  table: { border?: N; cellpadding?: N; cellPadding?: N; cellspacing?: N; cellSpacing?: N }
  td: { colspan?: N; colSpan?: N; rowspan?: N; rowSpan?: N; headers?: S }
  template: { shadowrootmode?: 'open' | 'closed' }
  textarea: FormControlAttrs & {
    autocomplete?: S; autoComplete?: S; cols?: N; dirname?: S; maxlength?: N; maxLength?: N
    minlength?: N; minLength?: N; placeholder?: S; readonly?: B; readOnly?: B
    required?: B; rows?: N; wrap?: 'hard' | 'soft' | 'off'
  }
  th: { colspan?: N; colSpan?: N; rowspan?: N; rowSpan?: N; headers?: S; scope?: S; abbr?: S }
  time: { datetime?: S }
  track: { default?: B; kind?: S; label?: S; src?: S; srclang?: S }
  video: MediaAttrs & SizeAttrs & { poster?: S; playsinline?: B }
}

type PlainElement =
  | 'abbr' | 'address' | 'article' | 'aside' | 'b' | 'bdi' | 'bdo' | 'body' | 'br'
  | 'caption' | 'cite' | 'code' | 'dd' | 'dfn' | 'div' | 'dl' | 'dt' | 'em'
  | 'figcaption' | 'figure' | 'footer' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'head' | 'header' | 'hgroup' | 'hr' | 'html' | 'i' | 'kbd' | 'legend' | 'main'
  | 'mark' | 'menu' | 'nav' | 'noscript' | 'p' | 'picture' | 'pre' | 'rp' | 'rt'
  | 'ruby' | 's' | 'samp' | 'search' | 'section' | 'small' | 'span' | 'strong'
  | 'sub' | 'summary' | 'sup' | 'tbody' | 'tfoot' | 'thead' | 'title' | 'tr' | 'u'
  | 'ul' | 'var' | 'wbr'

// SVG tem centenas de atributos; aceita qualquer nome.
type LooseAttrs = GlobalAttrs & { [attr: string]: unknown }
type SvgElement =
  | 'svg' | 'g' | 'path' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'
  | 'rect' | 'text' | 'tspan' | 'defs' | 'use' | 'symbol' | 'clipPath' | 'mask'
  | 'linearGradient' | 'radialGradient' | 'stop' | 'pattern' | 'filter' | 'foreignObject'

export type HtsxIntrinsicElements =
  & { [K in keyof ElementAttrs]: Omit<GlobalAttrs, keyof ElementAttrs[K]> & ElementAttrs[K] }
  & { [K in PlainElement]: GlobalAttrs }
  & { [K in SvgElement]: LooseAttrs }
  & { [custom: `${string}-${string}`]: LooseAttrs }
