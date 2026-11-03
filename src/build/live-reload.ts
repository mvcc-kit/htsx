// Recarrega o navegador no `dev` quando um arquivo muda. Nunca entra em produção.
export const LIVE_RELOAD_PATH = '/_htsx/dev'

// Conexão que cai e volta também recarrega: é o servidor reiniciando com código novo.
const SCRIPT = `<script>(function(){var lost,es=new EventSource(${JSON.stringify(LIVE_RELOAD_PATH)});es.onerror=function(){lost=1};es.onopen=function(){if(lost)location.reload()};es.addEventListener('reload',function(){location.reload()})})()</script>`

export function injectLiveReload(html: string): string {
  const end = html.lastIndexOf('</body>')
  return end < 0 ? html + SCRIPT : html.slice(0, end) + SCRIPT + html.slice(end)
}

export interface LiveReload {
  response(): Response
  /** Avisa os navegadores, juntando mudanças seguidas num aviso só. */
  notify(): void
  close(): void
}

export function createLiveReload(delayMs = 50): LiveReload {
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    response() {
      let self: ReadableStreamDefaultController<Uint8Array>
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          self = controller
          clients.add(controller)
          controller.enqueue(encoder.encode(': conectado\n\n'))
        },
        cancel() { clients.delete(self) },
      })
      return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
    },
    notify() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const client of clients) {
          try { client.enqueue(encoder.encode('event: reload\ndata: 1\n\n')) } catch { clients.delete(client) }
        }
      }, delayMs)
    },
    close() {
      clearTimeout(timer)
      for (const client of clients) { try { client.close() } catch { /* já fechado */ } }
      clients.clear()
    },
  }
}
