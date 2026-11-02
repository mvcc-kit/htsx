import { describe, expect, it } from 'bun:test'
import { Suspense, suspenseRegistry, resolveSuspense } from '../src/suspense'
import { renderToString, withContext } from '../index'
import { jsx } from '../src/jsx-runtime'

const h = jsx

describe('Suspense: registry setup', () => {
  it('throw quando renderizado sem registry no context', async () => {
    await expect(
      renderToString(() =>
        Suspense({ fallback: 'wait', children: Promise.resolve('done') }),
      ),
    ).rejects.toThrow(/registry/)
  })

  it('funciona quando registry está no context', async () => {
    const html = await renderToString(
      () => Suspense({
        fallback: h('div', {}, 'loading'),
        children: Promise.resolve(h('span', {}, 'done')),
        id: 'abc123',
      }),
      { context: suspenseRegistry() },
    )
    expect(html).toContain('hx-get="/_htsx/suspense/abc123"')
    expect(html).toContain('hx-trigger="load"')
    expect(html).toContain('<div>loading</div>')
    expect(html).toContain('id="susp-abc123"')
  })

  it('prefix customizável', async () => {
    const html = await renderToString(
      () => Suspense({ fallback: 'l', children: 'd', id: 'x1' }),
      { context: suspenseRegistry('/custom/path') },
    )
    expect(html).toContain('hx-get="/custom/path/x1"')
  })
})

describe('Suspense: resolveSuspense', () => {
  it('retorna HTML real quando id existe', async () => {
    const ctx = suspenseRegistry()
    await withContext(ctx, async () => {
      // emite Suspense (registra promise)
      await renderToString(() =>
        Suspense({ fallback: 'wait', children: Promise.resolve('REAL'), id: 'r1' }),
      )
      // resolve
      const html = await resolveSuspense('r1')
      expect(html).toBe('REAL')
    })
  })

  it('retorna null quando id desconhecido', async () => {
    await withContext(suspenseRegistry(), async () => {
      const html = await resolveSuspense('inexistente')
      expect(html).toBeNull()
    })
  })

  it('remove id após resolver (uso único)', async () => {
    await withContext(suspenseRegistry(), async () => {
      await renderToString(() =>
        Suspense({ fallback: 'w', children: 'X', id: 'once' }),
      )
      const a = await resolveSuspense('once')
      const b = await resolveSuspense('once')
      expect(a).toBe('X')
      expect(b).toBeNull()
    })
  })

  it('retorna null pra id com chars inválidos (sem throw)', async () => {
    await withContext(suspenseRegistry(), async () => {
      expect(await resolveSuspense('../etc')).toBeNull()
      expect(await resolveSuspense('a b')).toBeNull()
      expect(await resolveSuspense('')).toBeNull()
    })
  })

  it('retorna null se children rejeita', async () => {
    await withContext(suspenseRegistry(), async () => {
      await renderToString(() =>
        Suspense({
          fallback: 'w',
          children: Promise.reject(new Error('failed')),
          id: 'fail1',
        }),
      )
      const html = await resolveSuspense('fail1')
      expect(html).toBeNull()
    })
  })

  it('retorna null fora de context', async () => {
    const html = await resolveSuspense('anything')
    expect(html).toBeNull()
  })
})

describe('Suspense: validação de id (segurança)', () => {
  it('throw com id contendo espaços', async () => {
    await expect(
      renderToString(
        () => Suspense({ fallback: 'w', children: 'd', id: 'bad id' }),
        { context: suspenseRegistry() },
      ),
    ).rejects.toThrow(/inválido/)
  })

  it('throw com id contendo path traversal', async () => {
    await expect(
      renderToString(
        () => Suspense({ fallback: 'w', children: 'd', id: '../etc' }),
        { context: suspenseRegistry() },
      ),
    ).rejects.toThrow(/inválido/)
  })

  it('throw com id começando por número', async () => {
    await expect(
      renderToString(
        () => Suspense({ fallback: 'w', children: 'd', id: '1abc' }),
        { context: suspenseRegistry() },
      ),
    ).rejects.toThrow(/inválido/)
  })

  it('throw com id duplicado no mesmo registry', async () => {
    await expect(
      withContext(suspenseRegistry(), async () => {
        await renderToString(() =>
          Suspense({ fallback: 'w', children: 'd', id: 'dup' }),
        )
        await renderToString(() =>
          Suspense({ fallback: 'w', children: 'd', id: 'dup' }),
        )
      }),
    ).rejects.toThrow(/duplicado/)
  })

  it('id auto-gen é válido', async () => {
    await withContext(suspenseRegistry(), async () => {
      const html = await renderToString(() =>
        Suspense({ fallback: 'w', children: 'd' }),
      )
      const match = html.match(/hx-get="\/_htsx\/suspense\/([^"]+)"/)
      expect(match).toBeTruthy()
      expect(match![1]).toMatch(/^[a-zA-Z][\w-]*$/)
    })
  })
})

describe('Suspense: timeout', () => {
  it('timeout rejeita a promise', async () => {
    await withContext(suspenseRegistry('/x', 50), async () => {
      await renderToString(() =>
        Suspense({
          fallback: 'w',
          children: new Promise(() => { /* nunca resolve */ }),
          id: 'slow1',
        }),
      )
      const html = await resolveSuspense('slow1')
      expect(html).toBeNull()
    })
  })

  it('timeout custom por Suspense vence o default', async () => {
    await withContext(suspenseRegistry('/x', 5000), async () => {
      await renderToString(() =>
        Suspense({
          fallback: 'w',
          children: new Promise(() => { /* never */ }),
          id: 'slow2',
          timeout: 20,
        }),
      )
      const start = Date.now()
      const html = await resolveSuspense('slow2')
      const elapsed = Date.now() - start
      expect(html).toBeNull()
      expect(elapsed).toBeLessThan(100)
    })
  })

  it('promise resolve antes do timeout', async () => {
    await withContext(suspenseRegistry('/x', 1000), async () => {
      await renderToString(() =>
        Suspense({
          fallback: 'w',
          children: new Promise(r => setTimeout(() => r('FAST'), 5)),
          id: 'fast1',
        }),
      )
      const html = await resolveSuspense('fast1')
      expect(html).toBe('FAST')
    })
  })
})

describe('Suspense: isolamento entre requests', () => {
  it('Suspense de request A não vaza pra request B', async () => {
    const [a, b] = await Promise.all([
      withContext(suspenseRegistry(), async () => {
        await renderToString(() =>
          Suspense({ fallback: 'w', children: 'fromA', id: 'shared' }),
        )
        return resolveSuspense('shared')
      }),
      withContext(suspenseRegistry(), async () => {
        await renderToString(() =>
          Suspense({ fallback: 'w', children: 'fromB', id: 'shared' }),
        )
        return resolveSuspense('shared')
      }),
    ])
    expect(a).toBe('fromA')
    expect(b).toBe('fromB')
  })

  it('múltiplos Suspense paralelos no mesmo registry resolvem independentemente', async () => {
    await withContext(suspenseRegistry(), async () => {
      await renderToString(() =>
        h('div', {}, [
          Suspense({ fallback: 'w1', children: Promise.resolve('A'), id: 'x1' }),
          Suspense({ fallback: 'w2', children: Promise.resolve('B'), id: 'x2' }),
          Suspense({ fallback: 'w3', children: Promise.resolve('C'), id: 'x3' }),
        ]),
      )
      const [a, b, c] = await Promise.all([
        resolveSuspense('x1'),
        resolveSuspense('x2'),
        resolveSuspense('x3'),
      ])
      expect(a).toBe('A')
      expect(b).toBe('B')
      expect(c).toBe('C')
    })
  })
})

describe('Suspense: edge cases', () => {
  it('children resolve com JSX renderiza corretamente', async () => {
    await withContext(suspenseRegistry(), async () => {
      await renderToString(() =>
        Suspense({
          fallback: 'w',
          children: Promise.resolve(h('span', { class: 'x' }, 'real')),
          id: 'jsx1',
        }),
      )
      const html = await resolveSuspense('jsx1')
      expect(html).toBe('<span class="x">real</span>')
    })
  })

  it('fallback JSX renderizado no placeholder', async () => {
    const html = await renderToString(
      () => Suspense({
        fallback: h('div', { class: 'spinner' }, '...'),
        children: 'real',
        id: 'fb1',
      }),
      { context: suspenseRegistry() },
    )
    expect(html).toContain('<div class="spinner">...</div>')
  })
})
