// Onde o conteúdo da página fica dentro do layout. Sem dependências: vai para o Worker.
export const OUTLET_ID = 'htsx-page'

/** Pedido de navegação que só quer o conteúdo: link com hx-boost numa página que tem <Outlet>. */
export function wantsOutlet(headers: Headers): boolean {
  return headers.get('hx-boosted') === 'true'
    && headers.get('hx-target') === OUTLET_ID
    && headers.get('hx-history-restore-request') !== 'true'
}
