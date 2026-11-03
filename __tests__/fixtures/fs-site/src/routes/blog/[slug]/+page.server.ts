import { error, fail } from 'htsx/app'
import type { Actions, PageServerLoad } from './$types'
import { posts } from '../../../posts'

export const load = (async ({ params, parent }) => {
  const { categorias } = await parent()
  const post = posts[params.slug] ?? error(404, `Post "${params.slug}" não existe`)
  return { post, categoria: categorias[0]! }
}) satisfies PageServerLoad

export const actions = {
  comentar: async ({ request }) => {
    const texto = String((await request.formData()).get('texto') ?? '')
    if (!texto) return fail(400, { erro: 'Escreva algo' })
    return { ok: texto }
  },
} satisfies Actions
