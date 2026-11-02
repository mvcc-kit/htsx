import { describe, expect, it } from 'bun:test'
import { defineEvents } from '../src/events'
import { htmxResponse } from '../index'

describe('defineEvents: emit', () => {
  const events = defineEvents({
    'todo:created':   (todo: { id: string; title: string }) => todo,
    'cart:updated':   (count: number) => ({ count }),
    'notification':   (msg: string, severity: 'info' | 'error' = 'info') =>
      ({ message: msg, severity }),
    'plain':          () => null,
  })

  it('emit retorna { name: payload }', () => {
    const out = events.emit('cart:updated', 5)
    expect(out).toEqual({ 'cart:updated': { count: 5 } })
  })

  it('emit aplica a função do mapa', () => {
    const out = events.emit('todo:created', { id: '1', title: 'X' })
    expect(out).toEqual({ 'todo:created': { id: '1', title: 'X' } })
  })

  it('emit com múltiplos args', () => {
    const out = events.emit('notification', 'oops', 'error')
    expect(out).toEqual({ 'notification': { message: 'oops', severity: 'error' } })
  })

  it('emit com payload null', () => {
    const out = events.emit('plain')
    expect(out).toEqual({ 'plain': null })
  })
})

describe('defineEvents: emitMany', () => {
  const events = defineEvents({
    'a': (x: number) => x,
    'b': (y: string) => y,
    'c': () => true,
  })

  it('merge de emissões', () => {
    const out = events.emitMany(
      events.emit('a', 1),
      events.emit('b', 'x'),
      events.emit('c'),
    )
    expect(out).toEqual({ a: 1, b: 'x', c: true })
  })

  it('emitMany vazio retorna {}', () => {
    expect(events.emitMany()).toEqual({})
  })

  it('emitMany de um único', () => {
    expect(events.emitMany(events.emit('a', 5))).toEqual({ a: 5 })
  })

  it('emissões depois sobrescrevem antes', () => {
    const out = events.emitMany(
      events.emit('a', 1),
      events.emit('a', 99),
    )
    expect(out).toEqual({ a: 99 })
  })
})

describe('defineEvents: validação (segurança)', () => {
  it('throw na definição se nome inválido', () => {
    expect(() => defineEvents({ 'bad name': () => 0 })).toThrow(/inválido/)
    expect(() => defineEvents({ '1bad': () => 0 })).toThrow(/inválido/)
    expect(() => defineEvents({ 'a"b': () => 0 })).toThrow(/inválido/)
    expect(() => defineEvents({ 'a;b': () => 0 })).toThrow(/inválido/)
  })

  it('aceita nomes com : e -', () => {
    expect(() => defineEvents({ 'a:b-c': () => 0 })).not.toThrow()
  })

  it('emit com nome não registrado throw', () => {
    const e = defineEvents({ 'a': () => 0 })
    // @ts-expect-error — TS bloqueia, mas testamos runtime
    expect(() => e.emit('zzz')).toThrow(/não registrado/)
  })

  it('names expõe lista', () => {
    const e = defineEvents({ 'a:b': () => 0, 'c': () => 0 })
    expect(e.names.sort()).toEqual(['a:b', 'c'])
  })
})

describe('defineEvents: integração com htmxResponse', () => {
  const events = defineEvents({
    'todo:created': (id: string) => ({ id }),
    'refresh':      () => null,
  })

  it('payload vira HX-Trigger header (JSON)', async () => {
    const r = await htmxResponse(
      () => '<div>ok</div>',
      { trigger: events.emit('todo:created', 'abc') },
    )
    expect(r.headers.get('HX-Trigger')).toBe('{"todo:created":{"id":"abc"}}')
  })

  it('emitMany serializa múltiplos eventos no mesmo header', async () => {
    const r = await htmxResponse(
      () => '<div>ok</div>',
      {
        trigger: events.emitMany(
          events.emit('todo:created', 'a'),
          events.emit('refresh'),
        ),
      },
    )
    const header = JSON.parse(r.headers.get('HX-Trigger')!)
    expect(header).toEqual({ 'todo:created': { id: 'a' }, 'refresh': null })
  })
})
