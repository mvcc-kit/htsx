import { HtmlSafeString, raw } from './jsx-runtime'
import { escapeHtml } from './escape'

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
    const resolved = await Promise.resolve(children)
    return raw(String(resolved ?? ''))
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    try {
      onError?.(error)
    } catch {
      // onError não pode quebrar a recovery
    }
    const fb = await Promise.resolve(fallback(error))
    // Safe-stringify: HtmlSafeString (JSX output) passes through;
    // plain strings are escaped so fallback functions can't return raw HTML.
    const fbStr = fb instanceof HtmlSafeString
      ? String(fb)
      : escapeHtml(String(fb ?? ''))
    return raw(fbStr)
  }
}
