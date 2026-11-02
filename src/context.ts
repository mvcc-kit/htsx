// Tipo mínimo local — Bun e Workers expõem AsyncLocalStorage via node:async_hooks
// mas @types/node não está disponível neste pacote. Evita dep adicional.
declare class AsyncLocalStorage<T> {
  run<R>(store: T, callback: () => R): R
  getStore(): T | undefined
}
import { AsyncLocalStorage as _ALS } from 'node:async_hooks'
const ALS = _ALS as unknown as typeof AsyncLocalStorage

// Storage privado — única instância no módulo. Type erased no nível do ALS;
// quem chama useContext<T>() afirma o tipo (igual React.useContext).
const ctxStorage = new ALS<unknown>()

/**
 * Executa `fn` com `ctx` acessível via useContext() em qualquer ponto async-chain.
 * Aceita factories sync ou async. Retorna o que a factory retornar.
 */
export function withContext<Ctx, T>(
  ctx: Ctx,
  fn: () => T | Promise<T>,
): Promise<T> {
  return ctxStorage.run(ctx, () => Promise.resolve(fn()))
}

/**
 * Acessa o contexto atual. Throw se chamado fora de withContext/renderPage.
 *
 * Tipagem é responsabilidade do chamador (afirmação) — mesma escolha do
 * React.useContext. Use um helper tipado se quiser segurança total no app.
 */
export function useContext<Ctx>(): Ctx {
  const ctx = ctxStorage.getStore()
  if (ctx === undefined) {
    throw new Error(
      'useContext: chamado fora de withContext/renderPage. ' +
      'Envolva o render com renderPage(..., { context: {...} }) ' +
      'ou withContext({...}, () => ...).',
    )
  }
  return ctx as Ctx
}

/**
 * Versão tolerante: retorna `undefined` em vez de throw quando fora de escopo.
 * Útil em componentes opcionalmente reativos a contexto.
 */
export function maybeContext<Ctx>(): Ctx | undefined {
  return ctxStorage.getStore() as Ctx | undefined
}
