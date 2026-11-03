import { describe, expect, it } from 'bun:test'
import { serializeAttrs } from '../src/attrs'
import { withoutStrictMode } from './setup'

// helper: get the attrs string trimmed (serializeAttrs returns " key=val ...")
const attrs = (props: Record<string, unknown>) => serializeAttrs(props).trim()

describe('$event → x-on:event', () => {
  it('$click → x-on:click', () =>
    expect(attrs({ $click: 'count++' })).toBe('x-on:click="count++"'))
  it('$click_prevent → x-on:click.prevent', () =>
    expect(attrs({ $click_prevent: 'fn()' })).toBe('x-on:click.prevent="fn()"'))
  it('$click_stop → x-on:click.stop', () =>
    expect(attrs({ $click_stop: 'fn()' })).toBe('x-on:click.stop="fn()"'))
  it('$click_outside → x-on:click.outside', () =>
    expect(attrs({ $click_outside: "open=false" })).toBe('x-on:click.outside="open=false"'))
  it('$keydown_enter → x-on:keydown.enter', () =>
    expect(attrs({ $keydown_enter: 'fn()' })).toBe('x-on:keydown.enter="fn()"'))
  it('$keydown_ctrl_enter → x-on:keydown.ctrl.enter', () =>
    expect(attrs({ $keydown_ctrl_enter: 'fn()' })).toBe('x-on:keydown.ctrl.enter="fn()"'))
  it('$click_debounce_300ms → x-on:click.debounce.300ms', () =>
    expect(attrs({ $click_debounce_300ms: 'fn()' })).toBe('x-on:click.debounce.300ms="fn()"'))
  it('$submit_prevent → x-on:submit.prevent', () =>
    expect(attrs({ $submit_prevent: 'fn()' })).toBe('x-on:submit.prevent="fn()"'))
  it('$input → x-on:input', () =>
    expect(attrs({ $input: 'fn()' })).toBe('x-on:input="fn()"'))
  it('$keydown_shift_enter → x-on:keydown.shift.enter', () =>
    expect(attrs({ $keydown_shift_enter: 'fn()' })).toBe('x-on:keydown.shift.enter="fn()"'))
})

describe('x-bind-* → x-bind:*', () => {
  it('x-bind-class → x-bind:class', () =>
    expect(attrs({ 'x-bind-class': 'expr' })).toBe('x-bind:class="expr"'))
  it('x-bind-style → x-bind:style', () =>
    expect(attrs({ 'x-bind-style': 'expr' })).toBe('x-bind:style="expr"'))
  it('x-bind-disabled → x-bind:disabled', () =>
    expect(attrs({ 'x-bind-disabled': 'loading' })).toBe('x-bind:disabled="loading"'))
  it('x-bind-aria-label → x-bind:aria-label (preserva hifens)', () =>
    expect(attrs({ 'x-bind-aria-label': 'msg' })).toBe('x-bind:aria-label="msg"'))
  it('x-bind-aria-expanded → x-bind:aria-expanded', () =>
    expect(attrs({ 'x-bind-aria-expanded': 'open' })).toBe('x-bind:aria-expanded="open"'))
})

describe('x-*_* → x-*.* (modificadores)', () => {
  it('x-model_lazy → x-model.lazy', () =>
    expect(attrs({ 'x-model_lazy': 'val' })).toBe('x-model.lazy="val"'))
  it('x-model_number → x-model.number', () =>
    expect(attrs({ 'x-model_number': 'val' })).toBe('x-model.number="val"'))
  it('x-model_debounce_300ms → x-model.debounce.300ms', () =>
    expect(attrs({ 'x-model_debounce_300ms': 'v' })).toBe('x-model.debounce.300ms="v"'))
  it('x-transition_enter → x-transition.enter', () =>
    expect(attrs({ 'x-transition_enter': 'cls' })).toBe('x-transition.enter="cls"'))
  it('x-transition_leave → x-transition.leave', () =>
    expect(attrs({ 'x-transition_leave': 'cls' })).toBe('x-transition.leave="cls"'))
  it('x-transition_enter_active → x-transition.enter.active', () =>
    expect(attrs({ 'x-transition_enter_active': 'cls' })).toBe('x-transition.enter.active="cls"'))
  it('x-intersect_enter → x-intersect.enter', () =>
    expect(attrs({ 'x-intersect_enter': 'fn()' })).toBe('x-intersect.enter="fn()"'))
})

describe('aliases JSX → HTML', () => {
  it('className → class', () =>
    expect(attrs({ className: 'btn' })).toBe('class="btn"'))
  it('htmlFor → for', () =>
    expect(attrs({ htmlFor: 'email' })).toBe('for="email"'))
  it('tabIndex → tabindex', () =>
    expect(attrs({ tabIndex: 0 })).toBe('tabindex="0"'))
  it('readOnly → readonly', () =>
    expect(attrs({ readOnly: true })).toBe('readonly'))
  it('maxLength → maxlength', () =>
    expect(attrs({ maxLength: 10 })).toBe('maxlength="10"'))
  it('minLength → minlength', () =>
    expect(attrs({ minLength: 3 })).toBe('minlength="3"'))
  it('autoFocus → autofocus', () =>
    expect(attrs({ autoFocus: true })).toBe('autofocus'))
  it('charSet → charset', () =>
    expect(attrs({ charSet: 'UTF-8' })).toBe('charset="UTF-8"'))
  it('httpEquiv → http-equiv', () =>
    expect(attrs({ httpEquiv: 'refresh' })).toBe('http-equiv="refresh"'))
  it('colSpan → colspan', () =>
    expect(attrs({ colSpan: 2 })).toBe('colspan="2"'))
  it('rowSpan → rowspan', () =>
    expect(attrs({ rowSpan: 2 })).toBe('rowspan="2"'))
  it('noValidate → novalidate', () =>
    expect(attrs({ noValidate: true })).toBe('novalidate'))
  it('encType → enctype', () =>
    expect(attrs({ encType: 'multipart/form-data' })).toBe('enctype="multipart/form-data"'))
  it('autoComplete → autocomplete', () =>
    expect(attrs({ autoComplete: 'off' })).toBe('autocomplete="off"'))
  it('inputMode → inputmode', () =>
    expect(attrs({ inputMode: 'numeric' })).toBe('inputmode="numeric"'))
  it('crossOrigin → crossorigin', () =>
    expect(attrs({ crossOrigin: 'anonymous' })).toBe('crossorigin="anonymous"'))
})

describe('boolean attrs', () => {
  it('HTML true → emite só o nome (booleano)', () =>
    expect(attrs({ disabled: true })).toBe('disabled'))
  it('x-cloak={true} → x-cloak (booleano Alpine)', () =>
    expect(attrs({ 'x-cloak': true })).toBe('x-cloak'))
  it('hx-boost={true} → hx-boost="true" (string HTMX)', () =>
    expect(attrs({ 'hx-boost': true })).toBe('hx-boost="true"'))
  it('hx-push-url={true} → hx-push-url="true"', () =>
    expect(attrs({ 'hx-push-url': true })).toBe('hx-push-url="true"'))
  it('hx-history-elt={true} → hx-history-elt="true"', () =>
    expect(attrs({ 'hx-history-elt': true })).toBe('hx-history-elt="true"'))
  it('value=false → omite', () =>
    expect(attrs({ disabled: false })).toBe(''))
  it('value=null → omite', () =>
    expect(attrs({ id: null })).toBe(''))
  it('value=undefined → omite', () =>
    expect(attrs({ id: undefined })).toBe(''))
})

describe('key prop → ignorado', () => {
  it('key nunca aparece no HTML', () => {
    const out = attrs({ key: 'abc', class: 'item' })
    expect(out).not.toContain('key=')
    expect(out).toBe('class="item"')
  })
})

describe('hx-on-htmx-* → hx-on::*', () => {
  it('hx-on-htmx-after-swap → hx-on::after-swap', () =>
    expect(attrs({ 'hx-on-htmx-after-swap': 'loading = false' })).toBe('hx-on::after-swap="loading = false"'))
  it('hx-on-htmx-before-request → hx-on::before-request', () =>
    expect(attrs({ 'hx-on-htmx-before-request': 'startLoading()' })).toBe('hx-on::before-request="startLoading()"'))
  it('hx-on-htmx-after-request → hx-on::after-request', () =>
    expect(attrs({ 'hx-on-htmx-after-request': 'done()' })).toBe('hx-on::after-request="done()"'))
})

describe('style object → CSS string', () => {
  it('camelCase → kebab-case', () =>
    expect(attrs({ style: { backgroundColor: '#fff' } })).toBe('style="background-color: #fff;"'))
  it('múltiplas propriedades joinadas com ;', () => {
    const out = attrs({ style: { fontSize: '14px', marginTop: '8px' } })
    expect(out).toContain('font-size: 14px')
    expect(out).toContain('margin-top: 8px')
  })
  it('valor numérico (ex: zIndex)', () =>
    expect(attrs({ style: { zIndex: 10 } })).toBe('style="z-index: 10;"'))
  describe('fora do modo estrito', () => {
    withoutStrictMode()
    it('remove < e > do valor CSS', () => {
      const out = attrs({ style: { color: 'red</style>' } })
      expect(out).not.toContain('</style>')
    })
  })
})

describe('hx-headers / hx-vals / hx-request → JSON aspas simples', () => {
  it('hx-headers com objeto → JSON', () => {
    const out = attrs({ 'hx-headers': { 'X-CSRF-TOKEN': 'abc' } })
    expect(out).toContain("hx-headers='")
    expect(out).toContain('"X-CSRF-TOKEN"')
  })
  it('hx-vals com múltiplos campos', () => {
    const out = attrs({ 'hx-vals': { page: 1, filter: 'active' } })
    expect(out).toContain("hx-vals='")
    expect(out).toContain('"page":1')
    expect(out).toContain('"filter":"active"')
  })
  it('hx-request com opções', () => {
    const out = attrs({ 'hx-request': { timeout: 5000 } })
    expect(out).toContain("hx-request='")
    expect(out).toContain('"timeout":5000')
  })
  it('array value → JSON aspas simples', () => {
    const out = attrs({ 'x-id': ['uid', 'modal'] })
    expect(out).toContain("x-id='")
    expect(out).toContain('"uid"')
    expect(out).toContain('"modal"')
  })
  it('x-data com objeto → JSON aspas simples', () => {
    const out = attrs({ 'x-data': { open: false, count: 0 } })
    expect(out).toContain("x-data='")
    expect(out).toContain('"open":false')
  })
})

describe('segurança: bloqueio de on* handlers', () => {
  withoutStrictMode()
  it('onclick bloqueado', () =>
    expect(attrs({ onclick: 'alert(1)' })).toBe(''))
  it('onload bloqueado', () =>
    expect(attrs({ onload: 'alert(1)' })).toBe(''))
  it('onerror bloqueado', () =>
    expect(attrs({ onerror: 'alert(1)' })).toBe(''))
  it('onmouseover bloqueado', () =>
    expect(attrs({ onmouseover: 'alert(1)' })).toBe(''))
  it('nomes inválidos descartados silenciosamente', () => {
    const out = attrs({ 'bad name': '1', '"><img': '1' })
    expect(out).toBe('')
  })
})

describe('atributos Alpine e HTMX passam direto', () => {
  it('x-data passa direto', () =>
    expect(attrs({ 'x-data': '{ open: false }' })).toBe("x-data=\"{ open: false }\""))
  it('x-show passa direto', () =>
    expect(attrs({ 'x-show': 'open' })).toBe('x-show="open"'))
  it('hx-get passa direto', () =>
    expect(attrs({ 'hx-get': '/api/data' })).toBe('hx-get="/api/data"'))
  it('hx-swap passa direto', () =>
    expect(attrs({ 'hx-swap': 'outerHTML swap:300ms' })).toBe('hx-swap="outerHTML swap:300ms"'))
  it('hx-trigger passa direto', () =>
    expect(attrs({ 'hx-trigger': 'click changed delay:500ms' })).toBe('hx-trigger="click changed delay:500ms"'))
})
