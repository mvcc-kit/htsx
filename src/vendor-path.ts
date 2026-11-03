// Caminho público de Alpine e htmx com a versão no nome: muda quando os pinos mudam,
// então pode ter cache `immutable` (como o `_app/immutable/` do SvelteKit).
import pins from '../vendor/pins.json'

// sha256 de `navigationCss + navigationJs`: sem importar os textos, que não precisam ir para o Worker.
// Conferido em __tests__/navigation.test.tsx; se mudar, o caminho muda e o cache immutable não fica velho.
export const NAVIGATION_SHA256 = '359942fc469570555aaa0aacc9d00e9fd5b01c7af60dc75279ae48a7e42c85a5'

function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** Ex.: `/_htsx/vendor/1a2b3c4d/`. Use com `head({ vendor: VENDOR_PATH })` nos dois adaptadores. */
export const VENDOR_PATH = `/_htsx/vendor/${fnv1a(Object.values(pins).map(p => p.sha256).join('') + NAVIGATION_SHA256)}/`
