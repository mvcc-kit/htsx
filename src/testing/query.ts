// Consultas ao HTML do servidor com HTMLRewriter (nativo no Bun e nos Workers).
// Rápido, sem navegador: serve para testes de rota.

export interface Found {
  tag: string
  attrs: Record<string, string>
  /** Texto do elemento e dos descendentes, entidades decodificadas e espaços colapsados. */
  text: string
}

export interface Page {
  /** Todos os elementos que casam com o seletor CSS, em ordem. */
  find(selector: string): Promise<Found[]>
  /** Texto do primeiro elemento que casa, ou `null`. */
  text(selector: string): Promise<string | null>
  /** Valor do atributo no primeiro elemento que casa, ou `null`. */
  attr(selector: string, name: string): Promise<string | null>
  /** Primeiro elemento com `data-testid` igual a `id`, ou `null`. */
  byTestId(id: string): Promise<Found | null>
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Abre o HTML (string ou `Response`) para consultas. */
export async function page(source: string | Response): Promise<Page> {
  const html = typeof source === 'string' ? source : await source.text()

  async function find(selector: string): Promise<Found[]> {
    const found: Array<Found & { raw: string }> = []
    const open: Array<Found & { raw: string }> = []
    await new HTMLRewriter()
      .on(selector, {
        element(el) {
          const item = { tag: el.tagName, attrs: Object.fromEntries(el.attributes) as Record<string, string>, text: '', raw: '' }
          found.push(item)
          if (!el.canHaveContent || el.selfClosing) return
          open.push(item)
          el.onEndTag(() => { open.splice(open.indexOf(item), 1) })
        },
      })
      .on('*', { text(t) { for (const item of open) item.raw += t.text } })
      .transform(new Response(html))
      .text()
    return found.map(({ raw, ...item }) => ({
      ...item,
      attrs: Object.fromEntries(Object.entries(item.attrs).map(([k, v]) => [k, decode(v)])),
      text: decode(raw).replace(/\s+/g, ' ').trim(),
    }))
  }

  const first = async (selector: string) => (await find(selector))[0] ?? null

  return {
    find,
    text: async selector => (await first(selector))?.text ?? null,
    attr: async (selector, name) => (await first(selector))?.attrs[name] ?? null,
    byTestId: id => first(`[data-testid="${id.replace(/["\\]/g, '\\$&')}"]`),
  }
}
