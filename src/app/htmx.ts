// `event.htmx`: o que o htmx mandou no pedido e o que a resposta manda ele fazer.
import { HX_HEADERS } from '../htmx-headers'
import { triggerHeader } from '../htmx-headers'
import { safeUrl } from '../safe-url'

export interface HtmxContext {
  /** O pedido veio do htmx. */
  readonly request: boolean
  /** Veio de link ou formulário com `hx-boost`. */
  readonly boosted: boolean
  /** Restauração do histórico (voltar sem cópia guardada). */
  readonly historyRestore: boolean
  /** `id` do elemento que vai receber a resposta. */
  readonly target: string | null
  /** `id` do elemento que disparou o pedido. */
  readonly triggeredBy: string | null
  readonly currentUrl: string | null
  /** Dispara um evento no navegador depois da resposta. Pode chamar várias vezes. */
  trigger(name: string, detail?: unknown): void
  /** Troca o alvo da resposta (seletor CSS). */
  retarget(selector: string): void
  reswap(swap: string): void
  reselect(selector: string): void
  pushUrl(url: string | false): void
  replaceUrl(url: string | false): void
  /** Navega sem recarregar a página. */
  location(url: string): void
  /** Navega recarregando a página. */
  redirect(url: string): void
  refresh(): void
}

export function createHtmxContext(request: Headers, response: Headers): HtmxContext {
  const events: Record<string, unknown> = {}
  const set = (name: string) => (value: string | false) => { response.set(name, String(value)) }
  // o htmx faz location.href = valor, então `javascript:` executaria na página
  const navigate = (name: string) => (url: string) => {
    if (safeUrl(url) !== url) throw new Error('htsx: event.htmx recusou uma URL com esquema perigoso')
    response.set(name, url)
  }
  return {
    request: request.get('hx-request') === 'true',
    boosted: request.get('hx-boosted') === 'true',
    historyRestore: request.get('hx-history-restore-request') === 'true',
    target: request.get('hx-target'),
    triggeredBy: request.get('hx-trigger'),
    currentUrl: request.get('hx-current-url'),
    trigger(name, detail = null) {
      events[name] = detail
      response.set(HX_HEADERS.Trigger, triggerHeader(events))
    },
    retarget: set(HX_HEADERS.Retarget),
    reswap: set(HX_HEADERS.Reswap),
    reselect: set(HX_HEADERS.Reselect),
    pushUrl: set(HX_HEADERS.PushUrl),
    replaceUrl: set(HX_HEADERS.ReplaceUrl),
    location: navigate(HX_HEADERS.Location),
    redirect: navigate(HX_HEADERS.Redirect),
    refresh() { response.set(HX_HEADERS.Refresh, 'true') },
  }
}
