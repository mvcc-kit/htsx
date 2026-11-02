import { describe, expect, it } from 'bun:test'
import {
  isHtmx, isBoosted, hxTarget, hxTrigger, hxTriggerName,
  hxCurrentUrl, hxPrompt, isHistoryRestore,
} from '../src/htmx-detect'

const req = (h: Record<string, string>) =>
  new Request('http://x', { headers: h })

const headers = (h: Record<string, string>) => new Headers(h)

describe('htmx-detect: isHtmx', () => {
  it('true quando HX-Request: true', () => {
    expect(isHtmx(req({ 'HX-Request': 'true' }))).toBe(true)
  })
  it('false quando ausente', () => {
    expect(isHtmx(req({}))).toBe(false)
  })
  it('false quando valor diferente', () => {
    expect(isHtmx(req({ 'HX-Request': 'false' }))).toBe(false)
  })
  it('aceita Headers direto', () => {
    expect(isHtmx(headers({ 'HX-Request': 'true' }))).toBe(true)
  })
  it('aceita objeto duck-typed { headers: Headers }', () => {
    expect(isHtmx({ headers: headers({ 'HX-Request': 'true' }) })).toBe(true)
  })
  it('aceita objeto duck-typed { headers: plain }', () => {
    expect(isHtmx({ headers: { 'HX-Request': 'true' } } as never)).toBe(true)
  })
  it('headers case-insensitive (padrão Web)', () => {
    expect(isHtmx(req({ 'hx-request': 'true' }))).toBe(true)
    expect(isHtmx(req({ 'HX-REQUEST': 'true' }))).toBe(true)
  })
})

describe('htmx-detect: isBoosted', () => {
  it('true quando HX-Boosted: true', () => {
    expect(isBoosted(req({ 'HX-Boosted': 'true' }))).toBe(true)
  })
  it('false ausente', () => {
    expect(isBoosted(req({}))).toBe(false)
  })
})

describe('htmx-detect: hxTarget', () => {
  it('retorna valor quando presente', () => {
    expect(hxTarget(req({ 'HX-Target': 'main-content' }))).toBe('main-content')
  })
  it('null quando ausente', () => {
    expect(hxTarget(req({}))).toBeNull()
  })
})

describe('htmx-detect: hxTrigger / hxTriggerName', () => {
  it('hxTrigger retorna ID do elemento', () => {
    expect(hxTrigger(req({ 'HX-Trigger': 'btn-save' }))).toBe('btn-save')
  })
  it('hxTriggerName retorna name attribute', () => {
    expect(hxTriggerName(req({ 'HX-Trigger-Name': 'submit-btn' }))).toBe('submit-btn')
  })
  it('ambos null ausentes', () => {
    expect(hxTrigger(req({}))).toBeNull()
    expect(hxTriggerName(req({}))).toBeNull()
  })
})

describe('htmx-detect: hxCurrentUrl / hxPrompt', () => {
  it('hxCurrentUrl retorna URL', () => {
    expect(hxCurrentUrl(req({ 'HX-Current-URL': 'http://x/page' })))
      .toBe('http://x/page')
  })
  it('hxPrompt retorna texto digitado', () => {
    expect(hxPrompt(req({ 'HX-Prompt': 'minha resposta' }))).toBe('minha resposta')
  })
})

describe('htmx-detect: isHistoryRestore', () => {
  it('true quando HX-History-Restore-Request: true', () => {
    expect(isHistoryRestore(req({ 'HX-History-Restore-Request': 'true' }))).toBe(true)
  })
  it('false ausente', () => {
    expect(isHistoryRestore(req({}))).toBe(false)
  })
})

describe('htmx-detect: combinação realista', () => {
  it('boosted + htmx + target juntos', () => {
    const r = req({
      'HX-Request':  'true',
      'HX-Boosted':  'true',
      'HX-Target':   'main',
      'HX-Trigger':  'nav-link-1',
    })
    expect(isHtmx(r)).toBe(true)
    expect(isBoosted(r)).toBe(true)
    expect(hxTarget(r)).toBe('main')
    expect(hxTrigger(r)).toBe('nav-link-1')
  })

  it('argumento inválido throw', () => {
    expect(() => isHtmx({ headers: null } as never)).toThrow()
    expect(() => isHtmx(null as never)).toThrow()
  })
})
