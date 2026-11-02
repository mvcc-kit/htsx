import { describe, expect, it } from 'bun:test'
import { cache, cacheContext, cacheSize } from '../src/cache'
import { withContext } from '../index'

describe('cache: dedup dentro da request', () => {
  it('mesma chamada retorna do cache (2ª call não invoca fn)', async () => {
    let calls = 0
    const getUser = cache(async (id: string) => {
      calls++
      return { id, name: `user-${id}` }
    })
    await withContext(cacheContext(), async () => {
      const a = await getUser('1')
      const b = await getUser('1')
      const c = await getUser('1')
      expect(calls).toBe(1)
      expect(a).toEqual({ id: '1', name: 'user-1' })
      expect(b).toEqual(a)
      expect(c).toEqual(a)
    })
  })

  it('args diferentes geram entries diferentes', async () => {
    let calls = 0
    const fn = cache(async (id: string) => { calls++; return id })
    await withContext(cacheContext(), async () => {
      await fn('a')
      await fn('b')
      await fn('a')
      expect(calls).toBe(2)
    })
  })

  it('fns diferentes não colidem mesmo com args iguais', async () => {
    let aCalls = 0, bCalls = 0
    const fnA = cache(async (x: number) => { aCalls++; return `A${x}` })
    const fnB = cache(async (x: number) => { bCalls++; return `B${x}` })
    await withContext(cacheContext(), async () => {
      expect(await fnA(1)).toBe('A1')
      expect(await fnB(1)).toBe('B1')
      expect(aCalls).toBe(1)
      expect(bCalls).toBe(1)
    })
  })

  it('cacheSize reflete entries', async () => {
    const fn = cache(async (x: number) => x)
    await withContext(cacheContext(), async () => {
      expect(cacheSize()).toBe(0)
      await fn(1)
      expect(cacheSize()).toBe(1)
      await fn(2)
      expect(cacheSize()).toBe(2)
      await fn(1) // hit
      expect(cacheSize()).toBe(2)
    })
  })
})

describe('cache: isolamento entre requests', () => {
  it('request A não vê cache da request B', async () => {
    let calls = 0
    const fn = cache(async (k: string) => { calls++; return k })

    await Promise.all([
      withContext(cacheContext(), async () => {
        await fn('x')
        await fn('x')
      }),
      withContext(cacheContext(), async () => {
        await fn('x')
        await fn('x')
      }),
    ])
    // 2 requests × 1 call cada = 2 chamadas reais
    expect(calls).toBe(2)
  })

  it('sem context: executa todas as vezes (fallback transparente)', async () => {
    let calls = 0
    const fn = cache(async (x: number) => { calls++; return x })
    await fn(1)
    await fn(1)
    await fn(1)
    expect(calls).toBe(3)
  })
})

describe('cache: limites e segurança', () => {
  it('maxSize excedido throw', async () => {
    const fn = cache(async (x: number) => x)
    await expect(
      withContext(cacheContext(3), async () => {
        await fn(1)
        await fn(2)
        await fn(3)
        await fn(4) // estoura
      }),
    ).rejects.toThrow(/limite/)
  })

  it('maxSize < 1 → throw na criação do context', () => {
    expect(() => cacheContext(0)).toThrow()
    expect(() => cacheContext(-1)).toThrow()
  })

  it('throw na função NÃO cacheia (próxima call retenta)', async () => {
    let calls = 0
    const fn = cache(async (x: number) => {
      calls++
      if (calls < 3) throw new Error('fail')
      return x
    })
    await withContext(cacheContext(), async () => {
      await expect(fn(1)).rejects.toThrow('fail')
      await expect(fn(1)).rejects.toThrow('fail')
      const r = await fn(1)
      expect(r).toBe(1)
      expect(calls).toBe(3)
    })
  })
})

describe('cache: custom key', () => {
  it('opts.key permite args não-serializáveis', async () => {
    let calls = 0
    const fn = cache(
      async (obj: { user: { id: number; hidden: () => string } }) => {
        calls++
        return obj.user.id
      },
      { key: (obj) => `u:${obj.user.id}` },
    )
    await withContext(cacheContext(), async () => {
      await fn({ user: { id: 1, hidden: () => 'x' } })
      await fn({ user: { id: 1, hidden: () => 'y' } }) // diff fn ref, mesmo id
      expect(calls).toBe(1)
    })
  })
})

describe('cache: tipos / sync', () => {
  it('função sync funciona (envolvida em Promise)', async () => {
    const fn = cache((x: number) => x * 2)
    await withContext(cacheContext(), async () => {
      expect(await fn(3)).toBe(6)
      expect(await fn(3)).toBe(6)
    })
  })

  it('retorno preserva tipo (smoke)', async () => {
    const fn = cache(async (id: string) => ({ id, ok: true }))
    await withContext(cacheContext(), async () => {
      const r = await fn('x')
      expect(r.ok).toBe(true)
      expect(r.id).toBe('x')
    })
  })

  it('cacheSize retorna null fora de context', () => {
    expect(cacheSize()).toBeNull()
  })
})
