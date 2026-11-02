// D1, R2 e KV pelo env do Worker (tipos mínimos aqui; num app use `wrangler types`)
import { cloudflarePlatform } from '@repo/htsx/adapter-cloudflare'
import type { RequestHandler } from './$types'

interface Env {
  DB: { prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<unknown> }; all<T>(): Promise<{ results: T[] }> } }
  BUCKET: { put(key: string, value: string): Promise<unknown>; get(key: string): Promise<{ text(): Promise<string> } | null> }
  KV: { get(key: string): Promise<string | null> }
}

export const GET = (async event => {
  const { env } = cloudflarePlatform<Env>(event)
  const { results } = await env.DB.prepare('select texto from notas').all<{ texto: string }>()
  const anexo = await env.BUCKET.get('anexo.txt')
  return Response.json({ notas: results.map(r => r.texto), anexo: await anexo?.text(), flag: await env.KV.get('flag') })
}) satisfies RequestHandler

export const POST = (async event => {
  const { env, ctx } = cloudflarePlatform<Env>(event)
  const { texto } = await event.request.json() as { texto: string }
  await env.DB.prepare('insert into notas (texto) values (?)').bind(texto).run()
  ctx.waitUntil(env.BUCKET.put('ultima.txt', texto))
  return Response.json({ ok: true }, { status: 201 })
}) satisfies RequestHandler
