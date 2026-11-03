/**
 * Server-Sent Events helpers. Web-standard (ReadableStream + Response).
 *
 * Cliente HTMX:
 *   <div hx-ext="sse" sse-connect="/progress" sse-swap="done">
 */

const EVENT_NAME_RE = /^[a-zA-Z][\w:-]*$/

export interface SseEventOpts {
  /** Identificador do evento (event:). Default 'message'. */
  name?: string
  /** ID do evento (id:). Não pode conter newline. */
  id?: string
  /** Retry hint pra cliente (ms). */
  retry?: number
}

/**
 * Constrói uma frame SSE válida.
 * - Multiline data vira múltiplas linhas `data:`
 * - Object data → JSON
 */
export function sseEvent(
  data: string | object,
  opts: SseEventOpts = {},
): string {
  const name = opts.name ?? 'message'
  if (!EVENT_NAME_RE.test(name)) {
    throw new Error(`sseEvent: nome inválido "${name}"`)
  }
  if (opts.id !== undefined) {
    if (typeof opts.id !== 'string') throw new Error('sseEvent: id deve ser string')
    if (/[\r\n]/.test(opts.id)) throw new Error('sseEvent: id não pode conter newline')
  }
  if (opts.retry !== undefined) {
    if (!Number.isFinite(opts.retry) || opts.retry < 0) {
      throw new Error('sseEvent: retry deve ser número >= 0')
    }
  }

  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  const lines: string[] = []
  if (opts.id) lines.push(`id: ${opts.id}`)
  if (opts.retry !== undefined) lines.push(`retry: ${opts.retry}`)
  lines.push(`event: ${name}`)
  // CR sozinho também termina a linha no SSE: sem isso, um texto de usuário criaria outro evento
  for (const part of payload.split(/\r\n|\r|\n/)) {
    lines.push(`data: ${part}`)
  }
  return lines.join('\n') + '\n\n'
}

export interface SseResponseOpts {
  /** Headers extras. Content-Type é fixo em 'text/event-stream'. */
  headers?: Record<string, string>
  /** Abort signal opcional pra cancelar o stream. */
  signal?: AbortSignal
}

/**
 * Cria uma Response SSE a partir de um async generator de frames.
 * Cleanup garantido em erro / cancel.
 */
export function sseResponse(
  generator: () => AsyncGenerator<string> | AsyncIterable<string>,
  opts: SseResponseOpts = {},
): Response {
  const encoder = new TextEncoder()
  const iterator = generator()[Symbol.asyncIterator]()
  // Encerra o gerador, para o `finally` dele rodar quando o cliente sair.
  const stop = () => iterator.return?.().then(() => {}, () => {})

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      opts.signal?.addEventListener('abort', () => {
        void stop()
        try { controller.close() } catch {}
      }, { once: true })
    },
    async pull(controller) {
      try {
        const { done, value } = await iterator.next()
        if (opts.signal?.aborted) return
        if (done) controller.close()
        else controller.enqueue(encoder.encode(value))
      } catch (err) {
        try { controller.error(err) } catch {}
      }
    },
    cancel: () => stop(),
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // desabilita buffering em nginx
      ...opts.headers,
    },
  })
}
