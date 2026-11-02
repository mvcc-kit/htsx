import { describe, expect, it } from 'bun:test'
import { renderToString } from '@repo/htsx'
import { page } from '@repo/htsx/testing'
import { Badge, Button, Field, Panel, tokens, uiCss } from '../index'

describe('@repo/htsx-ui', () => {
  it('uiCss define todos os tokens no :root', () => {
    for (const [k, v] of Object.entries(tokens)) expect(uiCss).toContain(`${k}:${v}`)
  })

  it('Button: variante e attrs htmx/Alpine', async () => {
    const html = await renderToString(() => <Button variant="primary" hx-post="/x" $click="n++">Ok</Button>)
    expect(html).toBe('<button type="button" class="ui-btn ui-btn-primary" hx-post="/x" x-on:click="n++">Ok</button>')
  })

  it('Field: estilo ui-field com o erro acessível do núcleo', async () => {
    const p = await page(await renderToString(() => <Field name="email" label="E-mail" error="Inválido" />))
    expect(await p.attr('div', 'class')).toBe('ui-field')
    expect(await p.attr('input', 'aria-invalid')).toBe('true')
    expect(await p.text('[role=alert]')).toBe('Inválido')
  })

  it('Panel e Badge', async () => {
    const html = await renderToString(() => <Panel eyebrow="E" title="T"><Badge tone="success">ok</Badge></Panel>)
    expect(html).toBe('<section class="ui-panel"><header><p>E</p><h2>T</h2></header><div><span class="ui-badge ui-badge-success">ok</span></div></section>')
  })

  it('texto do usuário segue escapado', async () => {
    expect(await renderToString(() => <Badge>{'<b>'}</Badge>)).toBe('<span class="ui-badge">&lt;b&gt;</span>')
  })
})
