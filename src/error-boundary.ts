import { Fragment, HtmlSafeString } from './jsx-runtime'

export interface ErrorBoundaryProps {
  /**
   * Renderizado quando children lança. Recebe o Error capturado.
   *
   * ⚠️ SEGURANÇA: NÃO renderize `err.message` direto em produção —
   * pode vazar paths, secrets ou stack. Renderize mensagem genérica
   * e use `onError` pra logar internamente.
   */
  fallback: (err: Error) => unknown
  /** Callback pra log/observabilidade. Não afeta o fallback. */
  onError?: (err: Error) => void
  children: unknown
}

/**
 * Captura erros (sync ou async) de qualquer ponto da árvore filha
 * e renderiza o fallback no lugar.
 *
 * Boundaries aninhados: erro vai pro mais próximo. Erro no próprio fallback
 * NÃO é capturado (cuidado).
 */
export async function ErrorBoundary({
  fallback,
  onError,
  children,
}: ErrorBoundaryProps): Promise<HtmlSafeString> {
  try {
    // mesmo caminho dos filhos: texto é escapado, listas e Promises resolvidas
    return await Fragment({ children })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    try {
      onError?.(error)
    } catch {
      // onError não pode quebrar a recovery
    }
    // mesmo caminho dos filhos: texto é escapado, e lista funciona
    return await Fragment({ children: await fallback(error) })
  }
}
