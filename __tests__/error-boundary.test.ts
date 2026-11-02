import { describe, expect, it } from 'bun:test'
import { ErrorBoundary } from '../src/error-boundary'
import { renderToString } from '../index'
import { jsx } from '../src/jsx-runtime'

const h = jsx

describe('ErrorBoundary: happy path', () => {
  it('renderiza children quando não há erro', async () => {
    const html = await renderToString(() =>
      ErrorBoundary({
        fallback: () => h('div', {}, 'fail'),
        children: h('div', {}, 'ok'),
      }),
    )
    expect(html).toBe('<div>ok</div>')
  })

  it('children async resolvido normalmente', async () => {
    const html = await renderToString(() =>
      ErrorBoundary({
        fallback: () => 'fail',
        children: Promise.resolve(h('span', {}, 'async-ok')),
      }),
    )
    expect(html).toBe('<span>async-ok</span>')
  })
})

describe('ErrorBoundary: captura de erros', () => {
  it('throw síncrono cai no fallback', async () => {
    async function Bad(): Promise<string> { throw new Error('boom-sync') }
    const html = await renderToString(() =>
      ErrorBoundary({
        fallback: (err) => h('div', { class: 'err' }, err.message),
        children: h(Bad, {}),
      }),
    )
    expect(html).toBe('<div class="err">boom-sync</div>')
  })

  it('throw async cai no fallback', async () => {
    async function Bad(): Promise<string> {
      await Promise.resolve()
      throw new Error('boom-async')
    }
    const html = await renderToString(() =>
      ErrorBoundary({
        fallback: (err) => `err: ${err.message}`,
        children: h(Bad, {}),
      }),
    )
    expect(html).toContain('err: boom-async')
  })

  it('throw de valor não-Error é convertido', async () => {
    const html = await renderToString(() =>
      ErrorBoundary({
        fallback: (err) => `${err.constructor.name}:${err.message}`,
        children: Promise.reject('string-error'),
      }),
    )
    expect(html).toBe('Error:string-error')
  })
})

describe('ErrorBoundary: onError callback', () => {
  it('onError chamado com Error correto', async () => {
    let captured: Error | null = null
    await renderToString(() =>
      ErrorBoundary({
        onError: (err) => { captured = err },
        fallback: () => 'fb',
        children: Promise.reject(new Error('caught')),
      }),
    )
    expect(captured).toBeInstanceOf(Error)
    expect(captured!.message).toBe('caught')
  })

  it('onError que joga NÃO quebra a recovery', async () => {
    const html = await renderToString(() =>
      ErrorBoundary({
        onError: () => { throw new Error('logger broken') },
        fallback: () => 'safe',
        children: Promise.reject(new Error('orig')),
      }),
    )
    expect(html).toBe('safe')
  })
})

describe('ErrorBoundary: aninhamento', () => {
  it('boundary mais próximo captura', async () => {
    const html = await renderToString(() =>
      ErrorBoundary({
        fallback: () => 'OUTER',
        children: ErrorBoundary({
          fallback: () => 'INNER',
          children: Promise.reject(new Error('x')),
        }),
      }),
    )
    expect(html).toBe('INNER')
  })

  it('erro além do boundary interno propaga pro externo', async () => {
    async function Bad() { throw new Error('escape') }
    const html = await renderToString(() =>
      ErrorBoundary({
        fallback: () => 'OUTER-CAUGHT',
        children: h('div', {}, ErrorBoundary({
          fallback: () => { throw new Error('fallback also broken') },
          children: h(Bad, {}),
        })),
      }),
    )
    // Inner fallback throws → propaga pra outer
    expect(html).toBe('OUTER-CAUGHT')
  })
})

describe('ErrorBoundary: edge cases', () => {
  it('children null/undefined renderiza vazio', async () => {
    const html = await renderToString(() =>
      ErrorBoundary({ fallback: () => 'x', children: null }),
    )
    expect(html).toBe('')
  })

  it('fallback retornando JSX async', async () => {
    async function Slow() {
      await Promise.resolve()
      return h('span', {}, 'recovered')
    }
    const html = await renderToString(() =>
      ErrorBoundary({
        fallback: () => h(Slow, {}),
        children: Promise.reject(new Error('x')),
      }),
    )
    expect(html).toBe('<span>recovered</span>')
  })
})
