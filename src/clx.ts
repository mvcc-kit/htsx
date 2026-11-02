/**
 * Class name joiner. Filtra falsy e une com espaço.
 * Útil para className condicional sem libs externas.
 */
export function clx(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(' ')
}
