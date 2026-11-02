import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { bunAdapter } from '../config'
import { VENDOR_PATH } from '../index'
import { start } from '../project'
import { page } from '../testing'
import config from './fixtures/fs-site/htsx.config'

const ROOT = path.join(import.meta.dir, 'fixtures', 'fs-site')

describe('modo servidor Bun (start)', () => {
  let server: Awaited<ReturnType<typeof start>>
  const url = (p: string) => `http://127.0.0.1:${server.port}${p}`
  beforeAll(async () => { server = await start({ ...config, adapter: bunAdapter({ hostname: '127.0.0.1' }) }, ROOT, { port: 0 }) })
  afterAll(() => server?.stop())

  it('páginas com layouts, locals do cookie e endpoints pelo servidor HTTP', async () => {
    const p = await page(await fetch(url('/blog/ola'), { headers: { cookie: 'user=Rui' } }))
    expect(await p.text('small')).toBe('notas · Rui')
    expect(await (await fetch(url('/api/posts.json'))).json()).toEqual(['ola', 'segundo'])
  })

  it('ação de formulário e CSRF pela origem real', async () => {
    const ok = await fetch(url('/blog/ola?/comentar'), { method: 'POST', body: new URLSearchParams({ texto: 'x' }), headers: { origin: url('') } })
    expect(await (await page(ok)).text('[role=alert]')).toBe('ok: x')
    const evil = await fetch(url('/blog/ola?/comentar'), { method: 'POST', body: new URLSearchParams({ texto: 'x' }), headers: { origin: 'https://mal.com' } })
    expect(evil.status).toBe(403)
  })

  it('vendor com cache immutable; caminho com ../ não sai da pasta', async () => {
    const v = await fetch(url(`${VENDOR_PATH}htmx.min.js`))
    expect(v.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect((await fetch(url('/../package.json'))).status).toBe(404)
    expect((await fetch(url('/%2e%2e/package.json'))).status).toBe(404)
  })
})

describe('dev do modo Cloudflare: event.platform.env vem do wrangler.jsonc', () => {
  let server: Awaited<ReturnType<typeof start>>
  beforeAll(async () => { server = await start(config, ROOT, { port: 0 }) })
  afterAll(() => server?.stop())

  it('vars do wrangler.jsonc; binding sem o wrangler instalado → erro dizendo como resolver', async () => {
    const res = await fetch(`${server.url}api/notas`, { headers: { accept: 'application/json' } })
    expect(res.status).toBe(500)
    expect((await page(await fetch(`${server.url}saudacao`))).text('p')).resolves.toBe('Olá do wrangler.jsonc')
  })
})
