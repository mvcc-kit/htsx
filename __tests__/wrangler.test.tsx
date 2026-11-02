// Com o wrangler instalado no projeto: D1, R2 e KV locais de verdade (getPlatformProxy), no mesmo
// app dos testes, sem build. Roda quando HTSX_WRANGLER_NODE_MODULES aponta para um node_modules com
// o wrangler (o htsx não depende dele); senão, pulado.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { cp, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { loadApp, type LoadedApp } from '../project'

const modules = process.env.HTSX_WRANGLER_NODE_MODULES
const SRC = path.join(import.meta.dir, 'fixtures', 'fs-site')
const ROOT = path.join(import.meta.dir, '..', '.cache', 'fs-wrangler')

describe.skipIf(!modules)('wrangler instalado: bindings locais reais', () => {
  let app: LoadedApp
  beforeAll(async () => {
    await rm(ROOT, { recursive: true, force: true })
    await cp(SRC, ROOT, { recursive: true, filter: f => !f.includes(`${path.sep}.htsx`) })
    await symlink(modules!, path.join(ROOT, 'node_modules'))
    app = await loadApp(undefined, ROOT)
    const env = (app.platform as { env: Record<string, any> }).env
    await env.DB.exec('create table if not exists notas (texto text)')
    await env.DB.prepare('insert into notas values (?)').bind('do D1 local').run()
    await env.BUCKET.put('anexo.txt', 'do R2 local')
    await env.KV.put('flag', 'do KV local')
  }, 60_000)
  afterAll(() => app?.close())

  it('usa o wrangler, não só as vars', () => expect(app.platformSource).toBe('wrangler'))

  it('a rota lê D1, R2 e KV reais e grava pelo POST', async () => {
    const post = await app.respond(new Request('http://localhost/api/notas', { method: 'POST', body: JSON.stringify({ texto: 'nova' }), headers: { 'content-type': 'application/json' } }))
    expect(post.status).toBe(201)
    const res = await app.respond(new Request('http://localhost/api/notas'))
    expect(await res.json()).toEqual({ notas: ['do D1 local', 'nova'], anexo: 'do R2 local', flag: 'do KV local' })
  })

  it('vars do wrangler.jsonc', async () => {
    expect(await (await app.respond(new Request('http://localhost/saudacao'))).text()).toContain('Olá do wrangler.jsonc')
  })
})
