// Onde o conteúdo da página fica dentro do layout. Vai para o Worker.
import { maybeContext } from './context'

export const OUTLET_ID = 'htsx-page'

/** Em site estático o host ignora os cabeçalhos do htmx: os parciais viram arquivos nesta pasta. */
export const PARTIALS_PATH = '/_htsx/partial'

/** Durante o build, a página avisa ao navegador onde estão os parciais. */
export function isPrerendering(): boolean {
  const event = maybeContext<Record<symbol, { prerendering?: boolean } | undefined>>()?.[Symbol.for('htsx.request_event')]
  return event?.prerendering === true
}

/** Pedido de navegação que só quer o conteúdo: link com hx-boost numa página que tem <Outlet>. */
export function wantsOutlet(headers: Headers): boolean {
  return headers.get('hx-boosted') === 'true'
    && headers.get('hx-target') === OUTLET_ID
    && headers.get('hx-history-restore-request') !== 'true'
}
