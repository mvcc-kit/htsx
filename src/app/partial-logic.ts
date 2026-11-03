// Regras dos parciais, sem renderizar nada e sem imports: só dados entram e saem.

/** Padrão Standard Schema, implementado por Valibot, Zod e outros. O htsx não depende de nenhum. */
export interface StandardSchema<Output = unknown> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>
    readonly types?: { readonly input: unknown; readonly output: Output }
  }
}
type StandardResult<Output> = { readonly value: Output; readonly issues?: undefined } | { readonly issues: ReadonlyArray<unknown> }

export const PARTIAL_NAME = /^[a-zA-Z][\w-]*$/

/** Nome do parcial pedido na URL: `?/list&id=1` → `list`. */
export function partialNameFromQuery(query: URLSearchParams): string | null {
  for (const key of query.keys()) if (key.startsWith('/')) return key.slice(1)
  return null
}

/** Os valores chegam como texto: quem converte é o schema. Chave repetida vira lista. */
export function queryToInput(query: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = Object.create(null)
  for (const key of new Set(query.keys())) {
    if (key.startsWith('/')) continue
    const values = query.getAll(key)
    out[key] = values.length > 1 ? values : values[0]!
  }
  return out
}

function scalar(key: string, value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  throw new Error(`htsx: parcial: "${key}" não cabe na URL (${value === null ? 'null' : typeof value}); use texto, número, booleano ou lista deles`)
}

/** URL relativa à página atual, no formato das ações: `?/list&id=1`. */
export function partialUrl(name: string, input: object): string {
  const parts = [`?/${encodeURIComponent(name)}`]
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === 'children') continue
    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(scalar(key, item))}`)
    }
  }
  return parts.join('&')
}

export interface PartialRequestOpts {
  target?: string
  swap?: string
  trigger?: string
  indicator?: string
  pushUrl?: boolean | string
}

export interface PartialRequestAttrs {
  'hx-get': string
  'hx-target'?: string
  'hx-swap'?: string
  'hx-trigger'?: string
  'hx-indicator'?: string
  'hx-push-url'?: string
}

export function partialAttrs(url: string, opts: PartialRequestOpts = {}): PartialRequestAttrs {
  const attrs: PartialRequestAttrs = { 'hx-get': url }
  if (opts.target) attrs['hx-target'] = opts.target
  if (opts.swap) attrs['hx-swap'] = opts.swap
  if (opts.trigger) attrs['hx-trigger'] = opts.trigger
  if (opts.indicator) attrs['hx-indicator'] = opts.indicator
  if (opts.pushUrl !== undefined) attrs['hx-push-url'] = String(opts.pushUrl)
  return attrs
}
