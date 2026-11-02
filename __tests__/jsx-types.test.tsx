/**
 * Tipos de JSX: cada `@ts-expect-error` marca o que o compilador DEVE recusar.
 * A validação real é `bunx tsc --noEmit -p .`; os `expect` conferem o HTML.
 */
import { describe, expect, it } from 'bun:test'
import { defineComponent, defineLayout, raw, renderToString, type Children } from '../index'

describe('types: IntrinsicElements', () => {
  it('aceita atributos HTML, hx-*, x-*, $*, aria-* e data-*', async () => {
    const html = await renderToString(() => (
      <form action="/s" method="post" hx-post="/s" hx-vals={{ a: 1 }} x-data="{ open: false }" $submit_prevent="go()">
        <input type="email" name="email" required maxLength={80} aria-invalid={false} data-testid="email" />
        <label htmlFor="email" class="l">E-mail</label>
        <button type="submit" disabled={false}>Enviar</button>
        <svg viewBox="0 0 10 10"><path d="M0 0" fill="none" /></svg>
        <my-widget foo="bar" />
      </form>
    ))
    expect(html).toContain('hx-post="/s"')
    expect(html).toContain('x-on:submit.prevent="go()"')
    expect(html).toContain('aria-invalid="false"')
    expect(html).toContain('<my-widget foo="bar"></my-widget>')
  })

  it('recusa atributo desconhecido, on* e texto comum em <script>', () => {
    const NEVER = false as boolean
    if (NEVER) {
      // @ts-expect-error — erro de digitação
      void (<div clas="x" />)
      // @ts-expect-error — on* é bloqueado; use $click ou hx-on
      void (<a onclick="x()">x</a>)
      // @ts-expect-error — atributo de outro elemento
      void (<div href="/x" />)
      // @ts-expect-error — elemento inexistente
      void (<foo />)
      // @ts-expect-error — texto comum em <script>; use raw()
      void (<script>{'alert(1)'}</script>)
      // @ts-expect-error — objeto não é filho válido
      void (<p>{{ a: 1 }}</p>)
    }
    expect(true).toBe(true)
  })
})

describe('types: Children', () => {
  it('children?: Children dispensa cast', async () => {
    const Card = defineComponent<{ title: string; children?: Children }>(({ title, children }) => (
      <section><h2>{title}</h2>{children}</section>
    ))
    const Layout = defineLayout(({ children }) => <main>{children}</main>)
    const html = await renderToString(() => (
      <Layout><Card title="T">{'a'}{1}<b>x</b>{null}{[<i>y</i>]}</Card></Layout>
    ))
    expect(html).toBe('<main><section><h2>T</h2>a1<b>x</b><i>y</i></section></main>')
  })

  it('<script> e <style> aceitam raw()', async () => {
    expect(await renderToString(() => <script>{raw('a && b')}</script>)).toBe('<script>a && b</script>')
  })
})

describe('runtime automático: key', () => {
  it('key em lista não vira texto nem atributo', async () => {
    expect(await renderToString(() => <ul>{['a', 'b'].map(k => <li key={k}>x</li>)}</ul>)).toBe('<ul><li>x</li><li>x</li></ul>')
  })
})
