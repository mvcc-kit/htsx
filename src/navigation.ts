/**
 * Navegação fluida sem roteador no cliente: a troca de página continua sendo uma navegação
 * real (scripts, Alpine, voltar do navegador e histórico seguem funcionando), mas o navegador
 * anima a passagem e o HTML do próximo link já chega baixado.
 * Funciona em qualquer HTML, com ou sem `defineApp`. Sem suporte no navegador, a página só
 * abre sem animação.
 */
import { HtmlSafeString, raw } from './jsx-runtime'
import { escapeAttr } from './escape'

/** Transição entre páginas, respeitando quem pediu menos movimento, e o `x-cloak` do Alpine. */
export const navigationCss = '@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}}'
  + '::view-transition-old(root),::view-transition-new(root){animation-duration:.16s}'
  // Com <Outlet>, só o conteúdo anima: o resto da página fica parado.
  + '#htsx-page{view-transition-name:htsx-page}'
  + 'html:has(#htsx-page)::view-transition-old(root),html:has(#htsx-page)::view-transition-new(root){animation:none}'
  + '::view-transition-group(htsx-page),::view-transition-old(htsx-page),::view-transition-new(htsx-page){animation-duration:.16s}'
  + '@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}}'
  + '[x-cloak]{display:none!important}'

/**
 * Com \`hx-boost\` e \`<Outlet>\`, a navegação troca só o conteúdo da página; se a resposta não tiver
 * esse conteúdo ou for um erro, cai para a navegação completa.
 * Baixa antes o HTML do link, ao passar o mouse, focar ou tocar. Fica de fora: outra origem,
 * `target`, `download`, `hx-get`, link com boost sem parcial em arquivo (a resposta seria outra) e `data-no-prefetch`, que todo link GET
 * com efeito colateral (como `/logout`) precisa ter. Respeita economia de dados e rede 2G.
 */
export const navigationJs = `(function(){
var d=document,c=navigator.connection,seen={},timer;
function outlet(){return d.getElementById('htsx-page')}
function partials(){var m=d.querySelector('meta[name="htsx-partials"]');return m&&m.content}
d.addEventListener('htmx:configRequest',function(e){
var x=e.detail,p=partials();
if(!x.boosted||!outlet())return;
x.headers['HX-Target']='htsx-page';
if(p&&x.verb==='get'&&x.elt&&x.elt.tagName==='A'){var u=new URL(x.path,location.href);x.htsxUrl=u.href;x.path=p+u.pathname+u.search}});
d.addEventListener('htmx:beforeSwap',function(e){
var x=e.detail,r=x.requestConfig,o=outlet();
if(!r||!r.boosted||r.verb!=='get'||!o)return;
if(x.isError||x.serverResponse.indexOf('id="htsx-page"')<0){x.shouldSwap=false;location.href=r.htsxUrl||x.pathInfo.responsePath||x.pathInfo.finalRequestPath;return}
x.target=o;x.selectOverride='#htsx-page';x.swapOverride='outerHTML show:window:top transition:true'});
d.addEventListener('htmx:beforeHistoryUpdate',function(e){var r=e.detail.requestConfig;if(r&&r.htsxUrl)e.detail.history.path=r.htsxUrl});
if(c&&(c.saveData||/2g/.test(c.effectiveType||'')))return;
var probe=d.createElement('link');
if(!probe.relList||!probe.relList.supports||!probe.relList.supports('prefetch'))return;
function anchor(e){var t=e.target;return t&&t.closest?t.closest('a[href]'):null}
function fetchLink(a){
if(!a||typeof a.href!=='string'||(a.target&&a.target!=='_self')||a.hasAttribute('download')||a.hasAttribute('hx-get')||a.closest('[data-no-prefetch]'))return;
var u=new URL(a.href);if(u.origin!==location.origin)return;
u.hash='';if(u.href===location.href.split('#')[0])return;
var b=a.closest('[hx-boost]'),href=u.href;
if(b&&b.getAttribute('hx-boost')!=='false'){var p=partials();if(!p)return;href=u.origin+p+u.pathname+u.search}
if(seen[href])return;seen[href]=1;
var l=d.createElement('link');l.rel='prefetch';l.href=href;d.head.appendChild(l)}
d.addEventListener('mouseover',function(e){var a=anchor(e);clearTimeout(timer);if(a)timer=setTimeout(function(){fetchLink(a)},65)},{passive:true});
d.addEventListener('focusin',function(e){fetchLink(anchor(e))},{passive:true});
d.addEventListener('touchstart',function(e){fetchLink(anchor(e))},{passive:true});
})();`

/** Arquivos servidos em `VENDOR_PATH`, para CSP sem `unsafe-inline`. */
export const NAVIGATION_FILES = {
  'htsx-nav.css': navigationCss,
  'htsx-nav.js': navigationJs,
} as const

export interface NavigationOpts {
  /** Pasta que serve `NAVIGATION_FILES` (ex.: `VENDOR_PATH`). Sem ela, o CSS e o JS saem embutidos na página. */
  base?: string
  /** Nonce da CSP, para os `<style>` e `<script>` da página. */
  nonce?: string
  /** A página usa htmx: as trocas dele ganham a mesma transição. */
  htmx?: boolean
}

export function navigationTags(opts: NavigationOpts = {}): string {
  const nonce = opts.nonce ? ` nonce="${escapeAttr(opts.nonce)}"` : ''
  const config = opts.htmx ? `<meta name="htmx-config" content='{"globalViewTransitions":true}'>` : ''
  if (opts.base === undefined) {
    return `${config}<style${nonce}>${navigationCss}</style><script${nonce}>${navigationJs}</script>`
  }
  const base = escapeAttr(opts.base)
  return `${config}<link rel="stylesheet" href="${base}htsx-nav.css"><script defer src="${base}htsx-nav.js"${nonce}></script>`
}

/** Para o `<head>` em JSX: `<Navigation base={VENDOR_PATH} />`. */
export function Navigation(props: NavigationOpts = {}): HtmlSafeString {
  return raw(navigationTags(props))
}
