/**
 * Named slots — passar múltiplas regiões a um componente.
 * API simples: dev passa `slots={{ header: ..., footer: ... }}` ao componente.
 * Componente acessa via props.slots.
 *
 * Não é um runtime mágico — é só convenção tipada.
 */

export type Slots<Names extends string = string> = {
  [K in Names]?: unknown
}

/**
 * Type helper pra componentes com slots tipados.
 *
 * ```ts
 * const Card: SlotComponent<'header' | 'footer'> = ({ slots, children }) => (
 *   <div>{slots.header}{children}{slots.footer}</div>
 * )
 * ```
 */
export interface SlotComponentProps<Names extends string> {
  slots?: Slots<Names>
  children?: unknown
}

/**
 * Renderiza slot se presente, ou fallback.
 * Útil pra defaults: `slot('header', props.slots, <h2>Default</h2>)`
 */
export function slot<Names extends string>(
  name: Names,
  slots: Slots<Names> | undefined,
  fallback: unknown = null,
): unknown {
  const v = slots?.[name]
  return v !== undefined && v !== null ? v : fallback
}
