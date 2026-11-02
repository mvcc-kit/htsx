import { describe, expect, it } from 'bun:test'
import { Form, Field, formContext } from '../src/forms'
import { renderToString } from '../index'
import { jsx } from '../src/jsx-runtime'

const h = jsx

describe('<Form>', () => {
  it('renderiza <form> com action e method', async () => {
    const html = await renderToString(() =>
      Form({ action: '/users', method: 'post', children: 'x' }),
    )
    expect(html).toContain('<form action="/users" method="post">')
    expect(html).toContain('x</form>')
  })

  it('injeta csrf field quando csrf prop fornecido', async () => {
    const html = await renderToString(() =>
      Form({ action: '/u', csrf: 'tok123', children: '' }),
    )
    expect(html).toContain('<input type="hidden" name="_csrf" value="tok123">')
  })

  it('csrf name customizável', async () => {
    const html = await renderToString(() =>
      Form({ csrf: 'tok', csrfName: 'csrf_field', children: '' }),
    )
    expect(html).toContain('name="csrf_field"')
  })

  it('csrf escapa value', async () => {
    const html = await renderToString(() =>
      Form({ csrf: 'a"<script>', children: '' }),
    )
    expect(html).toContain('value="a&quot;&lt;script&gt;"')
  })

  it('method default post', async () => {
    const html = await renderToString(() => Form({ children: '' }))
    expect(html).toContain('method="post"')
  })

  it('children renderizados normalmente', async () => {
    const html = await renderToString(() =>
      Form({ action: '/x', children: h('button', { type: 'submit' }, 'Go') }),
    )
    expect(html).toContain('<button type="submit">Go</button>')
  })
})

describe('<Field>', () => {
  it('renderiza label + input', async () => {
    const html = await renderToString(() =>
      Field({ name: 'email', label: 'Email', type: 'email' }),
    )
    expect(html).toContain('<label for="field-email">Email</label>')
    expect(html).toContain('<input id="field-email" name="email" type="email">')
  })

  it('throw se name vazio', () => {
    expect(() => Field({ name: '' })).toThrow(/name/)
  })

  it('renderiza value', async () => {
    const html = await renderToString(() =>
      Field({ name: 'q', value: 'busca atual' }),
    )
    expect(html).toContain('value="busca atual"')
  })

  it('value escapa XSS', async () => {
    const html = await renderToString(() =>
      Field({ name: 'q', value: '<script>x</script>' }),
    )
    expect(html).toContain('value="&lt;script&gt;x&lt;/script&gt;"')
    expect(html).not.toContain('<script>x')
  })

  it('renderiza error explícito', async () => {
    const html = await renderToString(() =>
      Field({ name: 'email', error: 'inválido' }),
    )
    expect(html).toContain('class="field-error"')
    expect(html).toContain('inválido')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('role="alert"')
  })

  it('error com array usa primeiro', async () => {
    const html = await renderToString(() =>
      Field({ name: 'p', error: ['primeiro', 'segundo'] }),
    )
    expect(html).toContain('>primeiro</span>')
    expect(html).not.toContain('segundo')
  })

  it('required / placeholder / disabled', async () => {
    const html = await renderToString(() =>
      Field({ name: 'x', required: true, placeholder: 'digite', disabled: true }),
    )
    expect(html).toContain('required')
    expect(html).toContain('placeholder="digite"')
    expect(html).toContain('disabled')
  })

  it('label opcional', async () => {
    const html = await renderToString(() =>
      Field({ name: 'x' }),
    )
    expect(html).not.toContain('<label')
  })

  it('error escapa XSS', async () => {
    const html = await renderToString(() =>
      Field({ name: 'x', error: '<img onerror=alert(1)>' }),
    )
    expect(html).toContain('&lt;img onerror=alert(1)&gt;')
    expect(html).not.toContain('<img onerror=')
  })
})

describe('formContext: integração', () => {
  it('Field lê errors do context', async () => {
    const html = await renderToString(
      () => Field({ name: 'email', label: 'Email' }),
      { context: formContext({ errors: { email: 'obrigatório' } }) },
    )
    expect(html).toContain('obrigatório')
  })

  it('Field lê values do context', async () => {
    const html = await renderToString(
      () => Field({ name: 'name', label: 'Nome' }),
      { context: formContext({ values: { name: 'Ana' } }) },
    )
    expect(html).toContain('value="Ana"')
  })

  it('prop sobrescreve context', async () => {
    const html = await renderToString(
      () => Field({ name: 'x', value: 'prop-wins', error: 'prop-err' }),
      { context: formContext({ errors: { x: 'ctx-err' }, values: { x: 'ctx-val' } }) },
    )
    expect(html).toContain('value="prop-wins"')
    expect(html).toContain('prop-err')
    expect(html).not.toContain('ctx-err')
    expect(html).not.toContain('ctx-val')
  })

  it('sem context funciona normal', async () => {
    const html = await renderToString(() => Field({ name: 'x', label: 'X' }))
    expect(html).toContain('<input id="field-x" name="x" type="text">')
  })
})
