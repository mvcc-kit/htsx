/**
 * Stores tipados para Alpine, no modelo dos signals do Svelte 5:
 *   state   → propriedade de `Alpine.store`         ($state)
 *   derived → getter, recalculado sozinho          ($derived)
 *   effects → `Alpine.effect`, roda quando muda     ($effect)
 *   actions → métodos que alteram o estado
 *
 * O mesmo módulo serve o servidor (`html()` emite só o estado inicial com safeJson) e o
 * cliente (`register()` cria o `Alpine.store` no `alpine:init`). Empacote o cliente com
 * `Bun.build`, importando de `@repo/htsx/store` (não puxa código do servidor).
 * `create()` roda sem navegador: derivados e ações são testáveis como funções puras.
 */
import { safeJson } from './escape'
import { STORE_NAME_RE } from './alpine'

type Fn = (...args: any[]) => unknown

/** Objeto do store: estado, derivados (só leitura) e ações. `D` = tipos dos derivados, `A` = argumentos das ações. */
export type StoreOf<S, D, A> =
  & S
  & { readonly [K in keyof D]: D[K] }
  & { [K in keyof A]: A[K] extends unknown[] ? (...args: A[K]) => void : never }

export interface StoreDef<S, D, A> {
  state: S
  /** Cada derivado é uma função pura do estado; vira getter. */
  derived?: { [K in keyof D]: (s: Readonly<S>) => D[K] }
  /** Cada ação recebe o store (`s`) e os argumentos da chamada. */
  actions?: { [K in keyof A]: (s: StoreOf<S, D, {}>, ...args: A[K] extends unknown[] ? A[K] : never) => void }
  /** Cada efeito roda via `Alpine.effect` no cliente (não roda em `create()`). */
  effects?: Record<string, (s: StoreOf<S, D, A>) => void>
}

export interface Store<Name extends string, S, D, A> {
  readonly name: Name
  /** Objeto do store fora do Alpine (testes, servidor). `initial` substitui campos do estado. */
  create(initial?: Partial<S>): StoreOf<S, D, A>
  /** `<script type="application/json">` com o estado inicial, para o servidor pôr na página. */
  html(initial?: Partial<S>): string
  /** No cliente: cria o `Alpine.store` no `alpine:init`, com o estado vindo de `html()`. */
  register(): void
}

export function defineStore<const Name extends string, S extends object, D = {}, A = {}>(
  name: Name,
  def: StoreDef<S, D, A>,
): Store<Name, S, D, A> {
  if (!STORE_NAME_RE.test(name)) {
    throw new Error(`htsx: nome de store inválido ${JSON.stringify(name)}; use um identificador JS, ex.: "cart"`)
  }

  function create(initial: Partial<S> = {}): StoreOf<S, D, A> {
    const obj = { ...structuredClone(def.state), ...structuredClone(initial) } as Record<string, unknown>
    for (const [k, fn] of Object.entries<Fn>(def.derived ?? {})) {
      Object.defineProperty(obj, k, { get() { return fn(this) }, enumerable: true })
    }
    for (const [k, fn] of Object.entries<Fn>(def.actions ?? {})) {
      obj[k] = function (this: unknown, ...args: unknown[]) { return fn(this, ...args) }
    }
    return obj as StoreOf<S, D, A>
  }

  return {
    name,
    create,
    html: (initial = {}) => `<script type="application/json" data-htsx-store="${name}">${safeJson(initial)}</script>`,
    register() {
      document.addEventListener('alpine:init', () => {
        const Alpine = (globalThis as unknown as { Alpine: { store(n: string, v?: unknown): any; effect(fn: () => void): void } }).Alpine
        const el = document.querySelector(`script[data-htsx-store="${name}"]`)
        Alpine.store(name, create(el?.textContent ? JSON.parse(el.textContent) : {}))
        const live = Alpine.store(name)
        for (const fn of Object.values(def.effects ?? {})) Alpine.effect(() => fn(live))
      })
    },
  }
}
