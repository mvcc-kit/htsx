/**
 * Type-level tests.
 *
 * Estratégia: cada `@ts-expect-error` marca um cenário onde a tipagem
 * DEVE rejeitar. Todo o código fica em `if (false)` (dead branch) — TS
 * confere os tipos mas runtime não executa.
 *
 * Validação real acontece via `bun typecheck` (tsc --noEmit). Se algum
 * @ts-expect-error parar de receber erro, o TS reclama de unused directive.
 *
 * O `it()` aqui só garante que o arquivo aparece na contagem.
 */
import { describe, it, expect } from 'bun:test'
import { defineEvents } from '../src/events'
import { useContext, maybeContext, withContext } from '../src/context'
import { cache } from '../src/cache'
import type { Slots, SlotComponentProps } from '../src/slots'
import { csrf } from '../src/csrf'

// Helpers — silence "unused" sem alterar comportamento
function _unused(_: unknown): void { /* type-only */ }
const NEVER: boolean = false as boolean

describe('types: defineEvents', () => {
  it('emit() valida nomes e args em tempo de compilação', () => {
    if (NEVER) {
      const events = defineEvents({
        'todo:created': (todo: { id: string; title: string }) => todo,
        'cart:updated': (count: number) => ({ count }),
        'plain':        () => null,
      })

      // ✅ válido
      events.emit('todo:created', { id: 'a', title: 'T' })
      events.emit('cart:updated', 5)
      events.emit('plain')

      // @ts-expect-error — nome não registrado
      events.emit('unknown:event')

      // @ts-expect-error — todo deve ser objeto
      events.emit('todo:created', 'wrong')

      // @ts-expect-error — count deve ser number
      events.emit('cart:updated', 'string-not-number')

      // @ts-expect-error — args extras
      events.emit('plain', 'extra')
    }
    expect(true).toBe(true)
  })

  it('names é typed array', () => {
    const events = defineEvents({ a: () => 0, b: () => 0 })
    if (NEVER) {
      const names: Array<'a' | 'b'> = events.names
      _unused(names)
    }
    expect(events.names.length).toBe(2)
  })
})

describe('types: useContext', () => {
  it('aceita generic e retorna tipo correto', () => {
    if (NEVER) {
      interface AppCtx { user: { id: string }; locale: string }
      async function _run() {
        await withContext<AppCtx, void>({ user: { id: 'u1' }, locale: 'pt' }, () => {
          const ctx = useContext<AppCtx>()
          const _id: string = ctx.user.id
          const _locale: string = ctx.locale
          _unused(_id); _unused(_locale)

          // @ts-expect-error — campo inexistente
          _unused(ctx.doesNotExist)
        })
      }
      _unused(_run)
    }
    expect(true).toBe(true)
  })

  it('maybeContext retorna undefined-union', () => {
    if (NEVER) {
      const ctx = maybeContext<{ x: number }>()
      // @ts-expect-error — pode ser undefined
      _unused(ctx.x)

      if (ctx) {
        const x: number = ctx.x
        _unused(x)
      }
    }
    expect(true).toBe(true)
  })
})

describe('types: cache', () => {
  it('preserva tipo de retorno', () => {
    if (NEVER) {
      const getUser = cache(async (id: string) => ({ id, name: 'X' }))
      const _typeCheck: Promise<{ id: string; name: string }> = getUser('1')
      _unused(_typeCheck)

      // @ts-expect-error — arg deveria ser string
      getUser(123)
    }
    expect(true).toBe(true)
  })

  it('aceita custom key tipada', () => {
    if (NEVER) {
      const fn = cache(
        async (a: number, b: string) => a + b,
        { key: (a, b) => `${a}:${b}` },
      )
      _unused(fn)

      // @ts-expect-error — opts.key com args mismatched
      cache(async (x: number) => x, { key: (x: string) => x })
    }
    expect(true).toBe(true)
  })
})

describe('types: slots', () => {
  it('SlotComponentProps tipa slots por nome', () => {
    if (NEVER) {
      type CardSlots = 'header' | 'footer'
      const _ok: SlotComponentProps<CardSlots> = {
        slots: { header: 'X', footer: 'Y' },
        children: 'body',
      }
      _unused(_ok)

      const _bad: SlotComponentProps<CardSlots> = {
        slots: {
          // @ts-expect-error — 'aside' não está em CardSlots
          aside: 'x',
        },
      }
      _unused(_bad)
    }
    expect(true).toBe(true)
  })

  it('Slots<Names> aceita só nomes do union', () => {
    if (NEVER) {
      type T = Slots<'a' | 'b'>
      const _x: T = { a: 1, b: 2 }
      _unused(_x)

      // @ts-expect-error — 'c' fora do union
      const _bad: T = { c: 1 }
      _unused(_bad)
    }
    expect(true).toBe(true)
  })
})

describe('types: csrf', () => {
  it('CsrfOptions exige secret + sessionId', () => {
    if (NEVER) {
      async function _run() {
        // @ts-expect-error — falta sessionId
        await csrf.sign({ secret: 'a'.repeat(32) })

        // @ts-expect-error — falta secret
        await csrf.sign({ sessionId: 'u1' })

        // ✅ válido
        await csrf.sign({ secret: 'a'.repeat(32), sessionId: 'u1' })
      }
      _unused(_run)
    }
    expect(true).toBe(true)
  })
})

describe('types: jsx attrs', () => {
  it('hx-swap aceita union types (compile only)', () => {
    if (NEVER) {
      const _div: JSX.IntrinsicElements['div'] = {
        'hx-swap': 'innerHTML',
      }
      _unused(_div)

      const _div2: JSX.IntrinsicElements['div'] = {
        // string custom também válida (StringFallback)
        'hx-swap': 'outerHTML transition:true',
      }
      _unused(_div2)
    }
    expect(true).toBe(true)
  })
})
