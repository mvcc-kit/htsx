import { describe, expect, it } from 'bun:test'
import { sseEvent, sseResponse } from '../src/sse'

describe('sseEvent: formato', () => {
  it('formato mínimo com data string', () => {
    expect(sseEvent('hello')).toBe('event: message\ndata: hello\n\n')
  })

  it('formato com nome custom', () => {
    expect(sseEvent('x', { name: 'progress' }))
      .toBe('event: progress\ndata: x\n\n')
  })

  it('object data vira JSON', () => {
    expect(sseEvent({ percent: 50 }, { name: 'p' }))
      .toBe('event: p\ndata: {"percent":50}\n\n')
  })

  it('multiline data vira múltiplas linhas data:', () => {
    expect(sseEvent('line1\nline2\nline3', { name: 'log' }))
      .toBe('event: log\ndata: line1\ndata: line2\ndata: line3\n\n')
  })

  it('com id', () => {
    expect(sseEvent('x', { name: 'm', id: '42' }))
      .toBe('id: 42\nevent: m\ndata: x\n\n')
  })

  it('com retry', () => {
    expect(sseEvent('x', { name: 'm', retry: 5000 }))
      .toContain('retry: 5000')
  })

  it('com tudo junto', () => {
    const out = sseEvent({ a: 1 }, { name: 'tick', id: 'i1', retry: 1000 })
    expect(out).toBe('id: i1\nretry: 1000\nevent: tick\ndata: {"a":1}\n\n')
  })
})

describe('sseEvent: validação', () => {
  it('throw em nome inválido', () => {
    expect(() => sseEvent('x', { name: 'a b' })).toThrow(/inválido/)
    expect(() => sseEvent('x', { name: '1bad' })).toThrow(/inválido/)
    expect(() => sseEvent('x', { name: 'a"b' })).toThrow(/inválido/)
  })

  it('throw em id com newline (injection)', () => {
    expect(() => sseEvent('x', { id: 'a\nb' })).toThrow(/newline/)
    expect(() => sseEvent('x', { id: 'a\rb' })).toThrow(/newline/)
  })

  it('throw em retry negativo / NaN', () => {
    expect(() => sseEvent('x', { retry: -1 })).toThrow()
    expect(() => sseEvent('x', { retry: NaN })).toThrow()
    expect(() => sseEvent('x', { retry: Infinity })).toThrow()
  })

  it('id 0 é falsy mas válido se string "0"', () => {
    expect(() => sseEvent('x', { id: '0' })).not.toThrow()
    expect(sseEvent('x', { id: '0' })).toContain('id: 0')
  })
})

describe('sseResponse', () => {
  async function* simple() {
    yield sseEvent('a', { name: 'tick' })
    yield sseEvent('b', { name: 'tick' })
  }

  it('retorna Response com Content-Type correto', () => {
    const r = sseResponse(simple)
    expect(r.headers.get('Content-Type')).toBe('text/event-stream')
    expect(r.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('stream emite todos os chunks em ordem', async () => {
    const r = sseResponse(simple)
    const text = await r.text()
    expect(text).toBe('event: tick\ndata: a\n\nevent: tick\ndata: b\n\n')
  })

  it('headers customizados são mesclados', () => {
    const r = sseResponse(simple, { headers: { 'X-Custom': 'val' } })
    expect(r.headers.get('X-Custom')).toBe('val')
  })

  it('generator vazio retorna response válida', async () => {
    async function* empty() { /* no yields */ }
    const r = sseResponse(empty)
    expect(await r.text()).toBe('')
  })

  it('erro no generator propaga via controller.error', async () => {
    async function* bad(): AsyncGenerator<string> {
      yield sseEvent('ok')
      throw new Error('boom')
    }
    const r = sseResponse(bad)
    let caught: unknown = null
    try {
      const reader = r.body!.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    } catch (e) {
      caught = e
    }
    expect(caught).toBeTruthy()
  })

  it('abort signal interrompe o stream', async () => {
    const controller = new AbortController()
    let yielded = 0
    async function* infinite() {
      while (true) {
        yielded++
        yield sseEvent(String(yielded))
        await new Promise(r => setTimeout(r, 5))
      }
    }
    const r = sseResponse(infinite, { signal: controller.signal })
    setTimeout(() => controller.abort(), 30)
    const text = await r.text()
    expect(text.length).toBeGreaterThan(0)
    expect(yielded).toBeLessThan(1000) // não rodou pra sempre
  })
})
