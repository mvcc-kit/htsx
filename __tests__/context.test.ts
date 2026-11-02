import { describe, expect, it } from 'bun:test'
import { withContext, useContext, maybeContext, renderPage, renderToString } from '../index'
import { jsx, createElement } from '../src/jsx-runtime'

const h = createElement

describe('context: useContext', () => {
  it('throw quando chamado fora de withContext', () => {
    expect(() => useContext()).toThrow(/fora de withContext/)
  })

  it('retorna context dentro de withContext', async () => {
    const result = await withContext({ user: 'ana' }, () => {
      return useContext<{ user: string }>()
    })
    expect(result).toEqual({ user: 'ana' })
  })

  it('preserva context em chain async profunda', async () => {
    const result = await withContext({ value: 42 }, async () => {
      await Promise.resolve()
      await new Promise(r => setTimeout(r, 1))
      return useContext<{ value: number }>().value
    })
    expect(result).toBe(42)
  })

  it('context tipado preservado em componente JSX profundo', async () => {
    function Deep() {
      const { name } = useContext<{ name: string }>()
      return h('span', {}, name)
    }
    function Mid() { return h('div', {}, h(Deep, {})) }
    function Root() { return h('section', {}, h(Mid, {})) }

    const html = await renderToString(() => h(Root, {}), { context: { name: 'X' } })
    expect(html).toBe('<section><div><span>X</span></div></section>')
  })
})

describe('context: withContext isolation', () => {
  it('renderPage paralelo NÃO vaza context entre branches', async () => {
    const [a, b] = await Promise.all([
      renderToString(() => h('div', {}, useContext<{ x: string }>().x), { context: { x: 'A' } }),
      renderToString(() => h('div', {}, useContext<{ x: string }>().x), { context: { x: 'B' } }),
    ])
    expect(a).toBe('<div>A</div>')
    expect(b).toBe('<div>B</div>')
  })

  it('context aninhado: inner sobrescreve outer', async () => {
    const result = await withContext({ value: 'outer' }, async () => {
      return withContext({ value: 'inner' }, () => {
        return useContext<{ value: string }>().value
      })
    })
    expect(result).toBe('inner')
  })

  it('após inner terminar, outer volta a valer', async () => {
    const trace: string[] = []
    await withContext({ value: 'outer' }, async () => {
      trace.push(useContext<{ value: string }>().value)
      await withContext({ value: 'inner' }, () => {
        trace.push(useContext<{ value: string }>().value)
      })
      trace.push(useContext<{ value: string }>().value)
    })
    expect(trace).toEqual(['outer', 'inner', 'outer'])
  })

  it('context object é a mesma referência (não congelado)', async () => {
    const original = { count: 0 }
    await withContext(original, () => {
      const ctx = useContext<{ count: number }>()
      expect(ctx).toBe(original)
    })
  })
})

describe('context: maybeContext', () => {
  it('retorna undefined fora de escopo (não throw)', () => {
    expect(maybeContext()).toBeUndefined()
  })

  it('retorna context quando presente', async () => {
    await withContext({ ok: true }, () => {
      expect(maybeContext<{ ok: boolean }>()).toEqual({ ok: true })
    })
  })
})

describe('context: edge cases', () => {
  it('context = null é válido (uso explícito)', async () => {
    const result = await withContext(null, () => useContext())
    expect(result).toBeNull()
  })

  it('context = 0 (primitivo) é válido', async () => {
    const result = await withContext(0, () => useContext<number>())
    expect(result).toBe(0)
  })

  it('factory async retorna corretamente', async () => {
    const result = await withContext({ x: 1 }, async () => {
      await Promise.resolve()
      return 'done'
    })
    expect(result).toBe('done')
  })

  it('factory sync retorna corretamente', async () => {
    const result = await withContext({ x: 1 }, () => 'sync-done')
    expect(result).toBe('sync-done')
  })

  it('exception dentro de withContext propaga', async () => {
    await expect(
      withContext({ x: 1 }, async () => { throw new Error('boom') })
    ).rejects.toThrow('boom')
  })

  it('renderPage sem context não polui escopo global', async () => {
    await renderPage(() => h('div', {}, 'no ctx'))
    expect(maybeContext()).toBeUndefined()
  })

  it('renderPage com context tipado funciona', async () => {
    interface Ctx { user: string; locale: string }
    const html = await renderPage<Ctx>(
      () => {
        const { user, locale } = useContext<Ctx>()
        return h('html', {}, h('body', {}, `${user}-${locale}`))
      },
      { context: { user: 'ana', locale: 'pt-BR' } },
    )
    expect(html).toBe('<!DOCTYPE html><html><body>ana-pt-BR</body></html>')
  })
})
