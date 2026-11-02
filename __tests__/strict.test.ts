import { describe, expect, it } from 'bun:test'
import { jsx as h, raw } from '../src/jsx-runtime'
import { isStrict } from '../src/strict'
import { semModoEstrito } from './setup'

describe('modo estrito (HTSX_STRICT=1, ligado nos testes)', () => {
  it('está ligado', () => expect(isStrict()).toBe(true))

  it('Date como filho → erro com correção', () =>
    expect(() => h('p', {}, new Date(0))).toThrow(/htsx: filho do tipo Date em <p>.*toLocaleDateString/))

  it('objeto como filho → erro', () =>
    expect(() => h('p', {}, { a: 1 })).toThrow(/htsx: filho do tipo objeto \(Object\) em <p>.*JSON\.stringify/))

  it('bigint como filho → erro', () =>
    expect(() => h('p', {}, 10n)).toThrow(/htsx: filho do tipo bigint em <p>.*String\(valor\)/))

  it('função como filho → erro', () =>
    expect(() => h('p', {}, () => 1)).toThrow(/htsx: filho do tipo function/))

  it('objeto devolvido por componente → erro', () =>
    expect(() => h(() => ({ a: 1 }), {})).toThrow(/htsx: filho do tipo objeto .* em <componente>/))

  it('Promise que resolve objeto → rejeita', async () => {
    await expect(h('p', {}, Promise.resolve({ a: 1 })) as Promise<unknown>).rejects.toThrow(/htsx: filho do tipo objeto/)
  })

  it('onclick → erro com $click e hx-on', () =>
    expect(() => h('a', { onclick: 'x()' })).toThrow('htsx: atributo "onclick" bloqueado em <a>; use $click (Alpine) ou hx-on:click'))

  it('nome de atributo inválido → erro', () =>
    expect(() => h('div', { 'a b': '1' })).toThrow(/htsx: nome de atributo inválido "a b" em <div>/))

  it('URL perigosa → erro em vez de "#"', () =>
    expect(() => h('a', { href: 'javascript:alert(1)' })).toThrow(/htsx: URL "javascript:alert\(1\)" em href de <a> foi trocada por "#"/))

  it('propriedade CSS inválida → erro', () =>
    expect(() => h('p', { style: { 'a;b': 'x' } })).toThrow(/htsx: propriedade CSS inválida "a;b" em style de <p>/))

  it('valor CSS com < ou > → erro', () =>
    expect(() => h('p', { style: { color: 'red<' } })).toThrow(/htsx: valor CSS "red<" em style de <p> tem < ou >/))

  it('valores válidos seguem sem erro', () => {
    expect(String(h('a', { href: '#', $click: 'x()' }, 'ok', 1, null, false, raw('<b/>'))))
      .toBe('<a href="#" x-on:click="x()">ok1<b/></a>')
  })
})

describe('fora do modo estrito: comportamento seguro, sem erro', () => {
  semModoEstrito()

  it('está desligado', () => expect(isStrict()).toBe(false))

  it('Date, objeto e bigint somem; on* some; URL vira #', () => {
    expect(String(h('p', {}, new Date(0), { a: 1 }, 10n))).toBe('<p></p>')
    expect(String(h('a', { onclick: 'x', href: 'javascript:x' }))).toBe('<a href="#"></a>')
  })
})
