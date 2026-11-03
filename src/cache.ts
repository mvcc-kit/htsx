/**
 * Per-request memoization via AsyncLocalStorage.
 *
 * Uso típico: várias partes da árvore JSX chamam `getUser(id)`.
 * Sem cache: N queries no DB. Com cache: 1 query, N-1 hits.
 *
 * Segurança crítica: cache é request-scoped. Quando o ALS sai de escopo,
 * o Map é coletado. Impossível um user ver dados do outro.
 */

import { maybeContext } from './context'

const CACHE_SYMBOL = Symbol.for('htsx.cache')

interface CacheState {
  store: Map<string, unknown>
  maxSize: number
}

interface ContextWithCache {
  [k: symbol]: CacheState | undefined
}

/**
 * Cria entry de cache pra incluir no context do render.
 * @param maxSize limite de entradas (DoS protection). Default 1000.
 */
export function cacheContext(maxSize = 1000): ContextWithCache {
  if (maxSize < 1) throw new Error('htsx: cacheContext: maxSize deve ser >= 1')
  return { [CACHE_SYMBOL]: { store: new Map(), maxSize } }
}

function getState(): CacheState | null {
  const ctx = maybeContext<ContextWithCache>()
  return ctx?.[CACHE_SYMBOL] ?? null
}

let fnCounter = 0
const fnIds = new WeakMap<object, string>()
function fnId(fn: object): string {
  let id = fnIds.get(fn)
  if (!id) {
    id = `f${++fnCounter}`
    fnIds.set(fn, id)
  }
  return id
}

export interface CacheOptions<Args extends unknown[]> {
  /** Custom key gen. Default JSON.stringify(args). */
  key?: (...args: Args) => string
}

/**
 * Memoiza uma função no escopo da request. Fora de context, executa normalmente.
 *
 * - Args devem ser JSON-serializáveis (ou passe `opts.key`)
 * - Resultados de erro NÃO são cacheados (próxima call tenta de novo)
 * - Calls concorrentes podem executar a função mais de uma vez (sem dedup
 *   de in-flight promises — feature opt-in via cacheInflight se quiser depois)
 */
export function cache<Args extends unknown[], R>(
  fn: (...args: Args) => R | Promise<R>,
  opts: CacheOptions<Args> = {},
): (...args: Args) => Promise<R> {
  const id = fnId(fn as unknown as object)
  return async (...args: Args): Promise<R> => {
    const state = getState()
    if (!state) return await fn(...args)

    const argsKey = opts.key ? opts.key(...args) : JSON.stringify(args)
    const key = `${id}:${argsKey}`
    if (state.store.has(key)) return state.store.get(key) as R
    if (state.store.size >= state.maxSize) {
      throw new Error(`htsx: cache: limite de ${state.maxSize} entries excedido`)
    }
    const result = await fn(...args)
    state.store.set(key, result)
    return result
  }
}

/** Inspeção (debug/tests). Retorna número de entradas, ou null se sem context. */
export function cacheSize(): number | null {
  return getState()?.store.size ?? null
}
