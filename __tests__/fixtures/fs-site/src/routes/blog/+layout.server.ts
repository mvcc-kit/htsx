import { error } from 'htsx/app'
import type { LayoutServerLoad } from './$types'

export const load = (async ({ parent, url }) => {
  if (url.searchParams.has('falhar')) error(503, 'Blog fora do ar')
  const { site } = await parent()
  return { secao: `${site} / Blog`, categorias: ['notes', 'guias'] }
}) satisfies LayoutServerLoad
