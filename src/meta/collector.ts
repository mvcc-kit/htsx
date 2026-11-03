// Junta as tags de uma renderização. Fica fora do jsx-runtime: quem não usa /meta não paga por isso.
import { AsyncLocalStorage as ALS } from 'node:async_hooks'
import { strictFail } from '../strict'
import { applyMeta, metaMarker, resolveMarkers } from './logic'

export interface PendingTag {
  key: string | null
  html: Promise<string>
}

const storage = new ALS<PendingTag[]>()

/** Guarda a tag para o <head> e devolve a marca do lugar dela. `null`: não há renderização completa em andamento. */
export function collect(tag: PendingTag): string | null {
  const tags = storage.getStore()
  if (!tags) return null
  return metaMarker(tags.push(tag) - 1)
}

/** Roda a renderização e leva ao <head> as tags pedidas em qualquer ponto dela. */
export function withMeta(render: () => Promise<string>): Promise<string> {
  const tags: PendingTag[] = []
  return storage.run(tags, async () => {
    const html = await render()
    if (tags.length === 0) return html
    const resolved = await Promise.all(tags.map(async tag => ({ key: tag.key, html: await tag.html })))
    const marked = resolveMarkers(html, resolved)
    const applied = applyMeta(marked.html, marked.tags)
    if (applied.dropped.length > 0) {
      strictFail(`a página tem <html> sem <head>; ${applied.dropped.length} tag(s) de /meta ficaram de fora. Escreva <head></head>`)
    }
    return applied.html
  })
}
