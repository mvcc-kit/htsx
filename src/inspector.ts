/**
 * Inspetor de estado para desenvolvimento: expõe `window.__htsx`.
 * - `__htsx.inspect()` → `{ url, stores, data }` em JSON: cada `Alpine.store` e cada `x-data`
 *   (chave `#id`, `testid:<data-testid>` ou `x-data:<índice>`).
 * - `__htsx.set(caminho, valor)` → altera um campo no mesmo formato do `inspect()`:
 *   `stores.form.sent` ou `data.#menu.open`.
 *
 * Só em desenvolvimento. Coloque no `<head>`, antes de qualquer `storeInit()`, para ver todos os stores.
 */
import { escapeAttr } from './escape'

const CODE = `(()=>{const names=new Set();document.addEventListener('alpine:init',()=>{const o=Alpine.store;Alpine.store=function(n,v){if(arguments.length>1)names.add(n);return o.apply(this,arguments)}});const plain=v=>JSON.parse(JSON.stringify(v===undefined?null:v));const key=(el,i)=>el.id?'#'+el.id:el.dataset.testid?'testid:'+el.dataset.testid:'x-data:'+i;const els=()=>[...document.querySelectorAll('[x-data]')];window.__htsx={inspect(){const stores={},data={};for(const n of names)stores[n]=plain(Alpine.store(n));els().forEach((el,i)=>{data[key(el,i)]=plain(Alpine.$data(el))});return{url:location.pathname+location.search+location.hash,stores,data}},set(path,value){const[kind,k,...rest]=path.split('.');let obj=null;if(kind==='stores'&&names.has(k))obj=Alpine.store(k);if(kind==='data'){const el=els().find((e,i)=>key(e,i)===k);if(el)obj=Alpine.$data(el)}if(!obj||!rest.length)throw new Error('htsx: caminho '+JSON.stringify(path)+' não existe; use stores.<nome>.<campo> ou data.<chave>.<campo>, como em __htsx.inspect()');const last=rest.pop();for(const p of rest)obj=obj[p];obj[last]=value;return value}}})()`

export function inspector(opts: { nonce?: string } = {}): string {
  const nonce = opts.nonce ? ` nonce="${escapeAttr(opts.nonce)}"` : ''
  return `<script${nonce}>${CODE}</script>`
}
