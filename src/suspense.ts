import { HtmlSafeString, jsx, toHtml } from './jsx-runtime'
import { maybeContext } from './context'

/**
 * Suspense via OOB swap. Não usa streaming/SSE — emite placeholder
 * com `hx-get` pra endpoint que vai resolver a Promise registrada no
 * registry (request-scoped via AsyncLocalStorage).
 *
 * Fluxo:
 *   1. <Suspense> emite <div hx-get="/_htsx/suspense/{id}" hx-trigger="load">{fallback}</div>
 *   2. Cliente, ao carregar, dispara request pro endpoint
 *   3. Server handler chama resolveSuspense(id) → retorna HTML real
 *   4. HTMX faz swap outerHTML
 */

const SUSPENSE_REGISTRY = Symbol.for('htsx.suspense_registry')
const ID_RE = /^[a-zA-Z][\w-]*$/

interface PendingEntry {
  promise: Promise<string>
}

export interface SuspenseRegistry {
  promises: Map<string, PendingEntry>
  prefix: string
  defaultTimeoutMs: number
}

interface ContextWithRegistry {
  [k: symbol]: SuspenseRegistry | undefined
}

/**
 * Cria um registry pra incluir no context do render.
 *
 * @param prefix endpoint base (default '/_htsx/suspense'). Server precisa
 *   ter handler em `${prefix}/:id` que chama resolveSuspense.
 * @param defaultTimeoutMs timeout default por Suspense (default 30000ms).
 */
export function suspenseRegistry(
  prefix = '/_htsx/suspense',
  defaultTimeoutMs = 30_000,
): ContextWithRegistry {
  return {
    [SUSPENSE_REGISTRY]: {
      promises: new Map(),
      prefix,
      defaultTimeoutMs,
    },
  }
}

function getRegistry(): SuspenseRegistry {
  const ctx = maybeContext<ContextWithRegistry>()
  const reg = ctx?.[SUSPENSE_REGISTRY]
  if (!reg) {
    throw new Error(
      'Suspense: registry não encontrado no context. ' +
      'Use renderPage(factory, { context: { ...suspenseRegistry() } })',
    )
  }
  return reg
}

export interface SuspenseProps {
  /** Conteúdo mostrado enquanto children resolve. */
  fallback: unknown
  /** Conteúdo real (geralmente Promise<JSX>). */
  children: unknown
  /** ID custom. Auto-gen via crypto se omitido. */
  id?: string
  /** Timeout em ms. Default vem do registry (30s). */
  timeout?: number
}

/**
 * Marca uma região como assíncrona. Emite placeholder imediatamente
 * e a Promise é resolvida via endpoint separado quando o cliente busca.
 */
export function Suspense({ fallback, children, id, timeout }: SuspenseProps): HtmlSafeString | Promise<HtmlSafeString> {
  const reg = getRegistry()
  const suspenseId = id ?? generateId()
  if (!ID_RE.test(suspenseId)) {
    throw new Error(`Suspense: id inválido "${suspenseId}"`)
  }
  if (reg.promises.has(suspenseId)) {
    throw new Error(`Suspense: id duplicado "${suspenseId}"`)
  }

  const ms = timeout ?? reg.defaultTimeoutMs
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<string>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`Suspense timeout (${ms}ms)`)), ms)
  })
  // Pelo caminho normal: texto vindo de fora é escapado.
  const promise = Promise.race([toHtml(children), timeoutPromise]).finally(() => clearTimeout(timer))
  // A falha aparece em resolveSuspense; se o cliente nunca pedir, não derruba o processo.
  promise.catch(() => {})
  reg.promises.set(suspenseId, { promise })

  return jsx('div', {
    id: `susp-${suspenseId}`,
    'hx-get': `${reg.prefix}/${suspenseId}`,
    'hx-trigger': 'load',
    'hx-swap': 'outerHTML',
    children: fallback,
  })
}

/**
 * Server handler: resolve um Suspense pelo id.
 * Retorna o HTML pronto ou null se ID desconhecido/expirado.
 *
 * Sempre remove do registry após resolver (uso único).
 */
export async function resolveSuspense(id: string): Promise<string | null> {
  if (!ID_RE.test(id)) return null
  const reg = maybeContext<ContextWithRegistry>()?.[SUSPENSE_REGISTRY]
  if (!reg) return null
  const entry = reg.promises.get(id)
  if (!entry) return null
  reg.promises.delete(id)
  try {
    return await entry.promise
  } catch {
    return null
  }
}

/** Gera ID alfanumérico curto. Usa crypto se disponível. */
function generateId(): string {
  const g = globalThis as unknown as { crypto?: Crypto }
  if (g.crypto?.randomUUID) {
    // Hyphens not allowed by ID_RE — replace with underscores
    return 's' + g.crypto.randomUUID().replace(/-/g, '_')
  }
  return 's' + Math.random().toString(36).slice(2, 10)
}
