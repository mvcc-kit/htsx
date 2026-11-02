// Modo estrito: o que hoje some em silêncio vira erro com o nome do problema e a correção.
// Liga com HTSX_STRICT=1 (os testes ligam sempre). Lido a cada chamada para poder ser trocado.

export function isStrict(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return env?.HTSX_STRICT === '1'
}

/** No modo estrito lança `htsx: <msg>`; fora dele não faz nada (o comportamento seguro segue). */
export function strictFail(msg: string): void {
  if (isStrict()) throw new Error(`htsx: ${msg}`)
}
