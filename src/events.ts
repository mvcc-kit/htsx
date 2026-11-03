/**
 * Typed HX-Trigger event builder.
 *
 * HTMX permite o server emitir eventos via header HX-Trigger (JSON map).
 * Cliente Alpine escuta com `@event-name.window="..."`. Esta API:
 *
 * - Define o catálogo de eventos com seus payloads tipados
 * - emit(name, ...args) gera o objeto pronto pra header
 * - emitMany() merge múltiplos
 * - Refactor (renomear evento) pega em compile time
 */

const EVENT_NAME_RE = /^[a-zA-Z][\w:-]*$/

export type EventMap = Record<string, (...args: never[]) => unknown>

export interface EventEmitter<E extends EventMap> {
  emit<K extends keyof E & string>(
    name: K,
    ...args: Parameters<E[K]>
  ): Record<string, unknown>

  emitMany(
    ...emissions: Array<Record<string, unknown>>
  ): Record<string, unknown>

  /** Lista de nomes válidos (runtime). */
  names: Array<keyof E & string>
}

export function defineEvents<E extends EventMap>(events: E): EventEmitter<E> {
  // Valida nomes na criação (fail fast)
  for (const name of Object.keys(events)) {
    if (!EVENT_NAME_RE.test(name)) {
      throw new Error(`defineEvents: nome de evento inválido "${name}"`)
    }
  }

  return {
    names: Object.keys(events) as Array<keyof E & string>,

    emit(name, ...args) {
      // Type-safe na chamada (TS) + revalida em runtime (defensivo)
      if (!EVENT_NAME_RE.test(name)) {
        throw new Error(`emit: nome inválido "${name}"`)
      }
      if (!Object.hasOwn(events, name)) {
        throw new Error(`emit: evento não registrado "${name}"`)
      }
      const handler = events[name]
      if (!handler) {
        throw new Error(`emit: evento não registrado "${name}"`)
      }
      const payload = handler(...args)
      return { [name]: payload }
    },

    emitMany(...emissions) {
      const merged: Record<string, unknown> = {}
      for (const e of emissions) {
        Object.assign(merged, e)
      }
      return merged
    },
  }
}
