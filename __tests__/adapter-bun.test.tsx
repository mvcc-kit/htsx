import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { bunAdapter, cloudflareAdapter } from '../config'
import { VENDOR_PATH } from '../index'
import { start } from '../project'
import { page } from '../testing'
import config from './fixtures/fs-site/htsx.config'

const ROOT = path.join(import.meta.dir, 'fixtures', 'fs-site')

describe('modo servidor Bun (start)', () => {
  let server: Awaited<ReturnType<typeof start>>
  const url = (p: string) => `http://127.0.0.1:${server.port}${p}`
  beforeAll(async () => { server = await start({ ...config, adapter: bunAdapter({ hostname: '127.0.0.1' }) }, ROOT, { port: 0 }) })
  afterAll(() => server?.stop(true))

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

describe('dev do modo Cloudflare: event.platform.env vem do devEnv', () => {
  let server: Awaited<ReturnType<typeof start>>
  const devEnv = {
    DB: { prepare: () => ({ bind: () => ({ run: async () => {} }), all: async () => ({ results: [{ texto: 'do dev' }] }) }) },
    BUCKET: { get: async () => null, put: async () => {} },
    KV: { get: async () => 'dev' },
  }
  beforeAll(async () => { server = await start({ ...config, adapter: cloudflareAdapter({ devEnv }) }, ROOT, { port: 0 }) })
  afterAll(() => server?.stop(true))

  it('a mesma rota que usa D1/R2/KV roda no dev com os bindings do devEnv', async () => {
    const res = await fetch(`http://${server.hostname}:${server.port}/api/notas`)
    expect(await res.json()).toEqual({ notas: ['do dev'], flag: 'dev' })
  })
})
