// `main` do wrangler: recebe tudo antes das rotas, que vêm geradas em `.htsx/server.ts`.
import { routes } from '../.htsx/server'

export class Contador {
  private n = 0
  constructor(_state: unknown, _env: unknown) {}
  async fetch(): Promise<Response> { return new Response(String(++this.n)) }
}

export default {
  fetch(request: Request, env: object, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> | Response {
    const { pathname } = new URL(request.url)
    if (pathname === '/health') return new Response('ok')
    return routes.fetch(request, env, ctx, { locals: request.headers.has('x-from-server') ? { user: 'servidor' } : undefined })
  },
  async scheduled(_controller: unknown, env: { LOG?: string[] }) { env.LOG?.push('scheduled') },
}
