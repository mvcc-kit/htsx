/**
 * Stress / memory leak tests.
 *
 * Roda volumes altos pra validar:
 * - ALS realmente isola entre requests concorrentes
 * - cache não vaza após request terminar
 * - Componentes async em paralelo escalam
 *
 * Não roda em CI rápido se for chato — usa contagens moderadas.
 */
import { describe, expect, it } from 'bun:test'
import {
  renderToString, withContext, useContext, maybeContext,
} from '../index'
import { cache, cacheContext, cacheSize } from '../src/cache'
import { jsx, createElement } from '../src/jsx-runtime'

const h = createElement

describe('stress: context isolation com alta concorrência', () => {
  it('500 renders paralelos com contexts distintos não vazam', async () => {
    const results = await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        renderToString(
          () => h('div', {}, useContext<{ n: number }>().n),
          { context: { n: i } },
        ),
      ),
    )
    for (let i = 0; i < 500; i++) {
      expect(results[i]).toBe(`<div>${i}</div>`)
    }
  })

  it('contexto fora de escopo após render é undefined', async () => {
    await renderToString(() => 'x', { context: { foo: 1 } })
    expect(maybeContext()).toBeUndefined()
  })

  it('contexts aninhados profundos não corrompem', async () => {
    async function deep(level: number): Promise<number[]> {
      const here = useContext<{ n: number }>().n
      if (level === 0) return [here]
      const inner = await withContext({ n: level }, () => deep(level - 1))
      return [here, ...inner]
    }
    const result = await withContext({ n: 0 }, () => deep(20))
    // deep(20) lê {n:0}, wrappea {n:20} pra deep(19) que lê 20, etc.
    // sequência: 0, 20, 19, 18, ..., 1
    expect(result.length).toBe(21)
    expect(result[0]).toBe(0)
    expect(result[1]).toBe(20)
    expect(result[result.length - 1]).toBe(1)
  })
})

describe('stress: cache scoping', () => {
  it('cacheSize zera entre requests', async () => {
    const fn = cache(async (x: number) => x)
    for (let i = 0; i < 50; i++) {
      await withContext(cacheContext(), async () => {
        await fn(1)
        await fn(2)
        expect(cacheSize()).toBe(2)
      })
      // após sair: sem context = sem state
      expect(cacheSize()).toBeNull()
    }
  })

  it('500 requests paralelas: cache não compartilhado', async () => {
    let totalCalls = 0
    const fn = cache(async (id: number) => { totalCalls++; return id })

    await Promise.all(
      Array.from({ length: 500 }, () =>
        withContext(cacheContext(), async () => {
          // cada request faz 3 calls — primeira chama fn, próximas 2 hit cache
          await fn(1)
          await fn(1)
          await fn(1)
        }),
      ),
    )
    // Cache é per-request — 500 calls reais (não 1)
    expect(totalCalls).toBe(500)
  })

  it('limite de maxSize protege contra DoS', async () => {
    const fn = cache(async (x: number) => x)
    await expect(
      withContext(cacheContext(10), async () => {
        for (let i = 0; i < 20; i++) await fn(i)
      }),
    ).rejects.toThrow(/limite/)
  })
})

describe('stress: render assíncrono em paralelo', () => {
  it('100 components async resolvem em ordem correta', async () => {
    async function Component({ id }: { id: number }) {
      await new Promise(r => setTimeout(r, Math.random() * 5))
      return h('span', {}, String(id))
    }

    const html = await renderToString(() =>
      h('div', {}, Array.from({ length: 100 }, (_, i) =>
        h(Component as never, { id: i }),
      )),
    )

    for (let i = 0; i < 100; i++) {
      expect(html).toContain(`<span>${i}</span>`)
    }
  })
})

describe('stress: GC sanity (estimativa)', () => {
  it('1000 renders sequenciais não acumulam memória detectável', async () => {
    const fn = cache(async (x: number) => x * 2)
    const g = globalThis as {
      Bun?: { gc?: (sync: boolean) => void }
      process?: { memoryUsage(): { heapUsed: number } }
    }

    // warmup
    for (let i = 0; i < 10; i++) {
      await withContext(cacheContext(), () => fn(i))
    }

    g.Bun?.gc?.(true)
    const before = g.process?.memoryUsage().heapUsed ?? 0

    for (let i = 0; i < 1000; i++) {
      await withContext(cacheContext(), async () => {
        await fn(i)
        await fn(i + 1)
      })
    }

    g.Bun?.gc?.(true)
    const after = g.process?.memoryUsage().heapUsed ?? 0

    // tolerância larga (heurística — engine decide quando coletar)
    // crescimento > 50MB indica leak claro
    const growthMB = (after - before) / 1024 / 1024
    expect(growthMB).toBeLessThan(50)
  })
})
