import type { LayoutServerLoad } from './$types'

export const load = (async ({ parent }) => {
  const { site } = await parent()
  return { secao: `${site} / Blog`, categorias: ['notas', 'guias'] }
}) satisfies LayoutServerLoad
