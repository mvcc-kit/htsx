import { describe, expect, it } from 'bun:test'
import { slot, type Slots, type SlotComponentProps } from '../src/slots'
import { renderToString } from '../index'
import { jsx } from '../src/jsx-runtime'

const h = jsx

describe('slot helper', () => {
  it('retorna valor quando slot presente', () => {
    expect(slot('header', { header: 'X' })).toBe('X')
  })

  it('retorna fallback quando slot ausente', () => {
    expect(slot('header', {}, 'default')).toBe('default')
  })

  it('retorna fallback null por padrão', () => {
    expect(slot('header', {})).toBeNull()
  })

  it('retorna fallback quando slots undefined', () => {
    expect(slot('header', undefined, 'fb')).toBe('fb')
  })

  it('retorna fallback quando valor é null explícito', () => {
    expect(slot('header', { header: null }, 'fb')).toBe('fb')
  })

  it('valor 0 é retornado (não confunde com falsy)', () => {
    expect(slot('count', { count: 0 }, 'fb')).toBe(0)
  })

  it('valor string vazia é retornado', () => {
    expect(slot('x', { x: '' }, 'fb')).toBe('')
  })
})

describe('slot: integração componente', () => {
  type CardSlots = 'header' | 'footer'
  const Card = ({ slots, children }: SlotComponentProps<CardSlots>) =>
    h('div', { class: 'card' }, [
      slot('header', slots),
      h('div', { class: 'body' }, children),
      slot('footer', slots),
    ])

  it('componente recebe slots tipados', async () => {
    const html = await renderToString(() =>
      h(Card, {
        slots: {
          header: h('h2', {}, 'Título'),
          footer: h('button', {}, 'OK'),
        },
        children: 'corpo',
      } as { slots: Slots<CardSlots>, children?: unknown }),
    )
    expect(html).toContain('<h2>Título</h2>')
    expect(html).toContain('<div class="body">corpo</div>')
    expect(html).toContain('<button>OK</button>')
  })

  it('slots opcionais ausentes renderizam vazio', async () => {
    const html = await renderToString(() =>
      h(Card, { children: 'só corpo' } as never),
    )
    expect(html).toContain('só corpo')
    expect(html).not.toContain('<h2')
    expect(html).not.toContain('<button')
  })

  it('slots com fallback default', async () => {
    const CardWithDefault = ({ slots, children }: SlotComponentProps<'header'>) =>
      h('div', {}, [
        slot('header', slots, h('h2', {}, 'Default Title')),
        children,
      ])

    const html = await renderToString(() =>
      h(CardWithDefault, { children: 'body' } as never),
    )
    expect(html).toContain('<h2>Default Title</h2>')
  })
})
