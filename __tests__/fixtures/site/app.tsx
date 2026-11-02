// Lógica do app: rotas, dados e páginas. Não sabe em que plataforma roda.
import { defineApp, error, fail, redirect, route, type Route } from '../../../app'
import { cloudflarePlatform } from '../../../adapter-cloudflare'
import { head, raw, VENDOR_PATH, type Children } from '../../../index'

const posts: Record<string, { titulo: string; texto: string }> = {
  ola: { titulo: 'Olá', texto: 'Primeiro post' },
  'segundo-post': { titulo: 'Segundo', texto: 'Outro <texto>' },
}

const Layout = ({ children }: { children?: Children }) => (
  <html lang="pt-br">
    <head>{raw(head({ title: 'Site', htmx: true, vendor: VENDOR_PATH }))}</head>
    <body><nav><a href="/">Início</a> <a href="/blog">Blog</a> <a href="/sobre">Sobre</a></nav>{children}</body>
  </html>
)

/** Rotas que viram arquivo nos dois modos. */
export const staticRoutes: Route[] = [
  route('/', { page: () => <h1>Início</h1> }),
  route('/sobre', { page: () => <h1>Sobre</h1> }),
  route('/blog', { page: () => <ul>{Object.entries(posts).map(([slug, p]) => <li><a href={`/blog/${slug}`}>{p.titulo}</a></li>)}</ul> }),
  route('/blog/[slug]', {
    load: ({ params }) => posts[params.slug] ?? error(404, 'Post não existe'),
    page: ({ data }) => <article><h1>{data.titulo}</h1><p>{data.texto}</p></article>,
  }),
  route('/feed.xml', { GET: () => new Response(`<rss>${Object.keys(posts).length}</rss>`, { headers: { 'content-type': 'application/rss+xml' } }) }),
  route('/antigo', { load: () => redirect(308, '/sobre'), page: () => null }),
]

export const staticApp = defineApp({ layout: Layout, prerender: true, routes: staticRoutes })

/** Mesmo site + rotas que precisam de servidor (só no modo Cloudflare). */
export const workerApp = defineApp({
  layout: Layout,
  prerender: true,
  routes: [
    ...staticRoutes,
    route('/ola', {
      prerender: false,
      load: event => {
        const { env, ctx } = cloudflarePlatform<{ SAUDACAO: string }>(event)
        ctx.waitUntil(Promise.resolve('log'))
        return env.SAUDACAO
      },
      page: ({ data }) => <p>{data}</p>,
    }),
    route('/contato', {
      prerender: false,
      actions: {
        default: async ({ request }) => {
          const email = String((await request.formData()).get('email') ?? '')
          return email.includes('@') ? { ok: true as const } : fail(400, { erro: 'E-mail inválido' })
        },
      },
      page: ({ form }) => <form method="post">{form && 'erro' in form ? <p role="alert">{form.erro}</p> : form ? <p>Recebido</p> : null}</form>,
    }),
  ],
})
